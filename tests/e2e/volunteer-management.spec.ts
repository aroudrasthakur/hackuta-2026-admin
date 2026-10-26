import { expect, test } from "@playwright/test";
import { E2E_ADMIN, signInOrganizer } from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
});

function adminNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "Admin", exact: true });
}

test("admins create, edit, and deactivate events", async ({ page }) => {
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
  await expect(page.getByRole("status")).toHaveText("“Opening Ceremony” was created and is active.");
  const created = events.getByRole("listitem").filter({ hasText: "Opening Ceremony" });
  await expect(created).toContainText("5 points");

  await page.getByRole("button", { name: "Edit Career Panel" }).click();
  await expect(page.getByLabel("Points per participant")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();

  await created.getByRole("button", { name: "Deactivate Opening Ceremony" }).click();
  await expect(created).toContainText("Inactive");
  await expect(created.getByRole("button", { name: "Activate Opening Ceremony" })).toBeVisible();
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

  await page.getByRole("checkbox", { name: /Intro to Hardware/ }).check();
  await page.getByRole("button", { name: "Save event assignments" }).click();
  await expect(page.getByRole("status")).toHaveText("Event assignments saved (1 added, 0 removed).");
  await expect(page.getByRole("region", { name: "Account history" })).toContainText("Event assignments changed by E2E Admin · 1 added, 0 removed");

  await page.getByRole("link", { name: "← All volunteers" }).click();
  await expect(page.getByRole("table").first().getByRole("row", { name: /E2E Volunteer volunteer@/ })).toContainText("Intro to Hardware");
});
