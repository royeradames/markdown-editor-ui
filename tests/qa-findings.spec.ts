import { expect, test, type Page } from "@playwright/test";

const SITE_NAME = "Markdown";
const STORAGE_KEY = "markdown-editor-library-v1";

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".editor-app")?.getAttribute("data-ready") === "true");
}

test("saving keeps every control focusable, keeps focus on Save and blocks only a second save", async ({ page }) => {
  await page.addInitScript((key) => {
    const w = window as unknown as { __writes: number };
    w.__writes = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) { if (name === key) w.__writes += 1; return setItem.call(this, name, value); };
    const locks = navigator.locks;
    const request = locks.request.bind(locks) as (name: string, work: () => Promise<unknown>) => Promise<unknown>;
    // Hold the storage lock long enough to observe the pending state.
    Object.defineProperty(locks, "request", { value: (name: string, work: () => Promise<unknown>) => request(name, async () => { await new Promise((done) => setTimeout(done, 2500)); return work(); }) });
  }, STORAGE_KEY);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const editor = page.getByRole("textbox", { name: "Markdown content" });
  await editor.fill("# Busy save");
  const save = page.locator(".save-button");
  await save.focus();
  await page.keyboard.press("Enter");
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(save).toHaveText("Saving…");
  await expect(save).toBeFocused();
  for (const control of [save, page.getByRole("button", { name: "Delete document", exact: true }), page.getByLabel("Document Name", { exact: true }), editor]) {
    await expect(control).toBeEnabled();
  }
  await expect(editor).toBeEditable();
  // The drawer opens and its controls stay enabled while the save is still pending.
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  for (const control of [page.getByRole("button", { name: "+ New Document", exact: true }), page.getByRole("button", { name: /untitled-document\.md/ }), page.getByRole("switch", { name: "Dark mode" })]) {
    await expect(control).toBeVisible();
    await expect(control).toBeEnabled();
  }
  await expect(save).toHaveAttribute("aria-busy", "true");
  await save.focus();
  // Two more activations while the first save is pending must not write again.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(save).toHaveAttribute("data-state", "saved");
  await expect(page.getByRole("status").filter({ hasText: "Saved welcome.md in this browser." })).toHaveCount(1);
  await expect(save).not.toHaveAttribute("aria-busy", "true");
  await expect(save).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { __writes: number }).__writes)).toBe(1);
});

for (const viewport of [{ width: 400, height: 800 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
  test(`design structure: name in header, editor fills its column, Roboto faces at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await expect(page.locator("header").getByLabel("Document Name", { exact: true })).toHaveValue("welcome.md");
    const geometry = await page.evaluate(() => {
      const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const pane = document.querySelector(".edit-pane") as HTMLElement;
      return {
        textarea: rect("textarea"), header: rect(".edit-pane .pane-header"), pane: pane.getBoundingClientRect(), paneInner: pane.clientWidth,
        scrolls: document.documentElement.scrollHeight > innerHeight + 1, overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.overflow).toBe(false);
    expect(geometry.scrolls).toBe(false);
    expect(Math.abs(geometry.textarea.left - geometry.pane.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.textarea.width - geometry.paneInner)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.textarea.top - geometry.header.bottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.textarea.bottom - geometry.pane.bottom)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.pane.bottom - viewport.height)).toBeLessThanOrEqual(2);
    const faces = await page.evaluate(async () => {
      await document.fonts.ready;
      const declared = new Set([...document.fonts].map((face) => face.family.replace(/["']/g, "")));
      const first = (selector: string) => getComputedStyle(document.querySelector(selector)!).fontFamily.split(",")[0]!.trim().replace(/["']/g, "");
      return Promise.all(["body", "textarea", ".rendered-markdown"].map(async (selector) => {
        const family = first(selector);
        const loaded = declared.has(family) && (await document.fonts.load(`16px "${family}"`)).length > 0;
        return { selector, family, loaded };
      }));
    });
    // The first family in each stack must be a served webfont face (not a platform fallback). Hidden panes load lazily, so load it explicitly.
    expect(faces.map(({ selector, loaded }) => [selector, loaded])).toEqual([["body", true], ["textarea", true], [".rendered-markdown", true]]);
    expect(faces[0]!.family).toMatch(/Roboto(?!.?(Mono|Slab))/i);
    expect(faces[1]!.family).toMatch(/Roboto.?Mono/i);
    expect(faces[2]!.family).toMatch(/Roboto.?Slab/i);
  });
}

test("eye toggle switches to preview only and back at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const toggle = page.locator(".preview-pane").getByRole("button", { name: "Preview only", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".edit-pane")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".edit-pane")).toBeHidden();
  await expect(page.locator(".preview-pane")).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".edit-pane")).toBeVisible();
});

test("eye toggle swaps the single mobile pane between Markdown and preview at 400px", async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await open(page);
  await expect(page.locator(".edit-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeHidden();
  const show = page.locator(".edit-pane").getByRole("button", { name: "Preview only", exact: true });
  await expect(show).toHaveAttribute("aria-pressed", "false");
  await show.click();
  await expect(page.locator(".edit-pane")).toBeHidden();
  const hide = page.locator(".preview-pane").getByRole("button", { name: "Preview only", exact: true });
  await expect(hide).toHaveAttribute("aria-pressed", "true");
  await expect(hide).toBeFocused();
  await hide.click();
  await expect(page.locator(".edit-pane")).toBeVisible();
  await expect(page.locator(".preview-pane")).toBeHidden();
});

test("home declares one site name in the visible identity, og:site_name and WebSite JSON-LD", async ({ page }) => {
  await open(page);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", SITE_NAME);
  const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? "{}");
  expect(data).toMatchObject({ "@context": "https://schema.org", "@type": "WebSite", name: SITE_NAME, url: "https://markdown-editor-ui.royeradames.com/" });
  // The page's own title heading is the banner h1 and comes first; h1s inside the rendered preview are the user's document content.
  await expect(page.getByRole("banner").getByRole("heading", { level: 1 })).toHaveText(SITE_NAME);
  expect(await page.evaluate(() => document.querySelector("h1")?.closest("header") !== null)).toBe(true);
});
