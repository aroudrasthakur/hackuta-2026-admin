import { test, expect } from "@playwright/test";
import { E2E_APPLICATION_IDS, E2E_REVIEWER, signInOrganizer } from "./fixtures/auth";
import { resetE2eMockBackend } from "./fixtures/resetMock";

test.describe("applications queue", () => {
  test.beforeEach(async ({ page }) => {
    await resetE2eMockBackend(page);
    await signInOrganizer(page, E2E_REVIEWER);
  });

  test("lists seeded applications with filters and search", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Jordan Review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("3 of 4 applications");

    await page.getByLabel("Search applications").fill("taylor");
    await expect(page.getByRole("status")).toContainText("1 of 4 applications");
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Jordan Review" })).toHaveCount(0);

    await page.getByLabel("Search applications").fill("");
    await page.getByLabel("Review status").selectOption("accepted");
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toHaveCount(0);

    await page.getByLabel("Review status").selectOption("all");
    await page.getByLabel("Submission time").selectOption("newest");
    await expect(page.getByRole("status")).toContainText("4 of 4 applications");

    await page.getByRole("button", { name: "Reset controls" }).click();
    await expect(page.getByLabel("Review status")).toHaveValue("needs_review");
    await expect(page.getByLabel("Submission time")).toHaveValue("oldest");
    await expect(page.getByRole("status")).toContainText("3 of 4 applications");
  });

  test("keeps rapid search and status changes in sync", async ({ page }) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await page.getByLabel("Search applications").fill("taylor");
      await page.getByLabel("Search applications").fill("");
      await page.getByLabel("Review status").selectOption("accepted");
      await expect(page.getByLabel("Search applications")).toHaveValue("");
      await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
      await page.getByLabel("Review status").selectOption("needs_review");
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
    await page.getByLabel("Review status").selectOption("all");
    await page.getByLabel("Submission time").selectOption("newest");
    await page.getByLabel("Search applications").fill("alex.accepted@example.com");
    const queueUrl = page.url();
    await page.reload();
    await expect(page.getByLabel("Search applications")).toHaveValue("alex.accepted@example.com");
    await page.getByRole("link", { name: "Review application for Alex Accepted" }).click();
    await page.getByRole("link", { name: "Back to Applications" }).click();
    await expect(page).toHaveURL(queueUrl);
    await expect(page.getByLabel("Review status")).toHaveValue("all");
    await expect(page.getByLabel("Submission time")).toHaveValue("newest");
    await expect(page.getByLabel("Search applications")).toHaveValue("alex.accepted@example.com");
    await expect(page.getByRole("status")).toContainText("1 of 4 applications");
  });

  test("expands an empty search to include completed decisions", async ({ page }) => {
    await page.getByLabel("Search applications").fill("alex.accepted@example.com");
    await expect(page.getByRole("heading", { name: "No matching applications" })).toBeVisible();
    await page.getByRole("button", { name: "Search all applications" }).click();
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
    await expect(page.getByLabel("Search applications")).toHaveValue("alex.accepted@example.com");
  });

  test("keeps waitlisted decisions outside the default queue", async ({ page }) => {
    await page.goto(`/admin/applications/${E2E_APPLICATION_IDS.readyForDecision}`);
    await page.getByRole("button", { name: "Waitlist" }).click();
    await page.getByRole("button", { name: "Confirm waitlist" }).click();
    await expect(page.getByText("Review status: Waitlisted")).toBeVisible();
    await page.getByRole("link", { name: "Back to Applications" }).click();
    await expect(page.getByRole("status")).toContainText("2 of 4 applications");
    await page.getByLabel("Review status").selectOption("waitlisted");
    await expect(page.getByRole("status")).toContainText("1 of 4 applications");
    await expect(page.getByRole("link", { name: /Review application for/ })).toHaveCount(1);
  });

  test("supports desktop and mobile review without horizontal overflow", async ({ page }, testInfo) => {
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("table")).toHaveCount(width >= 1024 ? 1 : 0);
      await expect(page.getByRole("article")).toHaveCount(width >= 1024 ? 0 : 3);
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width === 1440 || width === 375) {
        await page.screenshot({ path: testInfo.outputPath(`applications-${width}.png`), fullPage: true });
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
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeFocused();
  });
});
