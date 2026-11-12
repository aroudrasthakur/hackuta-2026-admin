import { expect, test, type Page } from "@playwright/test";
import { E2E_BADGES, E2E_SCAN_VOLUNTEER } from "../../shared/admin/e2e/credentials";
import { E2E_ADMIN, signInOrganizer, signInOrganizerOnLoginPage, signOutOrganizer } from "./fixtures/auth";
import { installQrCamera, scanQr } from "./fixtures/qrCamera";

test.use({ permissions: ["camera"] });

async function shop(page: Page) {
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Shop", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shop", exact: true })).toBeVisible();
}

async function setCooldown(page: Page, minutes: string | null, price?: string) {
  await shop(page);
  await page.getByRole("button", { name: "Edit Sticker pack", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit Sticker pack" });
  await dialog.getByLabel("Enable purchase cooldown").setChecked(minutes !== null);
  if (minutes !== null) await dialog.getByLabel("Cooldown (minutes)").fill(minutes);
  if (price !== undefined) await dialog.getByLabel("Price (points)").fill(price);
  await dialog.getByRole("button", { name: "Save item" }).click();
  await expect(dialog).not.toBeVisible();
}

async function scanShop(page: Page, role: "admin" | "volunteer" = "admin") {
  if (role === "admin") {
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Scan", exact: true }).click();
    await page.getByRole("link", { name: /Shop redemption/ }).click();
  } else {
    await page.getByRole("navigation", { name: "Volunteer" }).getByRole("link", { name: "Shop", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Shop redemption", exact: true })).toBeVisible();
}

async function review(page: Page, badge: string = E2E_BADGES.ready, item = "Sticker pack") {
  await scanQr(page, badge);
  await page.getByRole("button", { name: new RegExp(item) }).click();
  await page.getByRole("button", { name: "Review purchase", exact: true }).click();
}

async function buy(page: Page, cost = 50) {
  await page.getByRole("button", { name: `Confirm · ${cost} pts`, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Purchase complete" })).toBeVisible();
}

async function volunteerLoginWithoutReload(page: Page) {
  await signOutOrganizer(page);
  await page.getByLabel("Email").fill(E2E_SCAN_VOLUNTEER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_SCAN_VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await installQrCamera(page);
  await signInOrganizer(page, E2E_ADMIN);
});

test("validates cooldown input, accepts fractions, and supports keyboard save and Escape", async ({ page }) => {
  await shop(page);
  const edit = page.getByRole("button", { name: "Edit Sticker pack", exact: true });
  await edit.click();
  const dialog = page.getByRole("dialog", { name: "Edit Sticker pack" });
  await dialog.getByLabel("Enable purchase cooldown").check();
  for (const value of ["", "0", "-1", "abc", "Infinity", "1e309"]) {
    await dialog.getByLabel("Cooldown (minutes)").fill(value);
    await dialog.getByRole("button", { name: "Save item" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Enter a positive number of minutes.");
    await expect(dialog.getByLabel("Cooldown (minutes)")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Cooldown (minutes)")).toHaveAccessibleDescription(/Enter a positive number of minutes/);
  }
  await dialog.getByLabel("Cooldown (minutes)").fill("0.5");
  await dialog.getByLabel("Cooldown (minutes)").press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Sticker pack", exact: true }) })).toContainText("0.5 min");
  await edit.click();
  await expect(dialog.getByLabel("Cooldown (minutes)")).toHaveValue("0.5");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(edit).toBeFocused();
});

for (const role of ["admin", "volunteer"] as const) {
  test(`${role} cooldown is per participant and item, with unchanged balance on a blocked attempt`, async ({ page }) => {
    await setCooldown(page, "60", "40");
    if (role === "volunteer") await volunteerLoginWithoutReload(page);
    await scanShop(page, role);
    await review(page);
    await buy(page, 40);
    await page.getByRole("button", { name: "Scan next", exact: true }).click();
    await review(page);
    await expect(page.getByRole("alert")).toContainText("Purchase Cooldown Active");
    await expect(page.getByRole("alert")).toContainText("60 min");
    await expect(page.getByRole("region", { name: "Participant", exact: true })).toContainText("1,210");
    await expect(page.getByRole("button", { name: "Confirm purchase", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Change item", exact: true }).click();
    await page.getByRole("button", { name: /HackUTA 2026 T-shirt/ }).click();
    await page.getByRole("button", { name: "Review purchase", exact: true }).click();
    await expect(page.getByRole("button", { name: "Confirm · 300 pts", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Scan another participant", exact: true }).click();
    await review(page, E2E_BADGES.checkedIn);
    await expect(page.getByRole("region", { name: "Participant", exact: true })).toContainText("Morgan Present");
    await buy(page, 40);
    if (role === "volunteer") {
      await signOutOrganizer(page);
      await signInOrganizerOnLoginPage(page, E2E_ADMIN);
    }
    await shop(page);
    await page.getByRole("navigation", { name: "Shop sections" }).getByRole("link", { name: /History/ }).click();
    await expect(page.getByRole("region", { name: "Purchases", exact: true })).toContainText("2 purchases shown");
  });
}

test("a 60-minute cooldown expires in the open review screen without rescanning", async ({ page }) => {
  await setCooldown(page, "60");
  await scanShop(page);
  await review(page);
  await buy(page);
  await page.getByRole("button", { name: "Scan next", exact: true }).click();
  await review(page);
  await expect(page.getByRole("alert")).toContainText("Purchase Cooldown Active");
  await page.clock.fastForward(59 * 60_000);
  await expect(page.getByRole("button", { name: "Confirm purchase", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("1 min");
  await page.clock.fastForward(61_000);
  await expect(page.getByRole("button", { name: "Confirm · 50 pts", exact: true })).toBeEnabled();
  await buy(page);
  await expect(page.getByText("New balance1,150 pts")).toBeVisible();
});

test("enabling and disabling cooldowns immediately affects existing purchase history", async ({ page }) => {
  await scanShop(page);
  await review(page);
  await buy(page);
  await setCooldown(page, "60");
  await scanShop(page);
  await review(page);
  await expect(page.getByRole("alert")).toContainText("Purchase Cooldown Active");
  await setCooldown(page, null);
  await scanShop(page);
  await review(page);
  await buy(page);
  await expect(page.getByText("New balance1,150 pts")).toBeVisible();
});

test("a refund clears the cooldown and restores points without erasing purchase history", async ({ page }) => {
  await setCooldown(page, "60");
  await scanShop(page);
  await review(page);
  await buy(page);
  await shop(page);
  await page.getByRole("navigation", { name: "Shop sections" }).getByRole("link", { name: /History/ }).click();
  await page.getByRole("button", { name: "Refund Riley Ready's Sticker pack", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Refund purchase", exact: true });
  await dialog.getByLabel("Reason").fill("Returned unopened");
  await dialog.getByRole("button", { name: "Refund points", exact: true }).click();
  await expect(page.getByRole("region", { name: "Purchases", exact: true })).toContainText("Refunded");
  await scanShop(page);
  await review(page);
  await expect(page.getByRole("region", { name: "Participant", exact: true })).toContainText("1,250");
  await buy(page);
  await shop(page);
  await page.getByRole("navigation", { name: "Shop sections" }).getByRole("link", { name: /History/ }).click();
  await expect(page.getByRole("region", { name: "Purchases", exact: true })).toContainText("2 purchases shown");
});

test("a lost purchase response retries idempotently even though the cooldown is now active", async ({ page }) => {
  await setCooldown(page, "60");
  await scanShop(page);
  await review(page);
  await page.evaluate(() => (window as Window & { __dropNextE2eShopPurchase?: () => void }).__dropNextE2eShopPurchase?.());
  await page.getByRole("button", { name: "Confirm · 50 pts", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Connection problem" })).toBeVisible();
  // The reactive preview must not strand an uncertain attempt behind its own cooldown.
  await expect(page.getByRole("button", { name: "Confirm · 50 pts", exact: true })).toBeEnabled();
  await expect(page.getByText("Nothing was charged.")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm · 50 pts", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Already purchased" })).toContainText("No extra points were taken.");
  await expect(page.getByText("New balance1,200 pts")).toBeVisible();
});

for (const width of [320, 375, 768, 1280]) {
  test(`cooldown controls fit at ${width}px and 200% text zoom`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await shop(page);
    await page.getByRole("button", { name: "Edit Sticker pack", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Sticker pack" });
    await dialog.getByLabel("Enable purchase cooldown").check();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(dialog.getByLabel("Cooldown (minutes)")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save item" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  });
}
