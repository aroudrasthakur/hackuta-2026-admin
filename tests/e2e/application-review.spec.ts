import { test, expect } from "@playwright/test";
import {
  E2E_ADMIN,
  E2E_APPLICATION_IDS,
  E2E_REVIEWER,
  signInOrganizer,
} from "./fixtures/auth";
import { resetE2eMockBackend } from "./fixtures/resetMock";

test.describe("application review workflow", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eMockBackend(page);
  });
  test("reviewer can start review on an unreviewed application", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.unreviewed}`);
    await expect(page.getByRole("region", { name: "Review claim" })).toBeVisible();
    await page.getByRole("button", { name: "Start review" }).click();
    await expect(page.getByText(/Review (started|activity refreshed)\./)).toBeVisible();
  });

  test("reviewer confirms waitlist decision with two-step flow", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await page.getByRole("button", { name: "Waitlist" }).click();
    await expect(page.getByRole("heading", { name: "Confirm waitlist" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm waitlist" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Waitlist" })).toBeVisible();

    await page.getByRole("button", { name: "Waitlist" }).click();
    await page.getByRole("button", { name: "Confirm waitlist" }).click();
    await expect(page.getByText("Review status: Waitlisted")).toBeVisible();
    await expect(page.getByRole("button", { name: "Accept from waitlist", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Accept from waitlist", exact: true }).click();
    await page.getByRole("button", { name: "Confirm acceptance", exact: true }).click();
    await expect(page.getByText("Review status: Accepted")).toBeVisible();
    await expect(page.getByRole("region", { name: "Application decision" })).toHaveCount(0);
    const notification = page.getByRole("region", { name: "Applicant notification" });
    await expect(notification).toContainText("Sending has not yet been confirmed");
    await notification.getByRole("button", { name: "Check email status" }).click();
    await expect(notification).toContainText("notification was sent");
  });

  test("finalized application hides decision controls", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.accepted}`);
    await expect(page.getByText(/final decision/i)).toBeVisible();
    await expect(page.getByRole("region", { name: "Application decision" })).toHaveCount(0);
  });

  test("admin sees review history on accepted applications", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.accepted}`);
    await expect(page.getByRole("region", { name: "Review history" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Review history" }).getByText("Accepted applicant"),
    ).toBeVisible();
  });

  test("reviewer cannot see admin-only review history section", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.accepted}`);
    await expect(page.getByRole("region", { name: "Review history" })).toHaveCount(0);
  });
});
