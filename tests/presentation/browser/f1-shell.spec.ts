import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("desktop shell, URL state, navigation, and accessibility", async ({ page }) => {
  await page.goto("/executive");
  await expect(page).toHaveURL(
    /\/executive\?start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}&comparison=none/,
  );
  await expect(page.getByRole("navigation", { name: "Dashboard sections" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Executive health" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("Synthetic TEST data", { exact: true })).toBeVisible();

  await page.getByLabel("Reporting period").selectOption("last_90_days");
  await expect(page).toHaveURL(/start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}/);
  await page.getByLabel("Comparison period").selectOption("previous_year");
  await expect(page).toHaveURL(/comparison=previous_year/);
  await page.goBack();
  await expect(page.getByLabel("Comparison period")).toHaveValue("none");
  await page.goForward();
  await expect(page.getByLabel("Comparison period")).toHaveValue("previous_year");
  await page.getByLabel("Comparison period").selectOption("none");
  await expect(page).toHaveURL(/comparison=none/);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page).toHaveScreenshot("f1-shell.png", { fullPage: true });
});

test("invalid URL values recover to the B7 allowlist", async ({ page }) => {
  await page.goto(
    "/products?start=bad&end=2026-08-07&comparison=future&channels=Unknown&provider=shopify",
  );
  await expect(page).toHaveURL(
    /\/products\?start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}&comparison=none$/,
  );
  await expect(page.getByRole("heading", { name: "Product intelligence" })).toBeVisible();
});

test("keyboard navigation and responsive drawer preserve focus", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 768 });
  await page.goto("/executive");
  const menu = page.getByRole("button", { name: "Open navigation" });
  await menu.focus();
  await menu.press("Enter");
  await expect(page.getByRole("button", { name: "Close navigation" }).last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();

  await menu.press("Enter");
  const executive = page.getByRole("link", { name: "Executive health" });
  await executive.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("link", { name: "Revenue intelligence" })).toBeFocused();
});

test("unsupported route renders the approved not-found state", async ({ page }) => {
  const response = await page.goto("/settings");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/not approved for V1|does not exist/)).toBeVisible();
});
