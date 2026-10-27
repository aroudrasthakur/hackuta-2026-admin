import { expect, test, type Page } from "@playwright/test";
import { E2E_BADGES, E2E_SCAN_VOLUNTEER } from "../../shared/admin/e2e/credentials";
import { E2E_ADMIN, signInOrganizerOnLoginPage, signOutOrganizer } from "./fixtures/auth";
import { setMealScenario } from "./fixtures/meals";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

async function start(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_SCAN_VOLUNTEER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_SCAN_VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
  await setMealScenario(page, "serving");
  await page.getByRole("navigation").getByRole("link", { name: "Food", exact: true }).click();
}
async function scan(page: Page, token: string = E2E_BADGES.ready) {
  await page.getByLabel("Or enter the badge code").fill(token);
  await page.getByRole("button", { name: "Look up badge" }).click();
}

test("collects once per meal, preserves legacy eligibility, and automatically moves to the next serving window", async ({ page }, info) => {
  await page.clock.install(); await start(page);
  await expect(page.getByText("Lunch", { exact: true })).toBeVisible();
  await scan(page); await expect(page.getByText("Vegetarian; Allergies: peanuts")).toBeVisible();
  await reviewScreenshot(page, "meal-confirm-mobile.png", info);
  await page.getByRole("button", { name: "Confirm food given" }).click();
  await expect(page.getByRole("status")).toContainText("food collection for Lunch is recorded");
  await page.getByRole("button", { name: "Scan next" }).click(); await scan(page);
  await expect(page.getByRole("status")).toContainText("Food Already Collected");
  await expect(page.getByRole("status")).toContainText("already received their food for Lunch.");
  await expect(page.getByRole("button", { name: "Scan next" })).toBeFocused();
  await reviewScreenshot(page, "meal-duplicate-mobile.png", info);
  await page.getByRole("button", { name: "Scan next" }).click(); await scan(page, E2E_BADGES.checkedIn);
  await expect(page.getByRole("heading", { name: "Morgan Present" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm food given" }).click();
  await expect(page.getByRole("status")).toContainText("Food collected");
  await page.getByRole("button", { name: "Scan next" }).click();
  await page.clock.fastForward(60_000);
  await expect(page.getByText("Dinner", { exact: true })).toBeVisible();
  await scan(page); await page.getByRole("button", { name: "Confirm food given" }).click();
  await expect(page.getByRole("status")).toContainText("food collection for Dinner is recorded");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("requires a meal choice when multiple periods are available and clears private confirmation details on a switch", async ({ page }) => {
  await start(page); await setMealScenario(page, "multiple");
  await expect(page.getByRole("button", { name: "Look up badge" })).toHaveCount(0);
  await page.getByRole("radio", { name: /Lunch/ }).click(); await scan(page);
  await expect(page.getByText("Vegetarian; Allergies: peanuts")).toBeVisible();
  // Meal switching is locked while a participant confirmation is open.
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Change meal" }).click();
  await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);
  await page.getByRole("radio", { name: /Snack/ }).click();
  await expect(page.getByRole("heading", { name: "Riley Ready" })).toHaveCount(0);
  await scan(page); await page.getByRole("button", { name: "Confirm food given" }).click();
  await expect(page.getByRole("status")).toContainText("food collection for Snack is recorded");
});

for (const scenario of ["disabled", "future", "ended"] as const) {
  test(`clears the pending participant when the selected meal becomes ${scenario}`, async ({ page }) => {
    await start(page); await scan(page); await expect(page.getByRole("heading", { name: "Riley Ready" })).toBeVisible();
    await setMealScenario(page, scenario);
    await expect(page.getByText("No meals available", { exact: true })).toBeVisible();
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Confirm food given" })).toHaveCount(0);
  });
}

test("retains the meal confirmation while offline and safely retries", async ({ page, context }) => {
  await start(page); await scan(page); await context.setOffline(true);
  await page.getByRole("button", { name: "Confirm food given" }).click();
  await expect(page.getByRole("alert")).toContainText("Connection problem");
  await context.setOffline(false); await page.getByRole("button", { name: /Try again/ }).click();
  await expect(page.getByRole("status")).toContainText("food collection for Lunch is recorded");
});

test("shows the actual collection in admin served counts and history and protects it from removal", async ({ page }) => {
  await start(page); await scan(page); await page.getByRole("button", { name: "Confirm food given" }).click();
  await expect(page.getByRole("status")).toContainText("Food collected");
  await page.setViewportSize({ width: 1280, height: 900 });
  await signOutOrganizer(page); await signInOrganizerOnLoginPage(page, E2E_ADMIN);
  await page.getByRole("link", { name: "Meals", exact: true }).click();
  const lunchRow = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Lunch", exact: true }) });
  await expect(lunchRow.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Lunch", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "History for Lunch", exact: true }).click();
  await expect(page.getByRole("rowheader", { name: "Riley Ready", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "E2E Lead Volunteer", exact: true })).toBeVisible();
});
