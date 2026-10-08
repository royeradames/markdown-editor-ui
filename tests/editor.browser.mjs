import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdir } from "node:fs/promises";
import { exampleLibrary } from "../lib/examples.ts";
import { STORAGE_KEY } from "../lib/browser-storage.ts";

const target = new URL(process.env.MARKDOWN_EDITOR_URL ?? "http://127.0.0.1:4394");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "This fixture is local-only; hosted transport requires separate exact-origin authorization.");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
let browser;
before(async () => { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true }); });
after(async () => { await browser?.close(); });
async function fixture(run, setup = null, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  const errors = []; const externalRequests = [];
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== target.origin) { externalRequests.push(route.request().url()); await route.abort(); return; }
    await route.continue();
  });
  try {
    if (setup) await context.addInitScript(setup);
    const page = await context.newPage(); page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(target.href); await page.getByRole("button", { name: "Save changes", exact: true }).waitFor();
    if (options.javaScriptEnabled !== false) await page.getByRole("button", { name: "Save changes", exact: true }).isEnabled().then(async () => {
      await page.waitForFunction(() => !document.querySelector(".document-actions .primary")?.disabled);
    });
    await run(page, context);
    assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  } finally { await context.close(); }
}
async function save(page) {
  const previous = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(({ key, previous }) => localStorage.getItem(key) !== previous, { key: STORAGE_KEY, previous });
  await page.getByText("Saved in this browser.", { exact: true }).waitFor();
}
async function newDocument(page, name, content) {
  await page.getByRole("button", { name: "+ New document", exact: true }).click();
  await page.getByLabel("Document name", { exact: true }).fill(name);
  await page.getByRole("textbox", { name: "Markdown content", exact: true }).fill(content);
  await save(page);
}

test("create, save, rename and reload exact text without mutating the source examples", async () => fixture(async (page) => {
  await newDocument(page, "draft-one.md", "# First\n\nExact saved content.");
  await page.getByLabel("Document name", { exact: true }).fill("renamed.md"); await save(page);
  const before = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(before.documents.length, 3);
  assert.deepEqual(before.documents.slice(0, 2), exampleLibrary.documents);
  await page.reload();
  await page.getByLabel("Document name", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector("#document-name")?.value === "renamed.md");
  assert.equal(await page.getByRole("textbox", { name: "Markdown content" }).inputValue(), "# First\n\nExact saved content.");
}));

test("unsaved switch offers cancel, discard and save; search never switches the open draft", async () => fixture(async (page) => {
  const editor = page.getByRole("textbox", { name: "Markdown content" });
  await editor.fill("# Unsaved work");
  await page.getByRole("button", { name: /untitled-document.md Source example/ }).click();
  const dialog = page.getByRole("dialog", { name: "Save your changes?" }); await dialog.waitFor();
  await page.keyboard.press("Escape"); assert.equal(await editor.inputValue(), "# Unsaved work");
  await page.getByLabel("Search documents").fill("no-match");
  assert.equal(await editor.inputValue(), "# Unsaved work");
  await page.getByLabel("Search documents").press("Escape");
  await page.getByRole("button", { name: /untitled-document.md Source example/ }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#document-name")?.value === "untitled-document.md");
  assert.equal(await editor.inputValue(), "# Untitled Document");
  await editor.fill("# Keep this edit");
  await page.getByRole("button", { name: /welcome.md Source example/ }).click();
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#document-name")?.value === "welcome.md");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.documents[0].content, "# Keep this edit");
}));

test("delete names the actual document; Escape restores focus; deleting the last item yields empty state", async () => fixture(async (page) => {
  const remove = page.getByRole("button", { name: "Delete", exact: true });
  await remove.click(); await page.getByRole("dialog", { name: "Delete “only.md”?", exact: true }).waitFor();
  await page.keyboard.press("Escape"); assert.equal(await remove.evaluate((node) => node === document.activeElement), true);
  await remove.click(); await page.getByRole("button", { name: "Delete document", exact: true }).click();
  await page.getByRole("heading", { name: "Your library is empty." }).waitFor();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.documents.length, 0); assert.equal(saved.selectedId, null);
  await page.getByRole("button", { name: "Create a document", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Markdown content" }).inputValue(), "");
}, () => { localStorage.setItem("markdown-editor-library-v1", JSON.stringify({ version: 1, revision: "11111111-1111-4111-8111-111111111111", documents: [{ id: "22222222-2222-4222-8222-222222222222", name: "only.md", content: "Only document", updatedAt: 0 }], selectedId: "22222222-2222-4222-8222-222222222222", theme: "light" })); }));

test("new/delete intents preserve unsaved work when canceled", async () => fixture(async (page) => {
  const editor = page.getByRole("textbox", { name: "Markdown content" }); await editor.fill("Do not lose me");
  for (const name of ["+ New document", "Delete"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("dialog", { name: "Save your changes?" }).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await editor.inputValue(), "Do not lose me");
  }
}));

test("quota failure preserves dirty draft and existing storage", async () => fixture(async (page) => {
  await page.getByRole("textbox", { name: "Markdown content" }).fill("Quota-safe draft");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText(/Saving failed or storage is full/).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Markdown content" }).inputValue(), "Quota-safe draft");
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), null);
  assert.equal(await page.getByText("Unsaved changes", { exact: true }).count(), 1);
}, () => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; }));

test("malformed storage is retained until explicit reset and its dialog can be canceled", async () => fixture(async (page) => {
  await page.getByText(/saved library could not be read/).waitFor();
  await page.getByRole("button", { name: "Reset saved library", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), "broken-json");
  await page.getByRole("button", { name: "Reset saved library", exact: true }).click();
  await page.getByRole("button", { name: "Reset library", exact: true }).click();
  // The reset write is asynchronous (Web Lock + compare); wait for it rather than racing it.
  await page.waitForFunction((key) => localStorage.getItem(key) !== "broken-json", STORAGE_KEY);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.documents.length, 2);
}, () => { localStorage.setItem("markdown-editor-library-v1", "broken-json"); }));

test("two tabs detect stale document, theme and selection writes without discarding edits", async () => fixture(async (first, context) => {
  const second = await context.newPage(); await second.goto(target.href);
  await second.waitForFunction(() => !document.querySelector(".document-actions .primary")?.disabled);
  await second.getByRole("textbox", { name: "Markdown content" }).fill("Second tab draft");
  await first.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await first.locator('[data-theme="dark"]').waitFor();
  await second.getByRole("button", { name: "Save changes", exact: true }).click();
  await second.getByText(/Another tab changed this library/).waitFor();
  assert.equal(await second.getByRole("textbox", { name: "Markdown content" }).inputValue(), "Second tab draft");
  const saved = await second.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(saved.theme, "dark"); assert.equal(saved.documents[1].content, exampleLibrary.documents[1].content);
  await second.close();
}));

test("hostile Markdown stays inert, arbitrary images never load and code remains text", async () => fixture(async (page) => {
  const attack = '# Safe heading\n\n<script>window.__markdownExecuted=true</script>\n\n<img src="https://example.invalid/pixel" onerror="window.__markdownExecuted=true">\n\n[Bad](javascript:alert(1))\n\n![Private remote image](https://example.invalid/pixel)\n\n[Clear destination](https://example.invalid/docs)\n\n```html\n<script>example</script>\n```';
  await page.getByRole("textbox", { name: "Markdown content" }).fill(attack);
  await page.locator(".rendered-markdown h1").getByText("Safe heading").waitFor();
  assert.equal(await page.evaluate(() => window.__markdownExecuted), undefined);
  assert.equal(await page.locator(".rendered-markdown img,.rendered-markdown script").count(), 0);
  assert.equal(await page.locator('.rendered-markdown a[href^="javascript:"]').count(), 0);
  assert.match(await page.locator(".inert-image").textContent(), /Private remote image/);
  // CommonMark keeps a fenced block's final newline as part of its code text.
  assert.equal(await page.locator(".rendered-markdown pre code").textContent(), "<script>example</script>\n");
  const link = page.getByRole("link", { name: /Clear destination/ });
  assert.equal(await link.getAttribute("href"), "https://example.invalid/docs");
  assert.match(await link.textContent(), /https:\/\/example.invalid\/docs/);
}));

test("preview lists keep visible bullets and numbers after the CSS reset", async () => fixture(async (page) => {
  await page.getByRole("textbox", { name: "Markdown content" }).fill("- First bullet\n- Second bullet\n\n1. First step\n2. Second step");
  await page.locator(".rendered-markdown ol li").nth(1).waitFor();
  const lists = await page.evaluate(() => [...document.querySelectorAll(".rendered-markdown ul, .rendered-markdown ol")].map((list) => {
    const style = getComputedStyle(list);
    return { tag: list.tagName, type: style.listStyleType, inset: parseFloat(style.paddingLeft), items: list.children.length };
  }));
  assert.deepEqual(lists.map(({ tag, type, items }) => [tag, type, items]), [["UL", "disc", 2], ["OL", "decimal", 2]]);
  for (const list of lists) assert.ok(list.inset > 0, `${list.tag} markers need room inside the preview`);
}));

test("400/768/1440 layouts, both themes, mobile view and expanded preview preserve draft", async () => fixture(async (page) => {
  await mkdir(".test-state", { recursive: true });
  for (const width of [400, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      // Below 1100px the sidebar is a drawer behind the Documents menu button.
      if (width < 1100 && !await page.locator("#documents-panel").isVisible()) await page.getByRole("button", { name: "Documents", exact: true }).click();
      if (await page.locator(".editor-app").getAttribute("data-theme") !== theme) await page.getByRole("button", { name: `Use ${theme} theme`, exact: true }).click();
      await page.locator(`[data-theme="${theme}"]`).waitFor();
      if (width < 1100) await page.getByRole("button", { name: "Documents", exact: true }).click();
      const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, size: getComputedStyle(document.querySelector("textarea")).fontSize }));
      assert.equal(geometry.overflow, false); assert.equal(geometry.size, "16px");
      await page.screenshot({ path: `.test-state/editor-${width}-${theme}.png`, fullPage: true });
    }
  }
  const content = await page.getByRole("textbox", { name: "Markdown content" }).inputValue();
  const previewOnly = page.locator(".preview-pane").getByRole("button", { name: "Preview only", exact: true });
  await previewOnly.click();
  assert.equal(await page.locator(".edit-pane").isVisible(), false);
  await previewOnly.click();
  assert.equal(await page.getByRole("textbox", { name: "Markdown content" }).inputValue(), content);
  await page.reload(); await page.locator('[data-theme="dark"]').waitFor();
}));

test("without JavaScript the source example remains visible and unsaved controls stay disabled", async () => fixture(async (page) => {
  assert.equal(await page.getByRole("button", { name: "Save changes", exact: true }).isDisabled(), true);
  assert.match(await page.locator(".rendered-markdown").innerText(), /Welcome to Markdown/);
  assert.match(await page.locator("noscript").innerText(), /JavaScript is needed/);
}, null, { javaScriptEnabled: false }));


test("keyboard create/save/delete cancellation keeps focus and draft", async () => fixture(async (page) => {
  const create = page.getByRole("button", { name: "+ New document", exact: true });
  await create.focus(); await page.keyboard.press("Enter");
  const name = page.getByLabel("Document name", { exact: true });
  await page.waitForFunction(() => document.activeElement === document.querySelector("#document-name"));
  await name.fill("keyboard.md"); await page.getByRole("textbox", { name: "Markdown content" }).fill("Keyboard draft");
  const saveButton = page.getByRole("button", { name: "Save changes", exact: true });
  await saveButton.focus(); await page.keyboard.press("Enter"); await page.getByText("Saved in this browser.", { exact: true }).waitFor();
  const remove = page.getByRole("button", { name: "Delete", exact: true });
  await remove.focus(); await page.keyboard.press("Space");
  await page.getByRole("dialog", { name: "Delete “keyboard.md”?", exact: true }).waitFor();
  await page.keyboard.press("Escape"); assert.equal(await remove.evaluate((node) => document.activeElement === node), true);
  assert.equal(await page.getByRole("textbox", { name: "Markdown content" }).inputValue(), "Keyboard draft");
}));


test("same-mounted save, rerender and repeat save preserve the edited document and preview", async () => fixture(async (page) => {
  const name = page.getByLabel("Document name", { exact: true });
  const content = page.getByRole("textbox", { name: "Markdown content" });
  await name.fill("saved-version.md"); await content.fill("# Saved version\n\nKeep this exact text.");
  await save(page);
  await page.getByLabel("Search documents").fill("saved-version");
  await page.getByLabel("Search documents").press("Escape");
  assert.equal(await name.inputValue(), "saved-version.md");
  assert.equal(await content.inputValue(), "# Saved version\n\nKeep this exact text.");
  await page.locator(".rendered-markdown h1").getByText("Saved version", { exact: true }).waitFor();
  assert.equal(await page.locator(".status-bar [role=status]").innerText(), "Saved version");
  const first = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  await save(page);
  const second = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(second.selectedId, first.selectedId);
  assert.notEqual(second.revision, first.revision);
  const saved = second.documents.find((doc) => doc.id === second.selectedId);
  assert.equal(saved.name, "saved-version.md"); assert.equal(saved.content, "# Saved version\n\nKeep this exact text.");
  assert.equal(await name.inputValue(), saved.name); assert.equal(await content.inputValue(), saved.content);
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#document-name")?.value === "saved-version.md");
  assert.equal(await content.inputValue(), saved.content);
}));

test("discard before delete then cancel restores the latest saved version in the same workspace", async () => fixture(async (page) => {
  const name = page.getByLabel("Document name", { exact: true });
  const content = page.getByRole("textbox", { name: "Markdown content" });
  await name.fill("latest.md"); await content.fill("# Latest saved"); await save(page);
  await name.fill("discarded.md"); await content.fill("Discard this draft");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete “latest.md”?", exact: true });
  await dialog.waitFor(); await page.keyboard.press("Escape");
  assert.equal(await name.inputValue(), "latest.md"); assert.equal(await content.inputValue(), "# Latest saved");
  assert.equal(await page.locator(".status-bar [role=status]").innerText(), "Saved version");
  await save(page);
  const snapshot = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const saved = snapshot.documents.find((doc) => doc.id === snapshot.selectedId);
  assert.equal(saved.name, "latest.md"); assert.equal(saved.content, "# Latest saved");
}));

test("blank-name Save and continue exposes and focuses the modal error without losing the draft", async () => fixture(async (page) => {
  const name = page.getByLabel("Document name", { exact: true });
  const content = page.getByRole("textbox", { name: "Markdown content" });
  await name.fill(""); await content.fill("Keep the invalid-name draft");
  const other = page.getByRole("button", { name: /untitled-document.md Source example/ });
  await other.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Save your changes?", exact: true });
  await dialog.getByRole("button", { name: "Save and continue", exact: true }).focus(); await page.keyboard.press("Enter");
  const alert = dialog.getByRole("alert"); await alert.waitFor();
  assert.equal(await alert.innerText(), "Give the document a name.");
  await page.waitForFunction(() => document.activeElement === document.querySelector("dialog [role=alert]"));
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), null);
  await page.keyboard.press("Escape");
  assert.equal(await other.evaluate((node) => node === document.activeElement), true);
  assert.equal(await name.inputValue(), ""); assert.equal(await content.inputValue(), "Keep the invalid-name draft");
}));

test("storage failure during Save and continue is accessible inside the dialog and remains cancelable", async () => fixture(async (page) => {
  const content = page.getByRole("textbox", { name: "Markdown content" });
  await content.fill("Retain this quota-safe draft");
  const other = page.getByRole("button", { name: /untitled-document.md Source example/ });
  await other.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Save your changes?", exact: true });
  await dialog.getByRole("button", { name: "Save and continue", exact: true }).focus(); await page.keyboard.press("Enter");
  const alert = dialog.getByRole("alert"); await alert.waitFor();
  assert.match(await alert.innerText(), /Saving failed or storage is full/);
  await page.waitForFunction(() => document.activeElement === document.querySelector("dialog [role=alert]"));
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), null);
  await page.keyboard.press("Escape");
  assert.equal(await other.evaluate((node) => node === document.activeElement), true);
  assert.equal(await content.inputValue(), "Retain this quota-safe draft");
  assert.equal(await page.locator(".status-bar [role=status]").innerText(), "Unsaved changes");
}, () => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; }));
