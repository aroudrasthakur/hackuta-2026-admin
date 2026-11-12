import { expect, test, type Page } from "@playwright/test";
import { E2E_BADGES, E2E_SCAN_VOLUNTEER } from "../../shared/admin/e2e/credentials";
import { E2E_ADMIN, signInOrganizer, signInOrganizerOnLoginPage, signInVolunteer, signOutOrganizer } from "./fixtures/auth";
import { installQrCamera, scanQr } from "./fixtures/qrCamera";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

async function openShop(page: Page) {
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Shop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shop", exact: true })).toBeVisible();
}

async function openSection(page: Page, name: "Items" | "Flash sales" | "History") {
  const tab = page.getByRole("navigation", { name: "Shop sections" }).getByRole("link", { name: new RegExp(name) });
  await expect(tab).toBeVisible();
  await tab.click();
}

async function signInShopVolunteer(page: Page) {
  await installQrCamera(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_SCAN_VOLUNTEER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_SCAN_VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
}

const lookUp = scanQr;

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe("admin shop", () => {
  test("configures a cooldown, blocks a repeat scan, and allows disabling it", async ({ page }) => {
    await installQrCamera(page);
    await signInOrganizer(page, E2E_ADMIN);
    await openShop(page);
    await page.getByRole("button", { name: "Edit Sticker pack", exact: true }).click();
    let drawer = page.getByRole("dialog", { name: "Edit Sticker pack" });
    await drawer.getByLabel("Enable purchase cooldown").check();
    await expect(drawer.getByLabel("Cooldown (minutes)")).toHaveValue("60");
    await drawer.getByRole("button", { name: "Save item" }).click();
    await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Sticker pack", exact: true }) })).toContainText("60 min");
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Scan", exact: true }).click();
    await page.getByRole("link", { name: /Shop redemption/ }).click();
    await lookUp(page, E2E_BADGES.ready);
    await page.getByRole("button", { name: /Sticker pack/ }).click();
    await page.getByRole("button", { name: "Review purchase" }).click();
    await page.getByRole("button", { name: "Confirm · 50 pts" }).click();
    await expect(page.getByRole("status")).toContainText("Purchase complete");
    await page.getByRole("button", { name: "Scan next" }).click();
    await lookUp(page, E2E_BADGES.ready);
    await page.getByRole("button", { name: /Sticker pack/ }).click();
    await page.getByRole("button", { name: "Review purchase" }).click();
    await expect(page.getByRole("alert")).toContainText("Purchase Cooldown Active");
    await expect(page.getByRole("alert")).toContainText("Sticker pack can be purchased again in 60 min");
    await expect(page.getByRole("button", { name: "Confirm purchase", exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 375, height: 812 });
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Change item" }).click();
    await expect(page.getByRole("heading", { name: "Choose an item" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    await openShop(page);
    await page.getByRole("button", { name: "Edit Sticker pack", exact: true }).click();
    drawer = page.getByRole("dialog", { name: "Edit Sticker pack" });
    await expect(drawer.getByLabel("Enable purchase cooldown")).toBeChecked();
    await drawer.getByLabel("Enable purchase cooldown").uncheck();
    await drawer.getByRole("button", { name: "Save item" }).click();
    await page.getByRole("button", { name: "Edit Sticker pack", exact: true }).click();
    await expect(drawer.getByLabel("Enable purchase cooldown")).not.toBeChecked();
  });

  test("manages items, volunteers, and flash sales", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await openShop(page);
    const table = page.getByRole("region", { name: "Shop items" });
    await expect(table.getByRole("rowheader", { name: /HackUTA 2026 T-shirt/ })).toBeVisible();
    await expect(table).toContainText("On sale");
    await expect(page.getByRole("img", { name: "HackUTA" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Add item" }).click();
    const drawer = page.getByRole("dialog", { name: "Add item" });
    await drawer.getByLabel("Name").fill("Bucket hat");
    await drawer.getByLabel("Price (points)").fill("250");
    await drawer.getByRole("button", { name: "Save item" }).click();
    await expect(page.locator(".admin-callout--success")).toContainText("Bucket hat added.");
    await expect(table.getByRole("rowheader", { name: /Bucket hat/ })).toBeVisible();

    const access = page.getByRole("switch", { name: "Shop access for E2E Volunteer" });
    await expect(access).toHaveAttribute("aria-checked", "false");
    await access.click();
    await expect(access).toHaveAttribute("aria-checked", "true");
    await reviewScreenshot(page, "test-results/shop-admin-items.png");

    await openSection(page, "Flash sales");
    await expect(page.getByText("Midnight tee sale")).toBeVisible();
    await page.getByLabel("Title").fill("Late-night drop");
    await page.getByLabel("Sale description").fill("Discounted stickers for the late shift.");
    await page.getByRole("button", { name: "Add an item" }).click();
    await page.getByLabel("Item 1").selectOption({ label: "HackUTA 2026 T-shirt" });
    await page.getByLabel("Sale price for HackUTA 2026 T-shirt").fill("250");
    await page.getByRole("button", { name: "Schedule sale" }).click();
    await expect(page.getByRole("alert")).toContainText("already in another sale during that time");

    await page.getByLabel("Item 1").selectOption({ label: "Sticker pack" });
    await page.getByLabel("Sale price for Sticker pack").fill("30");
    await page.getByRole("button", { name: "Schedule sale" }).click();
    await expect(page.locator(".admin-callout--success")).toContainText("Sale scheduled.");
    await expect(page.locator(".shop-sale", { hasText: "Late-night drop" })).toContainText("Scheduled");
    await reviewScreenshot(page, "test-results/shop-admin-sales.png");
    const sale = page.locator(".shop-sale", { hasText: "Late-night drop" });
    await sale.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Sale description")).toHaveValue("Discounted stickers for the late shift.");
    await page.getByLabel("Sale price for Sticker pack").fill("25");
    await page.getByRole("button", { name: "Save sale", exact: true }).click();
    await expect(sale).toContainText("Sticker pack: 25");
    await sale.getByRole("button", { name: "Cancel sale", exact: true }).click();
    await sale.getByRole("button", { name: "Confirm cancel", exact: true }).click();
    await expect(sale).toContainText("Cancelled");
    await expect(page.locator(".admin-callout--success")).toHaveText("Late-night drop cancelled. Normal prices are back.");
    await expect(page.getByRole("main")).not.toContainText(/notification/i);
  });

  test("hides shop redemption from volunteers without shop access", async ({ page }) => {
    await signInVolunteer(page);
    await expect(page.getByRole("navigation", { name: "Volunteer" }).getByRole("link", { name: "Shop" })).toHaveCount(0);
    await expect(page.getByText("Shop redemption")).toHaveCount(0);
  });
});

test.describe("volunteer shop purchase", () => {
  test.use({ permissions: ["camera"] });

  test("charges once, explains a duplicate, blocks a short balance, and allows a refund", async ({ page }) => {
    await signInShopVolunteer(page);
    await page.getByRole("navigation", { name: "Volunteer" }).getByRole("link", { name: "Shop", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Shop redemption" })).toBeVisible();

    await lookUp(page, E2E_BADGES.ready);
    const customer = page.getByRole("region", { name: "Participant" });
    await expect(customer).toContainText("Riley Ready");
    await expect(customer).toContainText("1,250");
    await expect(page.getByRole("button", { name: /Insulated bottle/ })).toBeEnabled();

    await page.getByRole("button", { name: /HackUTA 2026 T-shirt/ }).click();
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Review purchase" }).click();
    const review = page.getByRole("region", { name: "Review purchase" });
    await expect(review).toContainText("Total600 pts");
    await expect(review).toContainText("Balance after650 pts");
    await expectNoHorizontalScroll(page);
    await reviewScreenshot(page, "test-results/shop-volunteer-review-mobile.png");

    await page.evaluate(() => (window as Window & { __dropNextE2eShopPurchase?: () => void }).__dropNextE2eShopPurchase?.());
    await page.getByRole("button", { name: "Confirm · 600 pts" }).click();
    await expect(page.getByRole("alert")).toContainText("Connection problem");
    await page.getByRole("button", { name: "Confirm · 600 pts" }).click();
    const result = page.getByRole("status").filter({ hasText: "Already purchased" });
    await expect(result).toContainText("No extra points were taken.");
    await expect(result).toContainText("New balance650 pts");
    await expect(page.getByRole("button", { name: "Scan next" })).toBeFocused();
    await reviewScreenshot(page, "test-results/shop-volunteer-duplicate-mobile.png");

    await page.getByRole("button", { name: "Scan next" }).click();
    await lookUp(page, E2E_BADGES.ready);
    await expect(customer).toContainText("650");
    await page.getByRole("button", { name: /Mechanical keyboard/ }).click();
    await page.getByRole("button", { name: "Review purchase" }).click();
    await expect(page.getByRole("alert")).toContainText("Riley Ready has 650 points and needs 2,500");
    await expect(page.getByRole("button", { name: "Confirm · 2,500 pts" })).toBeDisabled();
    await expectNoHorizontalScroll(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await signOutOrganizer(page);
    await signInOrganizerOnLoginPage(page, E2E_ADMIN);
    await openShop(page);
    await openSection(page, "History");
    const purchases = page.getByRole("region", { name: "Purchases" });
    await expect(purchases).toContainText("1 purchases shown");
    await expect(purchases).toContainText("Midnight tee sale");
    await page.getByRole("button", { name: "Refund Riley Ready's HackUTA 2026 T-shirt" }).click();
    const refund = page.getByRole("dialog", { name: "Refund purchase" });
    await refund.getByLabel("Reason").fill("Wrong size");
    await refund.getByRole("button", { name: "Refund points" }).click();
    await expect(page.locator(".admin-callout--success")).toContainText("600 points returned to Riley Ready.");
    await expect(purchases).toContainText("Refunded");
  });
});
