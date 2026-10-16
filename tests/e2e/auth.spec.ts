import { test, expect } from "@playwright/test";
import { E2E_REVIEWER, signInOrganizer, signOutOrganizer } from "./fixtures/auth";

test.describe("organizer authentication", () => {
  test("redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin/applications");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("heading", { name: "Organizer sign-in" })).toBeVisible();
  });

  test("redirects home to applications after sign-in", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto("/");
    await expect(page).toHaveURL(/\/admin\/applications$/);
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(E2E_REVIEWER.email);
    await page.getByLabel("Password").fill("WrongPassword1!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("signs in and signs out", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await expect(page.locator(".admin-topbar__identity-name")).toHaveText(E2E_REVIEWER.name);
    await signOutOrganizer(page);
    await page.goto("/admin/applications");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
