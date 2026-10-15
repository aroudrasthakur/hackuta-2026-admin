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
    await expect(page.getByRole("status")).toContainText("4 of 4 applications");

    await page.getByLabel("Search applications").fill("taylor");
    await expect(page.getByRole("status")).toContainText("1 of 4 applications");
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Jordan Review" })).toHaveCount(0);

    await page.getByLabel("Search applications").fill("");
    await page.getByLabel("Review status").selectOption("accepted");
    await expect(page.getByRole("link", { name: "Review application for Alex Accepted" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review application for Taylor Unreviewed" })).toHaveCount(0);

    await page.getByLabel("Review status").selectOption("all");
    await page.getByLabel("Submission time").selectOption("oldest");
    await expect(page.getByRole("status")).toContainText("4 of 4 applications");

    await page.getByRole("button", { name: "Reset controls" }).click();
    await expect(page.getByLabel("Review status")).toHaveValue("all");
    await expect(page.getByLabel("Submission time")).toHaveValue("newest");
  });

  test("navigates to application review detail", async ({ page }) => {
    await page.getByRole("link", { name: "Review application for Taylor Unreviewed" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/applications/${E2E_APPLICATION_IDS.unreviewed}$`),
    );
    await expect(page.getByRole("link", { name: "Back to Applications" })).toBeVisible();
  });
});
