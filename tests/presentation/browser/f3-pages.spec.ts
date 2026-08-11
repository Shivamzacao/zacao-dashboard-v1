import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  ["executive", "Executive health"],
  ["revenue", "Revenue intelligence"],
  ["customers", "Customer intelligence"],
  ["products", "Product intelligence"],
  ["operations", "Operations intelligence"],
  ["marketing", "Marketing intelligence"],
  ["insights", "Insights and data quality"],
  ["growth", "Growth intelligence"],
  ["financial", "Financial intelligence"],
] as const;

for (const [slug, title] of pages) {
  test(`${slug} matches the F3 visual contract`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/${slug}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(250);
    if (slug === "insights") {
      await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.locator(`[data-page="${slug}"]`)).toBeVisible();
    await expect(page.getByLabel("Key performance indicators")).toBeVisible();
    await expect(page).toHaveScreenshot(`f3-${slug}.png`, {
      fullPage: true,
      animations: "disabled",
    });
    if (testInfo.project.name === "desktop") {
      const results = await new AxeBuilder({ page }).exclude(".recharts-wrapper").analyze();
      expect(results.violations).toEqual([]);
    }
  });
}

for (const width of [760, 640]) {
  test(`dashboard remains usable without page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await page.goto("/executive");
    await expect(page.getByRole("heading", { name: "Executive health" })).toBeVisible();
    await expect(page.getByLabel("Reporting period")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
