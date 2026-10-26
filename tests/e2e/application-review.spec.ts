import { test, expect } from "@playwright/test";
import {
  E2E_ADMIN,
  E2E_APPLICATION_IDS,
  E2E_REVIEWER,
  signInOrganizer,
} from "./fixtures/auth";
import { resetE2eMockBackend } from "./fixtures/resetMock";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

test.describe("application review workflow", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eMockBackend(page);
  });
  test("keeps keyboard focus in the native resume dialog and restores it on close", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.getByRole("link", { name: "Review application for Taylor Unreviewed" }).click();
    const trigger = page.getByRole("button", { name: "Preview Resume" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      // Chromium may briefly focus the document at the native dialog's wrap point.
      expect(await dialog.evaluate((element) => element.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("reviewer can start review on an unreviewed application", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.unreviewed}`);
    await expect(page.getByRole("region", { name: "Review claim" })).toBeVisible();
    await page.getByRole("button", { name: "Start review" }).click();
    await expect(page.getByText(/Review (started|activity refreshed)\./)).toBeVisible();
  });

  test("puts identity and review evidence first and keeps secondary information expandable", async ({ page }, testInfo) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await expect(page.getByRole("region", { name: "Review claim" }).locator("p").first()).toHaveCSS("color", "rgb(48, 88, 115)");
    for (const width of [1440, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const name = page.getByRole("heading", { name: "Casey Decision" });
      const responses = page.getByRole("region", { name: "Application responses" });
      await expect(name).toBeVisible();
      expect((await name.boundingBox())!.y).toBeLessThan((await responses.boundingBox())!.y);
      if (width >= 1024) {
        expect((await responses.boundingBox())!.y).toBeLessThan(720);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 1440 || width === 375) await reviewScreenshot(page, `review-${width}.png`, testInfo);
    }
    await expect(page.getByRole("region", { name: "Personal and contact information" })).toBeHidden();
    await page.getByText("Additional applicant information", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Personal and contact information" })).toBeVisible();
    await page.getByText("Additional applicant information", { exact: true }).click();
    await expect(page.getByRole("region", { name: "Personal and contact information" })).toBeHidden();
  });

  test("reviewer confirms waitlist decision with two-step flow", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await page.getByRole("button", { name: "Change Decision" }).click();
    await page.getByRole("button", { name: "Waitlist" }).click();
    await expect(page.getByRole("heading", { name: "Confirm waitlist" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm waitlist" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Waitlist" })).toBeVisible();

    await page.getByRole("button", { name: "Waitlist" }).click();
    await page.getByRole("button", { name: "Confirm waitlist" }).click();
    await expect(page.locator(".application-review-identity")).toContainText("In review");
    await expect(page.getByRole("status").filter({ hasText: "Waitlist choice queued" })).toBeVisible();
    await expect(page.getByText("Queued: Waitlisted — not released")).toBeVisible();
    await page.getByRole("button", { name: "Change Decision" }).click();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await page.getByRole("button", { name: "Confirm acceptance", exact: true }).click();
    await expect(page.locator(".application-review-identity")).toContainText("In review");
    await expect(page.getByText("Queued: Accepted — not released")).toBeVisible();
  });

  test("finalized application hides decision controls", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.accepted}`);
    await expect(page.getByText(/final decision/i)).toBeVisible();
    await expect(page.getByRole("region", { name: "Application decision" })).toHaveCount(0);
  });

  test("supports keyboard confirmation and announces the saved decision", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await page.getByRole("button", { name: "Change Decision" }).click();
    const accept = page.getByRole("button", { name: "Accept", exact: true });
    await accept.focus();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("button", { name: "Confirm acceptance", exact: true });
    await expect(confirm).toBeFocused();
    await expect(page.getByRole("region", { name: "Application decision" })).toContainText("Casey Decision (casey.decision@example.com)");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(accept).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const completion = page.getByRole("status").filter({ hasText: "Acceptance queued." });
    await expect(completion).toBeVisible();
    await expect(completion).toBeFocused();
  });

  test("makes an expired claim available without reloading the review page", async ({ page }) => {
    await page.clock.install();
    await signInOrganizer(page, E2E_ADMIN);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await expect(page.getByRole("button", { name: "Start review", exact: true })).toHaveCount(0);
    await expect(page.locator(".application-review-identity")).toContainText("In review");
    await page.clock.fastForward(31 * 60_000);
    await expect(page.locator(".application-review-identity")).toContainText("Available to reclaim");
    await page.getByRole("button", { name: "Start review", exact: true }).click();
    await expect(page.getByText("You are the current reviewer.", { exact: false })).toBeVisible();
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

  test("skips applications actively held by other reviewers", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.unreviewed}`);
    await expect(page.getByRole("navigation", { name: "Review navigation" })).toContainText("No more available applications in this queue.");
    await expect(page.getByRole("link", { name: "Review next application", exact: true })).toHaveCount(0);
  });
});
