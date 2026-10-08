import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { exampleLibrary } from "../lib/examples.ts";

// Every journey starts from the entry page and is completed by clicking or typing. Requests to any other origin fail the test.
const STORAGE_KEY = "markdown-editor-library-v1";
const external: string[] = [];
const pageErrors: string[] = [];

test.use({ contextOptions: { reducedMotion: "reduce" }, viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ context, baseURL }) => {
  external.length = 0; pageErrors.length = 0;
  const origin = new URL(baseURL!).origin;
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== origin) { external.push(route.request().url()); await route.abort(); return; }
    await route.continue();
  });
});
test.afterEach(() => {
  expect(external).toEqual([]);
  expect(pageErrors).toEqual([]);
});

async function open(page: Page, init?: () => void) {
  if (init) await page.addInitScript(init);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".editor-app")?.getAttribute("data-ready") === "true");
}
const name = (page: Page) => page.getByLabel("Document Name", { exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "Markdown content" });
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);
async function drawer(page: Page) {
  const menu = page.getByRole("button", { name: "Documents", exact: true });
  if (await menu.getAttribute("aria-expanded") !== "true") await menu.click();
}
async function save(page: Page) {
  const before = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  await page.locator(".save-button").click();
  await page.waitForFunction(({ key, before }) => localStorage.getItem(key) !== before, { key: STORAGE_KEY, before });
  await expect(page.locator(".save-button")).toHaveText("Saved");
}
async function createDocument(page: Page, title: string, content: string) {
  await drawer(page);
  await page.getByRole("button", { name: "+ New Document", exact: true }).click();
  await expect(name(page)).toBeFocused();
  await name(page).fill(title);
  await editor(page).fill(content);
  await save(page);
}

test("create, name, save, rename and reload keep the exact text and leave the starter documents untouched", async ({ page }) => {
  await open(page);
  await createDocument(page, "draft-one.md", "# First\n\nExact saved content.");
  await name(page).fill("renamed.md");
  await save(page);
  const library = await stored(page);
  expect(library.documents).toHaveLength(3);
  expect(library.documents.slice(0, 2)).toEqual(exampleLibrary.documents);
  await page.reload();
  await expect(name(page)).toHaveValue("renamed.md");
  await expect(editor(page)).toHaveValue("# First\n\nExact saved content.");
  await expect(page.locator(".rendered-markdown h1")).toHaveText("First");
});

test("switching with unsaved edits offers Cancel, Discard changes and Save & Continue", async ({ page }) => {
  await open(page);
  await editor(page).fill("# Unsaved work");
  await drawer(page);
  const other = page.getByRole("button", { name: /untitled-document\.md/ });
  await other.click();
  const dialog = page.getByRole("dialog", { name: "Save your changes?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(editor(page)).toHaveValue("# Unsaved work");
  await other.click();
  await dialog.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(name(page)).toHaveValue("untitled-document.md");
  await expect(editor(page)).toHaveValue("");
  await editor(page).fill("# Keep this edit");
  await drawer(page);
  await page.getByRole("button", { name: /welcome\.md/ }).click();
  await dialog.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(name(page)).toHaveValue("welcome.md");
  expect((await stored(page)).documents[0].content).toBe("# Keep this edit");
});

test("deleting the last document leaves a clear empty state that creates a new one", async ({ page }) => {
  await open(page, () => localStorage.setItem("markdown-editor-library-v1", JSON.stringify({ version: 1, revision: "11111111-1111-4111-8111-111111111111", documents: [{ id: "22222222-2222-4222-8222-222222222222", name: "only.md", content: "Only document", updatedAt: 1 }], selectedId: "22222222-2222-4222-8222-222222222222", theme: "light" })));
  await page.getByRole("button", { name: "Delete document", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this document?" });
  await expect(dialog).toContainText("‘only.md’");
  await dialog.getByRole("button", { name: "Confirm & Delete", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible();
  const create = page.getByRole("main").getByRole("button", { name: "+ New Document", exact: true });
  await expect(create).toBeFocused();
  expect(await stored(page)).toMatchObject({ documents: [], selectedId: null });
  await create.click();
  await expect(name(page)).toHaveValue("untitled-document.md");
  await expect(editor(page)).toHaveValue("");
});

test("a full storage quota keeps the draft and the saved bytes, and says what to do", async ({ page }) => {
  await open(page, () => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await editor(page).fill("Quota-safe draft");
  await page.locator(".save-button").click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Saving failed or storage is full");
  await expect(page.getByRole("button", { name: "Download this draft", exact: true })).toBeVisible();
  await expect(editor(page)).toHaveValue("Quota-safe draft");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(page.locator(".save-button")).toHaveText("Save Changes");
});

test("unreadable saved data is kept until an explicit reset, and the reset can be cancelled", async ({ page }) => {
  await open(page, () => localStorage.setItem("markdown-editor-library-v1", "broken-json"));
  await expect(page.getByRole("main").getByRole("alert")).toContainText("could not be read");
  await page.getByRole("button", { name: "Reset saved documents", exact: true }).click();
  await page.keyboard.press("Escape");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("broken-json");
  await page.getByRole("button", { name: "Reset saved documents", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset saved documents", exact: true }).click();
  await page.waitForFunction((key) => localStorage.getItem(key) !== "broken-json", STORAGE_KEY);
  expect((await stored(page)).documents).toHaveLength(2);
});

test("a second tab cannot overwrite a newer save, and keeps its own draft", async ({ page, context }: { page: Page; context: BrowserContext }) => {
  await open(page);
  const second = await context.newPage();
  await second.goto("/");
  await second.waitForFunction(() => document.querySelector(".editor-app")?.getAttribute("data-ready") === "true");
  await editor(second).fill("Second tab draft");
  await drawer(page);
  await page.getByRole("switch", { name: "Dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await second.locator(".save-button").click();
  await expect(second.getByRole("main").getByRole("alert")).toContainText("Another tab changed");
  await expect(editor(second)).toHaveValue("Second tab draft");
  const library = await stored(second);
  expect(library.theme).toBe("dark");
  expect(library.documents[1].content).toBe(exampleLibrary.documents[1]!.content);
  await second.close();
});

test("hostile Markdown stays inert: no script, no remote image, no javascript: link", async ({ page }) => {
  await open(page);
  await editor(page).fill('# Safe heading\n\n<script>window.__markdownExecuted=true</script>\n\n<img src="https://example.invalid/pixel" onerror="window.__markdownExecuted=true">\n\n[Bad](javascript:alert(1))\n\n![Private remote image](https://example.invalid/pixel)\n\n[Clear destination](https://example.invalid/docs)\n\n```html\n<script>example</script>\n```');
  await expect(page.locator(".rendered-markdown h1")).toHaveText("Safe heading");
  expect(await page.evaluate(() => (window as unknown as { __markdownExecuted?: boolean }).__markdownExecuted)).toBeUndefined();
  await expect(page.locator(".rendered-markdown img, .rendered-markdown script, .rendered-markdown a[href^='javascript:']")).toHaveCount(0);
  await expect(page.locator(".inert-image")).toContainText("Private remote image");
  await expect(page.locator(".rendered-markdown pre code")).toHaveText("<script>example</script>\n");
  const link = page.getByRole("link", { name: /Clear destination/ });
  await expect(link).toHaveAttribute("href", "https://example.invalid/docs");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

test("preview lists keep visible bullets and numbers", async ({ page }) => {
  await open(page);
  await editor(page).fill("- First bullet\n- Second bullet\n\n1. First step\n2. Second step");
  await expect(page.locator(".rendered-markdown ol li")).toHaveCount(2);
  const lists = await page.evaluate(() => [...document.querySelectorAll(".rendered-markdown ul, .rendered-markdown ol")].map((list) => ({ tag: list.tagName, type: getComputedStyle(list).listStyleType, inset: parseFloat(getComputedStyle(list).paddingLeft) })));
  expect(lists.map(({ tag, type }) => [tag, type])).toEqual([["UL", "disc"], ["OL", "decimal"]]);
  for (const list of lists) expect(list.inset).toBeGreaterThan(0);
});

test("keyboard only: create, name, save, then cancel a delete with focus kept", async ({ page }) => {
  await open(page);
  const menu = page.getByRole("button", { name: "Documents", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "+ New Document", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(name(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("keyboard.md");
  await editor(page).focus();
  await page.keyboard.type("Keyboard draft");
  const saveButton = page.locator(".save-button");
  await saveButton.focus();
  await page.keyboard.press("Enter");
  await expect(saveButton).toHaveText("Saved");
  const remove = page.getByRole("button", { name: "Delete document", exact: true });
  await remove.focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog", { name: "Delete this document?" })).toContainText("‘keyboard.md’");
  await page.keyboard.press("Escape");
  await expect(remove).toBeFocused();
  await expect(editor(page)).toHaveValue("Keyboard draft");
});

test("a blank name during Save & Continue shows a focused error in the dialog and keeps the draft", async ({ page }) => {
  await open(page);
  await name(page).fill("");
  await editor(page).fill("Keep the invalid-name draft");
  await drawer(page);
  const other = page.getByRole("button", { name: /untitled-document\.md/ });
  await other.click();
  const dialog = page.getByRole("dialog", { name: "Save your changes?" });
  await dialog.getByRole("button", { name: "Save & Continue", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Give the document a name.");
  await expect(dialog.getByRole("alert")).toBeFocused();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await page.keyboard.press("Escape");
  await expect(other).toBeFocused();
  await expect(name(page)).toHaveValue("");
  await expect(editor(page)).toHaveValue("Keep the invalid-name draft");
});

test("without JavaScript the starter document stays readable and the page says why editing is off", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator(".rendered-markdown")).toContainText("Welcome to Markdown");
  const note = page.locator("p.noscript");
  await expect(note).toBeVisible();
  await expect(note).toContainText("JavaScript is needed to edit and save in this browser.");
  expect((await note.boundingBox())!.y + (await note.boundingBox())!.height).toBeLessThanOrEqual(1000);
  await context.close();
});
