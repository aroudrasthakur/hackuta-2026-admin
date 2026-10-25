import { test, expect } from "@playwright/test";
import { E2E_REVIEWER, signInOrganizer, signOutOrganizer } from "./fixtures/auth";
import { E2E_VOLUNTEER } from "../../shared/admin/e2e/credentials";

test.describe("organizer authentication", () => {
  async function signInVolunteer(page: import("@playwright/test").Page) {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(E2E_VOLUNTEER.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_VOLUNTEER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/volunteer$/);
    await expect(page.getByRole("heading", { name: "Volunteer access" })).toBeVisible();
  }

  test("keeps volunteer sessions out of review pages and permits signing out", async ({ page }) => {
    await signInVolunteer(page);
    await expect(page.locator("dd")).toHaveText(["Enabled", "Not assigned"]);
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
    for (const path of ["/admin/applications", "/admin/decision-emails", "/admin/applications/e2e-app-unreviewed"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/volunteer$/);
      await expect(page.getByRole("heading", { name: "Volunteer access" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
    }
    await signOutOrganizer(page);
  });

  test("returns an idle volunteer session to login when it expires", async ({ page }) => {
    await page.clock.install();
    await signInVolunteer(page);
    await page.clock.fastForward(24 * 60 * 60 * 1000 + 1000);
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole("alert")).toHaveText("Your session has expired. Please sign in again.");
  });
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
    await page.getByLabel("Password", { exact: true }).fill("WrongPassword1!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test("reveals and hides the password on the sign-in form", async ({ page }) => {
    await page.goto("/admin/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("SecurePass1");
    await expect(password).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await expect(password).toHaveValue("SecurePass1");

    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("SecurePass1");
  });

  test("signs in and signs out", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await expect(page.locator(".admin-topbar__identity-name")).toHaveText(E2E_REVIEWER.name);
    await signOutOrganizer(page);
    await page.goto("/admin/applications");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  for (const failure of ["network", "HTTP"] as const) {
    test(`shows a retryable error after a ${failure} sign-out failure`, async ({ page }) => {
      await signInOrganizer(page, E2E_REVIEWER);
      await page.route("**/api/admin/sign-out", (route) => failure === "network"
        ? route.abort("failed")
        : route.fulfill({ status: 503, contentType: "text/plain", body: "Temporarily unavailable" }));

      await page.getByRole("button", { name: "Sign out" }).click();
      await expect(page.getByRole("alert")).toHaveText("Unable to sign out. Please try again.");
      await expect(page).toHaveURL(/\/admin\/applications$/);
      await expect(page.getByRole("button", { name: "Sign out" })).toBeEnabled();

      await page.unroute("**/api/admin/sign-out");
      await signOutOrganizer(page);
      await page.reload();
      await expect(page).toHaveURL(/\/admin\/login$/);
      await expect(page.getByRole("heading", { name: "Organizer sign-in" })).toBeVisible();
    });
  }
});
