import { test, expect } from "@playwright/test";
import {
  E2E_ADMIN,
  E2E_APPLICATION_IDS,
  applicationsListStatus,
  signInOrganizer,
  signInOrganizerOnLoginPage,
  signOutOrganizer,
} from "./fixtures/auth";
import { expectAdminListboxValue, selectAdminListbox } from "./fixtures/listbox";
import { resetE2eMockBackend } from "./fixtures/resetMock";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

test.describe("applications queue", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eMockBackend(page);
    await signInOrganizer(page, E2E_ADMIN);
  });

  test("lists seeded applications with filters and search", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Jordan Review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("4 of 4 applications");

    await page.getByLabel("Search applications").fill("taylor");
    await expect(page.getByRole("status")).toContainText("1 matching applications (4 total)");
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Jordan Review" })).toHaveCount(0);

    await page.getByLabel("Search applications").fill("");
    await selectAdminListbox(page, "Review status", "accepted");
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toHaveCount(0);

    await selectAdminListbox(page, "Review status", "all");
    await selectAdminListbox(page, "Submission time", "newest");
    await expect(page.getByRole("status")).toContainText("4 of 4 applications");
  });

  test("keeps rapid search and status changes in sync", async ({ page }) => {
    test.setTimeout(60_000);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.getByLabel("Search applications").fill("taylor");
      await page.getByLabel("Search applications").fill("");
      await expect(page.getByLabel("Search applications")).toHaveValue("");
      await selectAdminListbox(page, "Review status", "accepted");
      await expect(page.getByRole("status")).toContainText("1 matching applications (4 total)");
      await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
      await selectAdminListbox(page, "Review status", "needs_review");
    }
  });

  test("navigates to application review detail", async ({ page }) => {
    await page.getByRole("link", { name: "Review application for Taylor Unreviewed" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/applications/${E2E_APPLICATION_IDS.unreviewed}$`),
    );
    await expect(page.getByRole("link", { name: "Back to Applications" })).toBeVisible();
  });

  test("preserves queue controls across refresh and return from review", async ({ page }) => {
    await selectAdminListbox(page, "Review status", "all");
    await selectAdminListbox(page, "Submission time", "newest");
    await page.getByLabel("Search applications").fill("alex.accepted@example.com");
    const queueUrl = page.url();
    await page.reload();
    await expect(page.getByLabel("Search applications")).toHaveValue("alex.accepted@example.com");
    await page.getByRole("link", { name: "Review application for Alex Accepted" }).click();
    await page.getByRole("link", { name: "Back to Applications" }).click();
    await expect(page).toHaveURL(queueUrl);
    await expectAdminListboxValue(page, "Review status", "all");
    await expectAdminListboxValue(page, "Submission time", "newest");
    await expect(page.getByLabel("Search applications")).toHaveValue("alex.accepted@example.com");
    await expect(page.getByRole("status")).toContainText("1 matching applications (4 total)");
  });

  test("expands an empty search to include completed decisions", async ({ page }) => {
    await selectAdminListbox(page, "Review status", "needs_review");
    await page.getByLabel("Search applications").fill("alex.accepted@example.com");
    await expect(page.getByRole("heading", { name: "No matching applications" })).toBeVisible();
    await page.getByRole("button", { name: "Search all applications" }).click();
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
    await expect(page.getByLabel("Search applications")).toHaveValue("alex.accepted@example.com");
  });

  test("keeps waitlisted decisions outside the default queue after release", async ({ page }) => {
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await page.getByRole("button", { name: "Change Decision" }).click();
    await page.getByRole("button", { name: "Waitlist" }).click();
    await page.getByRole("button", { name: "Confirm waitlist" }).click();
    await expect(page.locator(".application-review-identity")).toContainText("In review");
    await expect(page.getByText("Queued: Waitlisted — not released")).toBeVisible();
    await page.getByRole("link", { name: "Back to Applications" }).click();
    await expect(page).toHaveURL(/\/admin\/applications$/);
    await expect(applicationsListStatus(page)).toContainText("4 of 4 applications");
    await selectAdminListbox(page, "Review status", "waitlisted");
    await expect(applicationsListStatus(page)).toContainText("Showing 0 of 4 applications");

    await signOutOrganizer(page);
    await signInOrganizerOnLoginPage(page, E2E_ADMIN);
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Decision emails" }).click();
    await expect(page.getByRole("button", { name: "Send all queued" })).toBeEnabled();
    await page.getByRole("button", { name: "Send all queued" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sent 1 of 1" })).toBeVisible();

    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Applications", exact: true }).click();
    await selectAdminListbox(page, "Review status", "waitlisted");
    await expect(applicationsListStatus(page)).toContainText("1 matching applications (4 total)");
    await expect(page.getByRole("link", { name: /Review application for Casey Decision/ })).toHaveCount(1);
    await selectAdminListbox(page, "Review status", "needs_review");
    await expect(page.getByRole("link", { name: /Review application for Casey Decision/ })).toHaveCount(0);
  });

  test("supports desktop and mobile review without horizontal overflow", async ({ page }, testInfo) => {
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("table")).toHaveCount(width >= 1024 ? 1 : 0);
      await expect(page.getByRole("article")).toHaveCount(width >= 1024 ? 0 : 4);
      await expect(
        page.getByRole("button", { name: "Sign out" }).or(page.getByRole("button", { name: /Account menu for/i })),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 1440 || width === 375) {
        await reviewScreenshot(page, `applications-${width}.png`, testInfo);
      }
    }
    await page.getByRole("link", { name: "Review application for Taylor Unreviewed" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/applications/${E2E_APPLICATION_IDS.unreviewed}$`));
  });

  test("provides keyboard navigation and visible focus", async ({ page }) => {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Search applications")).toBeFocused();
    const focusOutline = await page.getByLabel("Search applications").evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(focusOutline).toBe("solid");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Review status")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Submission time")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Review assignment")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Review application for / }).first()).toBeFocused();
  });

  test("shows fresh submissions as awaiting review and expired claims as reclaimable", async ({ page }) => {
    await page.clock.install();
    await page.reload();
    await selectAdminListbox(page, "Review status", "needs_review");
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("1 matching applications (4 total)");
    await selectAdminListbox(page, "Review status", "under_review");
    await expect(page.getByRole("status")).toContainText("2 matching applications (4 total)");
    await page.clock.fastForward(31 * 60_000);
    await expect(page.getByRole("status")).toContainText("Showing 0 of 4 applications");
    await selectAdminListbox(page, "Review status", "needs_review");
    await expect(page.getByRole("status")).toContainText("3 matching applications (4 total)");
    await expect(page.getByRole("table")).toContainText("Available to reclaim");
  });

  test("filters assignments and continues reviewing with the original queue controls", async ({ page }) => {
    await selectAdminListbox(page, "Review assignment", "mine");
    await expect(page.getByRole("status")).toContainText("1 matching applications (4 total)");
    await selectAdminListbox(page, "Review assignment", "available");
    await expect(page.getByRole("status")).toContainText("2 matching applications (4 total)");
    await selectAdminListbox(page, "Submission time", "newest");
    const queueUrl = page.url();
    await page.getByRole("link", { name: "Review application for Casey Decision" }).click();
    await page.getByRole("button", { name: "Change Decision" }).click();
    await page.getByRole("button", { name: "Accept", exact: true }).click();
    await page.getByRole("button", { name: "Confirm acceptance", exact: true }).click();
    await expect(page.locator(".application-review-identity")).toContainText("In review");
    await expect(page.getByText("Queued: Accepted — not released")).toBeVisible();
    await page.getByRole("link", { name: "Review next application", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Taylor Unreviewed", exact: true })).toBeFocused();
    await page.getByRole("link", { name: "Back to Applications" }).click();
    await expect(page).toHaveURL(queueUrl);
    await expectAdminListboxValue(page, "Review assignment", "available");
    await expectAdminListboxValue(page, "Submission time", "newest");
    await expect(page.getByRole("status")).toContainText("2 matching applications (4 total)");
  });
});
