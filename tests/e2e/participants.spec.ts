import { expect, test } from "@playwright/test";
import { E2E_ADMIN, signInOrganizer } from "./fixtures/auth";

test("admins can adjust points, promote a participant, and revoke linked volunteer access", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("tab", { name: "Participants", exact: true }).click();
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
  await dialog.getByLabel("Can check participants in").check();
  await dialog.getByRole("button", { name: "Confirm promotion" }).click();
  await expect(dialog.getByRole("status")).toContainText("Volunteer staff account created");
  await expect(dialog.getByRole("region", { name: "Linked volunteer account" })).toContainText("alex.staff@example.com");
  await expect(dialog.getByText("Capabilities: Check-in")).toBeVisible();

  await dialog.getByRole("button", { name: "Revoke volunteer access" }).click();
  await dialog.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(dialog.getByRole("status")).toContainText("Volunteer access revoked");
  await expect(dialog.getByText("Inactive", { exact: true })).toBeVisible();
});

test("participant roster and details fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("tab", { name: "Participants", exact: true }).click();
  await expect(page.getByRole("button", { name: "Alex Accepted", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Alex Accepted", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Participant details" });
  await expect(dialog.getByText("Current points")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
