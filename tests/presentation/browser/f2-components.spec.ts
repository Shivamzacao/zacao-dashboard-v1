import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("F2 reusable component matrix", () => {
  test("matches the approved desktop component baseline", async ({ page }) => {
    await page.goto("/f2");
    await expect(
      page.getByRole("heading", { name: "Reusable dashboard components" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("f2-components.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("remains usable at an effective 200% zoom width", async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("F2 browser project must define a viewport");
    await page.goto("/f2");
    await page.setViewportSize({ width: Math.floor(viewport.width / 2), height: viewport.height });
    await expect(
      page.getByRole("heading", { name: "Reusable dashboard components" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test("passes automated accessibility and keyboard interaction checks", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/f2");
    await page.getByRole("button", { name: "About source freshness" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expect(page.locator(".state-loading .state-symbol")).toHaveCSS("animation-name", "none");
    const results = await new AxeBuilder({ page }).exclude(".recharts-wrapper").analyze();
    expect(results.violations).toEqual([]);
  });
});
