import { test, expect } from "@playwright/test";
import { E2E_ADMIN, E2E_REVIEWER, signInOrganizer, signInVolunteer, signOutOrganizer } from "./fixtures/auth";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

test.describe("organizer authentication", () => {
  test("keeps volunteer sessions out of review pages and permits signing out", async ({ page }) => {
    await signInVolunteer(page);
    await expect(page.getByRole("navigation", { name: "Volunteer" }).getByRole("link")).toHaveText(["Dashboard", "Check-in"]);
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
    for (const path of ["/admin/applications", "/admin/decision-emails", "/admin/applications/e2e-app-unreviewed", "/admin/participants", "/admin/volunteers", "/admin/meals", "/admin/scan/food", "/admin/scan/points"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/scan$/);
      await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
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

  test("preserves an authorized review deep link through sign-in", async ({ page }) => {
    await page.goto("/admin/applications/e2e-app-unreviewed?source=direct");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.getByLabel("Email").fill(E2E_REVIEWER.email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_REVIEWER.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/applications\/e2e-app-unreviewed\?source=direct$/);
    await expect(page.getByRole("heading", { name: "Taylor Unreviewed" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Taylor Unreviewed" })).toBeVisible();
  });

  test("restricts management pages to administrators", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link")).toHaveText(["Applications", "Decision emails"]);
    for (const path of ["/admin/participants", "/admin/volunteers", "/admin/volunteers/e2e-admin-lead", "/admin/events", "/admin/meals", "/admin/shop", "/admin/notifications"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/applications$/);
      await expect(page.getByRole("alert")).toContainText("current permissions");
    }
    await signOutOrganizer(page);
    await signInOrganizer(page, E2E_ADMIN);
    await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link")).toHaveText(["Applications", "Decision emails", "Participants", "Volunteers", "Events", "Meals", "Shop", "Send Notifications"]);
    await page.getByRole("link", { name: "Participants", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Participants", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Volunteers", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Volunteers", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Events", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
  });

  test("supports volunteer scan navigation, refresh, and history on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signInVolunteer(page);
    const navigation = page.getByRole("navigation", { name: "Volunteer" });
    await expect(navigation.getByRole("link")).toHaveText(["Dashboard", "Check-in"]);
    await navigation.getByRole("link", { name: "Check-in", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/scan\/check-in$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/admin\/scan$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/admin\/scan\/check-in$/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Participant check-in", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to volunteer dashboard" }).click();
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await reviewScreenshot(page, "test-results/volunteer-dashboard-mobile.png");
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
