import { expect, test, type Page } from "@playwright/test";

const widths = [
  { width: 400, height: 800 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

async function open(page: Page) {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector(".editor-app")?.getAttribute("data-ready") === "true");
}

for (const viewport of widths) {
  test(`unsaved-changes dialog is a centered modal with the design backdrop at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.getByRole("textbox", { name: "Markdown content" }).fill("# Unsaved work");
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await page.getByRole("button", { name: /untitled-document\.md/ }).click();
    const dialog = page.getByRole("dialog", { name: "Save your changes?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    const { x, y, width, height } = box!;
    expect(Math.abs(x + width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2);
    expect(Math.abs(y + height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2);
    expect(width).toBeLessThanOrEqual(343);
    expect(x).toBeGreaterThanOrEqual(16);
    // Design: Confirm Deletion frames dim the page with #000 at 50% (light) behind a 4px-radius modal.
    const style = await dialog.evaluate((element) => ({
      backdrop: getComputedStyle(element, "::backdrop").backgroundColor,
      radius: getComputedStyle(element).borderTopLeftRadius,
    }));
    expect(style.backdrop).toBe("rgba(0, 0, 0, 0.5)");
    expect(style.radius).toBe("4px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test("clicking the backdrop cancels the delete modal and keeps the document", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.getByRole("button", { name: "Delete document", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this document?" });
  await expect(dialog).toBeVisible();
  await page.mouse.click(20, 500);
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Document Name", { exact: true })).toHaveValue("welcome.md");
});

test("an empty document name is refused with a message and focus on the name", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  const name = page.getByLabel("Document Name", { exact: true });
  await name.fill("   ");
  await page.locator(".save-button").click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Give the document a name.");
  await expect(name).toBeFocused();
});
