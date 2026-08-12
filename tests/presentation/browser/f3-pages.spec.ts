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

test("product detail drawer remains responsive after opening", async ({ page }) => {
  await page.goto("/products");
  await page.waitForLoadState("networkidle");

  const viewButton = page.getByRole("button", { name: /View details for/ }).first();
  const detailDrawer = page.getByRole("dialog", { name: "Product catalog detail" });

  await viewButton.click();
  await expect(detailDrawer).toBeVisible();
  await page.waitForTimeout(1_000);
  await detailDrawer.getByRole("button", { name: "Close" }).click();
  await expect(detailDrawer).toBeHidden();

  await viewButton.click();
  await expect(detailDrawer).toBeVisible();
  await detailDrawer.getByRole("button", { name: "Close" }).click();
  await expect(detailDrawer).toBeHidden();
});

for (const width of [760, 640, 390]) {
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

    await page.goto("/revenue");
    await expect(page.getByRole("heading", { name: "Revenue intelligence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: "Customer intelligence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Product intelligence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await page.goto("/operations");
    await expect(page.getByRole("heading", { name: "Operations intelligence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);

    await page.goto("/marketing");
    await expect(page.getByRole("heading", { name: "Marketing intelligence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test("customers matches the 1280 by 720 reference composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop reference baseline is sufficient");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/customers");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Customer intelligence" })).toBeVisible();
  await expect(page).toHaveScreenshot("f3-customers-reference-1280x720.png", {
    fullPage: true,
    animations: "disabled",
  });
});

test("products matches the 1280 by 720 reference composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop reference baseline is sufficient");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/products");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Product intelligence" })).toBeVisible();
  await expect(page).toHaveScreenshot("f3-products-reference-1280x720.png", {
    fullPage: true,
    animations: "disabled",
  });
});

test("operations matches the 1280 by 720 reference composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop reference baseline is sufficient");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/operations");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Operations intelligence" })).toBeVisible();
  await expect(page).toHaveScreenshot("f3-operations-reference-1280x720.png", {
    fullPage: true,
    animations: "disabled",
  });
});

test("dense operations timelines stay inside their chart card", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop layout check is sufficient");
  await page.goto("/operations");
  await page.waitForLoadState("networkidle");

  const timelineHeading = page.getByRole("heading", { name: "Projected delivery timeline" });
  const timelineCard = page.locator(".chart-card").filter({ has: timelineHeading });
  const timelineScroll = timelineCard.locator(".delivery-timeline-scroll");

  await timelineScroll.locator(".delivery-timeline").evaluate((list) => {
    const firstRow = list.firstElementChild;
    if (!firstRow) throw new Error("Expected at least one delivery timeline row");
    for (let index = 0; index < 12; index += 1) {
      list.append(firstRow.cloneNode(true));
    }
  });

  await expect(timelineScroll).toHaveCSS("overflow-y", "auto");
  const geometry = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>(".delivery-timeline-scroll");
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (element) => element.textContent === "Projected delivery timeline",
    );
    const card = heading?.closest<HTMLElement>(".dashboard-card");
    const packagingHeading = Array.from(document.querySelectorAll("h2")).find(
      (element) => element.textContent === "Packaging material stock",
    );
    const packaging = packagingHeading?.closest<HTMLElement>(".dashboard-card");
    if (!scroll || !card || !packaging) throw new Error("Expected operations timeline cards");
    return {
      clientHeight: scroll.clientHeight,
      scrollHeight: scroll.scrollHeight,
      scrollBottom: scroll.getBoundingClientRect().bottom,
      cardBottom: card.getBoundingClientRect().bottom,
      packagingTop: packaging.getBoundingClientRect().top,
    };
  });

  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  expect(geometry.scrollBottom).toBeLessThanOrEqual(geometry.cardBottom);
  expect(geometry.cardBottom).toBeLessThanOrEqual(geometry.packagingTop);
});

test("marketing matches the 1280 by 720 reference composition", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop reference baseline is sufficient");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/marketing");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Marketing intelligence" })).toBeVisible();
  await expect(page).toHaveScreenshot("f3-marketing-reference-1280x720.png", {
    fullPage: true,
    animations: "disabled",
  });
});
