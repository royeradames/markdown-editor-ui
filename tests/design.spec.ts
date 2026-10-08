import { expect, test, type Page } from "@playwright/test";

// Official challenge requirements and the decoded Figma frames (Desktop/Tablet/Mobile Editor, Sidebar, Preview, Confirm Deletion).
const STORAGE_KEY = "markdown-editor-library-v1";
test.use({ contextOptions: { reducedMotion: "reduce" } });
const sizes = { mobile: { width: 375, height: 812 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 1000 } } as const;

async function open(page: Page, viewport: { width: number; height: number } = sizes.desktop) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await ready(page);
}
// Ready once local storage is read. The fallback (an enabled Save) also recognises the pre-redesign build, so the
// fail-first run fails on behaviour rather than on a missing marker.
const ready = (page: Page) => page.waitForFunction(() => document.querySelector(".editor-app")?.getAttribute("data-ready") === "true"
  || document.querySelector<HTMLButtonElement>(".save-button")?.disabled === false);
const menu = (page: Page) => page.getByRole("button", { name: "Documents", exact: true });
const panel = (page: Page) => page.locator("#documents-panel");
const nameInput = (page: Page) => page.getByLabel("Document Name", { exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "Markdown content" });
const stored = (page: Page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), STORAGE_KEY);

for (const [label, viewport] of Object.entries(sizes)) {
  test(`${label}: the sidebar starts closed behind the menu button and the editor starts at the left edge`, async ({ page }) => {
    await open(page, viewport);
    await expect(panel(page)).toBeHidden();
    const box = await menu(page).boundingBox();
    const size = viewport.width >= 768 ? 72 : 56;
    expect(box).toMatchObject({ x: 0, y: 0, width: size, height: size });
    const pane = await page.locator(".edit-pane").boundingBox();
    expect(pane?.x).toBe(0);
    expect(pane?.y).toBe(size);
  });

  test(`${label}: opening the drawer pushes the app 250px, Tab enters it and Escape closes it`, async ({ page }) => {
    await open(page, viewport);
    await menu(page).click();
    await expect(menu(page)).toHaveAttribute("aria-expanded", "true");
    await expect(panel(page)).toBeVisible();
    await expect.poll(async () => (await panel(page).boundingBox())?.x).toBe(0);
    expect(await panel(page).boundingBox()).toMatchObject({ x: 0, y: 0, width: 250 });
    expect((await menu(page).boundingBox())?.x).toBe(250);
    await menu(page).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "+ New Document", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toBeHidden();
    await expect(menu(page)).toHaveAttribute("aria-expanded", "false");
    await expect(menu(page)).toBeFocused();
    // A closed drawer is out of the tab order.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("#documents-panel"))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("desktop and tablet header: logo, divider, Document Name label and the name; mobile shows only the name", async ({ page }) => {
  for (const viewport of [sizes.desktop, sizes.tablet]) {
    await open(page, viewport);
    await expect(page.getByRole("banner").getByRole("heading", { level: 1, name: "Markdown" })).toBeVisible();
    await expect(page.getByRole("banner").getByText("Document Name", { exact: true })).toBeVisible();
    await expect(nameInput(page)).toHaveValue("welcome.md");
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toBeVisible();
  }
  await open(page, sizes.mobile);
  // The logo and the label stay in the accessibility tree but take no visible space on phones.
  expect((await page.getByRole("banner").getByRole("heading", { level: 1, name: "Markdown" }).boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  expect((await page.getByRole("banner").getByText("Document Name", { exact: true }).boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
  await expect(nameInput(page)).toBeVisible();
  await expect(nameInput(page)).toHaveValue("welcome.md");
  const save = await page.getByRole("button", { name: "Save Changes", exact: true }).boundingBox();
  expect(save?.width).toBe(40);
});

test("the starter's two sample documents are listed with their 01 April 2022 date", async ({ page }) => {
  await open(page);
  await menu(page).click();
  const items = panel(page).getByRole("listitem");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveText(/untitled-document\.md\s*01 April 2022/);
  await expect(items.nth(1)).toHaveText(/welcome\.md\s*01 April 2022/);
  await expect(panel(page).getByRole("button", { name: /welcome\.md/ })).toHaveAttribute("aria-current", "page");
  await panel(page).getByRole("button", { name: /untitled-document\.md/ }).click();
  await expect(nameInput(page)).toHaveValue("untitled-document.md");
  await expect(editor(page)).toHaveValue("");
});

test("+ New Document adds a dated untitled document at once, closes the drawer and focuses its name", async ({ page }) => {
  await open(page);
  await menu(page).click();
  await page.getByRole("button", { name: "+ New Document", exact: true }).click();
  await expect(panel(page)).toBeHidden();
  await expect(nameInput(page)).toBeFocused();
  await expect(nameInput(page)).toHaveValue("untitled-document.md");
  await expect(editor(page)).toHaveValue("");
  const library = await stored(page);
  expect(library.documents).toHaveLength(3);
  await menu(page).click();
  await expect(panel(page).getByRole("listitem")).toHaveCount(3);
});

test("delete opens the design's confirmation modal, traps focus, restores it on Escape and deletes on confirm", async ({ page }) => {
  await open(page);
  const remove = page.getByRole("button", { name: "Delete document", exact: true });
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Delete this document?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Are you sure you want to delete the ‘welcome.md’ document and its contents? This action cannot be reversed.");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog[open]"))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole("button", { name: "Confirm & Delete", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(nameInput(page)).toHaveValue("untitled-document.md");
  await page.reload();
  await ready(page);
  await menu(page).click();
  await expect(panel(page).getByRole("listitem")).toHaveCount(1);
  await expect(panel(page).getByRole("button", { name: /welcome\.md/ })).toHaveCount(0);
});

test("document IDs are never reused after delete then add", async ({ page }) => {
  await open(page);
  const create = async () => {
    await menu(page).click();
    await page.getByRole("button", { name: "+ New Document", exact: true }).click();
    await expect(nameInput(page)).toBeFocused();
    return (await stored(page)).selectedId as string;
  };
  const first = await create();
  await page.getByRole("button", { name: "Delete document", exact: true }).click();
  await page.getByRole("button", { name: "Confirm & Delete", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  expect((await stored(page)).documents.map((doc: { id: string }) => doc.id)).not.toContain(first);
  const second = await create();
  expect(second).not.toBe(first);
  const ids = (await stored(page)).documents.map((doc: { id: string }) => doc.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain(first);
});

test("theme switch in the drawer persists across reloads and paints before hydration", async ({ page }) => {
  // Record <html data-theme> at the moment the server markup for the app is parsed, before any React code runs.
  await page.addInitScript(() => {
    const w = window as unknown as { __firstTheme?: string };
    new MutationObserver((_, observer) => {
      if (!document.querySelector(".editor-app")) return;
      w.__firstTheme = document.documentElement.dataset.theme ?? "unset";
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await open(page);
  await menu(page).click();
  const dark = page.getByRole("switch", { name: "Dark mode" });
  await expect(dark).toHaveAttribute("aria-checked", "false");
  await dark.click();
  await expect(dark).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect((await stored(page)).theme).toBe("dark");
  await page.reload();
  await ready(page);
  expect(await page.evaluate(() => (window as unknown as { __firstTheme?: string }).__firstTheme)).toBe("dark");
  await menu(page).click();
  await expect(page.getByRole("switch", { name: "Dark mode" })).toHaveAttribute("aria-checked", "true");
});

test("a first visit follows the system dark preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("preview-only centers the rendered document in a 720px column on desktop", async ({ page }) => {
  await open(page);
  await page.locator(".preview-pane").getByRole("button", { name: "Preview only", exact: true }).click();
  const box = await page.locator(".rendered-markdown").boundingBox();
  expect(box?.width).toBeLessThanOrEqual(720);
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 720)).toBeLessThanOrEqual(2);
});

test("saving a renamed document keeps it after reload", async ({ page }) => {
  await open(page);
  await nameInput(page).fill("notes.md");
  await editor(page).fill("# Notes");
  await page.locator(".save-button").click();
  await expect(page.locator(".save-button")).toHaveText(/Saved/);
  await page.reload();
  await ready(page);
  await expect(nameInput(page)).toHaveValue("notes.md");
  await expect(editor(page)).toHaveValue("# Notes");
});

test("reduced motion turns off the drawer slide", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".app-frame")!).transitionDuration)).toBe("0s");
});
