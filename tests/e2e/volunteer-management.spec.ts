import { expect, test } from "@playwright/test";
import { PASSWORD_REQUIREMENTS_MESSAGE } from "../../shared/auth/password";
import { ADMIN_ERROR_MESSAGES } from "../../shared/admin/errors";
import { E2E_ADMIN, E2E_VOLUNTEER, signInOrganizer, signOutOrganizer } from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
});

function adminNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "Admin", exact: true });
}

test("admins create, edit, and switch off events", async ({ page }) => {
  await adminNav(page).getByRole("link", { name: "Events", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();
  const events = page.getByRole("list", { name: "Events" });
  await expect(events.getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Event name").fill("Opening Ceremony");
  await page.getByLabel("Points per participant").fill("5");
  await page.getByLabel("Starts").fill("2026-10-25T09:00");
  await page.getByLabel("Ends").fill("2026-10-25T08:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("alert")).toHaveText("The event must end after it starts.");
  await page.getByLabel("Ends").fill("2026-10-25T10:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("status")).toHaveText("“Opening Ceremony” was created and switched on.");
  const created = events.getByRole("listitem").filter({ hasText: "Opening Ceremony" });
  await expect(created).toContainText("5 points");

  await created.getByRole("button", { name: "Edit Opening Ceremony" }).click();
  await page.getByLabel("Points per participant").fill("8");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("“Opening Ceremony” was updated.");
  await expect(created).toContainText("8 points");

  await page.getByRole("button", { name: "Edit Career Panel" }).click();
  await expect(page.getByLabel("Points per participant")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();

  await created.getByRole("button", { name: "Switch off Opening Ceremony" }).click();
  await expect(created).toContainText("Switched off");
  await expect(created.getByRole("button", { name: "Switch on Opening Ceremony" })).toBeVisible();
});

test("admins review volunteers, open one volunteer's log, and assign events", async ({ page }) => {
  await adminNav(page).getByRole("link", { name: "Volunteers", exact: true }).click();
  const roster = page.getByRole("table").first();
  await expect(roster.getByRole("row", { name: /E2E Lead Volunteer/ })).toContainText("Intro to Hardware, Career Panel");
  await expect(roster.getByRole("row", { name: /E2E Volunteer volunteer@/ })).toContainText("None");
  const activity = page.getByRole("region", { name: "Activity log" });
  await expect(activity.getByRole("row")).toHaveCount(3);
  await activity.getByLabel("Action").selectOption("check_in");
  await expect(activity.getByRole("row")).toHaveCount(2);

  await roster.getByRole("link", { name: "E2E Volunteer", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/volunteers\/e2e-admin-volunteer$/);
  await expect(page.getByRole("heading", { name: "E2E Volunteer", level: 1 })).toBeVisible();
  await expect(adminNav(page).locator('[aria-current="page"]')).toHaveText("Volunteers");
  await expect(page.getByRole("region", { name: "E2E Volunteer's activity" })).toContainText("No activity yet");

  await page.getByRole("switch", { name: "Assign Intro to Hardware" }).click();
  await page.getByRole("button", { name: "Save event assignments" }).click();
  await expect(page.getByRole("status")).toHaveText("Event assignments saved (1 added, 0 removed).");
  await expect(page.getByRole("region", { name: "Account history" })).toContainText("Event assignments changed by E2E Admin · 1 added, 0 removed");

  await page.getByRole("link", { name: "← All volunteers" }).click();
  await expect(page.getByRole("table").first().getByRole("row", { name: /E2E Volunteer volunteer@/ })).toContainText("Intro to Hardware");
});

test("admins assign all current and future events to a volunteer", async ({ page }) => {
  await adminNav(page).getByRole("link", { name: "Volunteers", exact: true }).click();
  await page.getByRole("link", { name: "E2E Volunteer", exact: true }).click();
  await page.getByRole("switch", { name: "All events" }).click();
  await page.getByRole("button", { name: "Save event assignments" }).click();
  await expect(page.getByRole("status")).toHaveText("This volunteer can award points for every event, including ones added later.");
  await expect(page.getByText("Points: all events")).toBeVisible();

  await page.getByRole("link", { name: "← All volunteers" }).click();
  await expect(page.getByRole("table").first().getByRole("row", { name: /E2E Volunteer volunteer@/ })).toContainText("All events");

  await adminNav(page).getByRole("link", { name: "Events", exact: true }).click();
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  await page.getByLabel("Event name").fill("Lightning Talks");
  await page.getByLabel("Points per participant").fill("15");
  await page.getByLabel("Starts").fill("2026-10-25T14:00");
  await page.getByLabel("Ends").fill("2026-10-25T15:00");
  await page.getByRole("button", { name: "Create event" }).click();
  await expect(page.getByRole("status")).toHaveText("“Lightning Talks” was created and switched on.");

  await signOutOrganizer(page);
  await page.getByLabel("Email").fill(E2E_VOLUNTEER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/scan$/);
  await expect(page.getByRole("link", { name: /Scan points for Lightning Talks/ })).toBeVisible();
});

test("admins create a standalone volunteer with an email and password", async ({ page }) => {
  await adminNav(page).getByRole("link", { name: "Volunteers", exact: true }).click();
  await page.getByRole("button", { name: "Add volunteer", exact: true }).click();
  await page.getByLabel("Full name").fill("Pat Standalone");
  await page.getByLabel("Sign-in email").fill("standalone@e2e.hackuta.test");
  await page.getByLabel("Initial password").fill("weak");
  await page.getByRole("button", { name: "Create volunteer" }).click();
  await expect(page.getByRole("alert")).toHaveText(PASSWORD_REQUIREMENTS_MESSAGE);

  await page.getByLabel("Initial password").fill("Standalone1");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Initial password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Create volunteer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Volunteer account created for standalone@e2e.hackuta.test." })).toBeVisible();
  const roster = page.getByRole("table").first();
  await expect(roster.getByRole("row", { name: /Pat Standalone/ })).toContainText("None");

  await page.getByRole("button", { name: "Add volunteer", exact: true }).click();
  await page.getByLabel("Full name").fill("Pat Duplicate");
  await page.getByLabel("Sign-in email").fill("standalone@e2e.hackuta.test");
  await page.getByLabel("Initial password").fill("Standalone1");
  await page.getByRole("button", { name: "Create volunteer" }).click();
  await expect(page.getByRole("alert")).toHaveText(ADMIN_ERROR_MESSAGES.STAFF_ACCOUNT_EXISTS);

  await page.getByRole("link", { name: "Manage access" }).click();
  await expect(page).toHaveURL(/\/admin\/volunteers\/e2e-volunteer-/);
  await expect(page.getByRole("heading", { name: "Pat Standalone", level: 1 })).toBeVisible();
});
