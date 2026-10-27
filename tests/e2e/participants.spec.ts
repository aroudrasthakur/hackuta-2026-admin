import { expect, test } from "@playwright/test";
import { E2E_BADGES } from "../../shared/admin/e2e/credentials";
import { E2E_ADMIN, signInOrganizer } from "./fixtures/auth";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

test("admins can adjust points, promote a participant, and revoke linked volunteer access", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("link", { name: "Participants", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Participants", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Alex Accepted", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Participant details" });
  await expect(dialog.getByText("Current points")).toBeVisible();
  await expect(dialog.getByText("20", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Edit Points" }).click();
  await dialog.getByLabel("New target balance").fill("35");
  await dialog.getByLabel("Adjustment reason").fill("Corrected event attendance");
  await dialog.getByRole("button", { name: "Confirm points adjustment" }).click();
  await expect(dialog.getByRole("status")).toContainText("Points updated from 20 to 35");
  await expect(dialog.getByText("35", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Promote to Volunteer" }).click();
  await dialog.getByLabel("Staff account email").fill("alex.staff@example.com");
  await dialog.getByLabel("Initial password").fill("ParticipantStaff1");
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Confirm promotion" }).click();
  await expect(dialog.getByRole("status")).toContainText("Volunteer staff account created");
  await expect(dialog.getByRole("region", { name: "Linked volunteer account" })).toContainText("alex.staff@example.com");
  await expect(dialog.getByText("Access: None yet")).toBeVisible();

  await dialog.getByRole("button", { name: "Revoke volunteer access" }).click();
  await dialog.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(dialog.getByRole("status")).toContainText("Volunteer access revoked");
  await expect(dialog.getByText("Inactive", { exact: true })).toBeVisible();
});

test("a promoted volunteer starts with no access until an admin switches it on", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("link", { name: "Participants", exact: true }).click();
  await page.getByRole("button", { name: "Alex Accepted", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Participant details" });
  await dialog.getByRole("button", { name: "Promote to Volunteer" }).click();
  await dialog.getByLabel("Staff account email").fill("alex.staff@example.com");
  await dialog.getByLabel("Initial password").fill("ParticipantStaff1");
  await dialog.getByRole("button", { name: "Confirm promotion" }).click();
  await dialog.getByRole("link", { name: "Manage access" }).click();

  await expect(page.getByRole("heading", { name: "Alex Accepted", level: 1 })).toBeVisible();
  await expect(page.getByText("No access yet")).toBeVisible();
  for (const name of ["Participant check-in", "Food distribution", "Shop redemption"]) {
    await expect(page.getByRole("switch", { name, exact: true })).toHaveAttribute("aria-checked", "false");
  }
  await reviewScreenshot(page, "volunteer-access-new.png", test.info());

  await page.getByRole("switch", { name: "Participant check-in", exact: true }).click();
  await page.getByRole("switch", { name: "Shop redemption", exact: true }).click();
  await expect(page.getByText("Allowed after saving")).toHaveCount(2);
  await page.getByRole("button", { name: "Save access" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Volunteer access saved" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Participant check-in", exact: true })).toHaveAttribute("aria-checked", "true");

  const firstEvent = page.getByRole("list", { name: "Events" }).getByRole("switch").first();
  await firstEvent.click();
  await page.getByRole("button", { name: "Save event assignments" }).click();
  await expect(page.getByText("Points: 1 event")).toBeVisible();
  await expect(page.getByText("Allowed for 1 event")).toBeVisible();
  await reviewScreenshot(page, "volunteer-access-granted-desktop.png", test.info());
  await page.setViewportSize({ width: 390, height: 844 });
  await reviewScreenshot(page, "volunteer-access-granted-mobile.png", test.info());
});

test("admins replace a lost badge with a reason and the old badge stops working", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("link", { name: "Participants", exact: true }).click();
  await page.getByRole("button", { name: "Alex Accepted", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Participant details" });
  const badge = dialog.getByRole("region", { name: "Badge" });
  await expect(badge).toContainText("Assigned");

  const replaceWith = async (value: string) => {
    await badge.getByRole("button", { name: "Replace badge" }).click();
    await badge.getByLabel("Or enter the badge code").fill(value);
    await badge.getByRole("button", { name: "Look up badge" }).click();
    await badge.getByLabel("Reason").fill("Badge lost");
    await badge.getByRole("button", { name: "Confirm badge replacement" }).click();
  };

  await replaceWith(E2E_BADGES.ready);
  await expect(badge.getByRole("alert")).toBeVisible();
  await expect(badge.getByLabel("Or enter the badge code")).toBeVisible();
  await badge.getByRole("button", { name: "Cancel" }).click();

  await replaceWith(E2E_BADGES.unusedSecond);
  await expect(dialog.getByRole("status")).toContainText("Badge replaced");
  await expect(dialog).not.toContainText(E2E_BADGES.unusedSecond);

  await replaceWith(E2E_BADGES.alex);
  await expect(badge.getByRole("alert")).toBeVisible();
});

test("participant roster and details fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("link", { name: "Participants", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alex Accepted", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Alex Accepted", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Participant details" });
  await expect(dialog.getByText("Current points")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
