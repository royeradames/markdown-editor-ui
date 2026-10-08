import { expect, test, type Page } from "@playwright/test";

const widths = [
  { width: 400, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

async function open(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
}

async function statusAndListLabel(page: Page) {
  const status = (await page.locator(".status-bar [role=status]").textContent())?.trim() ?? "";
  const list = (await page.locator('.documents-panel button[aria-current="page"] small').textContent())?.trim() ?? "";
  return { status, list };
}

for (const viewport of widths) {
  test(`unsaved-changes dialog is a centered modal with the design backdrop at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.getByRole("textbox", { name: "Markdown content" }).fill("# Unsaved work");
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Save your changes?" });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    expect(Math.abs(x + width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(y + height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
    expect(x).toBeGreaterThanOrEqual(16);
    expect(x + width).toBeLessThanOrEqual(viewport.width - 16);
    // Design: Confirm Deletion frame dims the page with #000 at 50% behind a 4px-radius modal.
    const style = await dialog.evaluate((element) => ({
      backdrop: getComputedStyle(element, "::backdrop").backgroundColor,
      radius: getComputedStyle(element).borderTopLeftRadius,
    }));
    expect(style.backdrop).toBe("rgba(0, 0, 0, 0.5)");
    expect(style.radius).toBe("4px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("switching to dark theme keeps the status and document list labels in agreement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  expect(await statusAndListLabel(page)).toEqual({ status: "Source example — not yet saved", list: "Source example" });
  await page.getByRole("button", { name: "Use dark theme", exact: true }).click();
  await expect(page.locator('.editor-app[data-theme="dark"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Use light theme", exact: true })).toBeEnabled();
  // A theme preference is not a document save: welcome.md is still the untouched source example.
  expect(await statusAndListLabel(page)).toEqual({ status: "Source example — not yet saved", list: "Source example" });
});

test("opening another source example keeps the status and document list labels in agreement", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole("button", { name: /untitled-document\.md/ }).click();
  await expect(page.getByLabel("Document name", { exact: true })).toHaveValue("untitled-document.md");
  expect(await statusAndListLabel(page)).toEqual({ status: "Source example — not yet saved", list: "Source example" });
});

test("a document saved by the user reads as saved in both the status and the list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole("textbox", { name: "Markdown content" }).fill("# Mine now");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved in this browser.", { exact: true })).toBeVisible();
  const labels = await statusAndListLabel(page);
  expect(labels.status).toBe("Saved version");
  expect(labels.list).not.toBe("Source example");
});
