import { expect, test, type Page } from "@playwright/test";

// The documents drawer at 1, 6, 30 and 100 saved documents (synthetic, oldest first as stored).
const STORAGE_KEY = "markdown-editor-library-v1";
test.use({ contextOptions: { reducedMotion: "reduce" } });

function seed(count: number, open = count - 1) {
  const documents = Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: `doc-${index + 1}.md`,
    content: `# Document ${index + 1}`,
    createdAt: Date.UTC(2026, 0, 1) + index * 60_000,
    updatedAt: Date.UTC(2026, 0, 1) + index * 60_000,
  }));
  return { version: 1, revision: "11111111-1111-4111-8111-111111111111", documents, selectedId: documents[open]?.id ?? null, theme: "light" };
}

async function open(page: Page, count: number, viewport = { width: 1440, height: 1000 }, openIndex = count - 1) {
  await page.setViewportSize(viewport);
  // Seed once per library size, so later navigations keep what the test saved.
  await page.addInitScript(({ key, library, count }) => {
    if (localStorage.getItem("test-seeded-count") === String(count)) return;
    localStorage.setItem(key, JSON.stringify(library));
    localStorage.setItem("test-seeded-count", String(count));
  }, { key: STORAGE_KEY, library: seed(count, openIndex), count });
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".editor-app")?.getAttribute("data-ready") === "true");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(panel(page)).toBeVisible();
}
const panel = (page: Page) => page.locator("#documents-panel");
const items = (page: Page) => panel(page).getByRole("listitem");
const search = (page: Page) => panel(page).getByRole("searchbox", { name: "Search documents", exact: true });
const status = (page: Page) => panel(page).getByRole("status");

for (const count of [1, 6]) {
  test(`${count} documents: all listed newest first, no search and no count line`, async ({ page }) => {
    await open(page, count);
    await expect(items(page)).toHaveCount(count);
    await expect(items(page).first()).toContainText(`doc-${count}.md`);
    await expect(items(page).last()).toContainText("doc-1.md");
    await expect(search(page)).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "Show more documents", exact: true })).toHaveCount(0);
  });
}

for (const count of [30, 100]) {
  test(`${count} documents: newest 10 first with a count, Show more and a search`, async ({ page }) => {
    await open(page, count);
    await expect(items(page)).toHaveCount(10);
    await expect(items(page).first()).toContainText(`doc-${count}.md`);
    await expect(status(page)).toHaveText(`Showing 10 of ${count} documents. Newest first.`);
    const more = panel(page).getByRole("button", { name: "Show more documents", exact: true });
    await more.click();
    await expect(items(page)).toHaveCount(20);
    await expect(status(page)).toHaveText(`Showing 20 of ${count} documents. Newest first.`);
    // Focus lands on the first newly shown document, not on the page body.
    await expect(items(page).nth(10).getByRole("button")).toBeFocused();

    await search(page).fill("  DOC-1  ");
    const matches = Array.from({ length: count }, (_, index) => `doc-${index + 1}.md`).filter((name) => name.includes("doc-1")).length;
    await expect(status(page)).toHaveText(`Showing ${Math.min(10, matches)} of ${matches} matching documents.`);
    await search(page).fill("no-such-name");
    await expect(status(page)).toHaveText("No documents match “no-such-name”.");
    await expect(items(page)).toHaveCount(0);
    await panel(page).getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search(page)).toHaveValue("");
    await expect(search(page)).toBeFocused();
    await expect(items(page)).toHaveCount(10);
  });
}

test("the open document stays listed after the first 10 and marked current", async ({ page }) => {
  // doc-1 is the oldest of 30, so it would sit in the third block of 10.
  await open(page, 30, undefined, 0);
  await expect(items(page)).toHaveCount(11);
  await expect(items(page).last()).toContainText("doc-1.md");
  await expect(items(page).last().getByRole("button")).toHaveAttribute("aria-current", "page");
  await expect(status(page)).toHaveText("Showing 11 of 30 documents. Newest first.");
  await panel(page).getByRole("button", { name: "Show more documents", exact: true }).click();
  await expect(items(page)).toHaveCount(21);
  await expect(items(page).nth(10)).toContainText("doc-20.md");
  await expect(items(page).nth(10).getByRole("button")).toBeFocused();
});

test("when the open document is the 11th newest, Show more focuses the first row it revealed", async ({ page }) => {
  // doc-20 is the 11th newest of 30, so it already sits in place as row 11 before Show more.
  await open(page, 30, undefined, 19);
  await expect(items(page)).toHaveCount(11);
  await expect(items(page).nth(10)).toContainText("doc-20.md");
  await panel(page).getByRole("button", { name: "Show more documents", exact: true }).click();
  await expect(items(page)).toHaveCount(20);
  await expect(items(page).nth(11).getByRole("button")).toBeFocused();
  await expect(items(page).nth(11)).toContainText("doc-19.md");
});

test("Escape clears the document search first, then closes the drawer", async ({ page }) => {
  await open(page, 30);
  await search(page).fill("doc-3");
  await page.keyboard.press("Escape");
  await expect(search(page)).toHaveValue("");
  await expect(panel(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Documents", exact: true })).toBeFocused();
});

test("a search result opens by keyboard", async ({ page }) => {
  await open(page, 30);
  await search(page).fill("doc-17");
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(items(page).first().getByRole("button")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Document Name", { exact: true })).toHaveValue("doc-17.md");
});

test("a new document lands at the top of a long list, in view", async ({ page }) => {
  await open(page, 30);
  await panel(page).getByRole("button", { name: "+ New Document", exact: true }).click();
  await expect(page.getByLabel("Document Name", { exact: true })).toHaveValue("untitled-document.md");
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  await expect(items(page).first()).toContainText("untitled-document.md");
  await expect(items(page).first()).toBeInViewport();
  await expect(status(page)).toHaveText("Showing 10 of 31 documents. Newest first.");
});

test("at 375px the drawer never scrolls sideways and its height does not grow with the library", async ({ page }) => {
  const switchTop: number[] = [];
  for (const count of [30, 100]) {
    const tab = count === 30 ? page : await page.context().newPage();
    await open(tab, count, { width: 375, height: 812 });
    expect(await tab.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    expect(await panel(tab).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    switchTop.push(await panel(tab).getByRole("switch", { name: "Dark mode" }).evaluate((element) => (element as HTMLElement).offsetTop));
  }
  expect(switchTop[0]).toBe(switchTop[1]);
});
