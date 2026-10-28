import { expect, test } from "@playwright/test";
import { E2E_ADMIN, signInOrganizer, signInVolunteer } from "./fixtures/auth";

test.describe("admin notifications management", () => {
  test("composes, previews, drafts, publishes with confirmation, filters, edits, and cancels notifications", async ({
    page,
  }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await page
      .getByRole("navigation", { name: "Admin", exact: true })
      .getByRole("link", { name: "Send notifications", exact: true })
      .click();

    await expect(
      page.getByRole("main").getByRole("heading", { level: 1, name: "Send notifications" }),
    ).toBeVisible();

    const table = page.getByRole("table", { name: "Participant notifications" });
    await expect(table.getByRole("rowheader", { name: /Lunch is Ready/ })).toBeVisible();
    await expect(table.getByRole("rowheader", { name: /AI Workshop/ })).toBeVisible();
    await expect(table.getByRole("rowheader", { name: /Midnight tee sale/ })).toBeVisible();

    // Live participant preview updates while typing
    await page.getByLabel("Title").fill("Hardware Lab Open");
    await page.getByLabel("Notification type").selectOption("reminder");
    await page.getByLabel("Message").fill("Pick up hardware kits at Table 4.");
    await page.getByLabel("Link URL (optional)").fill("/dashboard/schedule");
    await page.getByLabel("Link label (optional)").fill("View lab hours");

    const preview = page.getByLabel("Live participant preview");
    await expect(preview).toContainText("Hardware Lab Open");
    await expect(preview).toContainText("Reminder");
    await expect(preview).toContainText("Pick up hardware kits at Table 4.");
    await expect(preview).toContainText("View lab hours (/dashboard/schedule)");

    // Save as draft
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page.locator(".admin-callout--success")).toContainText(
      "Draft “Hardware Lab Open” saved.",
    );
    await expect(table.getByRole("rowheader", { name: /Hardware Lab Open/ })).toBeVisible();

    // Send Now with confirmation dialog
    await page.getByLabel("Title").fill("Judging Starts Now");
    await page.getByLabel("Notification type").selectOption("important");
    await page.getByLabel("Message").fill("Report to your assigned table immediately.");
    await page.getByRole("button", { name: "Send Now" }).click();

    const confirmDialog = page.getByRole("dialog", { name: "Send notification now?" });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText("Judging Starts Now");
    await confirmDialog.getByRole("button", { name: "Confirm & Send Now" }).click();

    await expect(page.locator(".admin-callout--success")).toContainText(
      "“Judging Starts Now” was published to participants.",
    );
    await expect(table.getByRole("rowheader", { name: /Judging Starts Now/ })).toBeVisible();

    // Edit & cancel scheduled notification
    await page.getByRole("button", { name: "Edit AI Workshop" }).click();
    await expect(
      page.getByRole("heading", { name: "Edit scheduled notification" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stop editing" }).click();

    await page.getByRole("button", { name: "Cancel AI Workshop" }).click();
    const cancelDialog = page.getByRole("dialog", { name: "Cancel “AI Workshop”?" });
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "Confirm cancel" }).click();
    await expect(page.locator(".admin-callout--success")).toContainText(
      "“AI Workshop” was cancelled and will not be sent.",
    );

    // Filter by type and status
    await page.getByLabel("Filter by type").selectOption("important");
    await expect(table.getByRole("rowheader", { name: /Judging Starts Now/ })).toBeVisible();
    await expect(table.getByRole("rowheader", { name: /Lunch is Ready/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear filters" }).click();

    // View published notification details and copy to draft
    await page.getByRole("button", { name: "View Lunch is Ready" }).click();
    const detailDialog = page.getByRole("dialog", { name: "Lunch is Ready" });
    await expect(detailDialog).toContainText(
      "Published notifications are locked so participant history stays accurate.",
    );
    await detailDialog.getByRole("button", { name: "Copy to new draft" }).click();
    await expect(page.getByLabel("Title")).toHaveValue("Lunch is Ready");
  });

  test("restricts Send notifications tab to administrators", async ({ page }) => {
    await signInVolunteer(page);
    await expect(
      page
        .getByRole("navigation", { name: "Admin", exact: true })
        .getByRole("link", { name: "Send notifications" }),
    ).toHaveCount(0);
    await page.goto("/admin/notifications");
    await expect(page).toHaveURL(/\/admin\/scan$/);
  });
});
