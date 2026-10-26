import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  E2E_ADMIN,
  E2E_APPLICATION_IDS,
  E2E_REVIEWER,
  E2E_VOLUNTEER,
} from "../../../shared/admin/e2e/credentials";

export { E2E_ADMIN, E2E_APPLICATION_IDS, E2E_REVIEWER };

export async function signInVolunteer(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_VOLUNTEER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/scan$/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
}

async function submitOrganizerSignIn(
  page: Page,
  account: { email: string; password: string },
) {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/applications$/);
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
}

/** Full navigation — resets the in-memory E2E mock store. */
export async function signInOrganizer(
  page: Page,
  account: { email: string; password: string },
) {
  await page.goto("/admin/login");
  await submitOrganizerSignIn(page, account);
}

/** Use after sign-out (same document) so queued mock state survives. */
export async function signInOrganizerOnLoginPage(
  page: Page,
  account: { email: string; password: string },
) {
  await expect(page).toHaveURL(/\/admin\/login$/);
  await submitOrganizerSignIn(page, account);
}

export function applicationsListStatus(page: Page) {
  return page.getByRole("status").filter({ hasText: /applications/i });
}

export async function signOutOrganizer(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
}
