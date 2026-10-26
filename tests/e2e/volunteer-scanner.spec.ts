import { expect, test, type Page } from "@playwright/test";
import { E2E_EVENTS, E2E_QR_TOKENS, E2E_SCAN_VOLUNTEER } from "../../shared/admin/e2e/credentials";
import { qrCodeSvg, showQrToCamera } from "./fixtures/qrCamera";

/**
 * Full Chromium (the default headless shell has no media capture) with its
 * synthetic camera; access still follows each context's granted permissions.
 */
test.use({ channel: "chromium", launchOptions: { args: ["--use-fake-device-for-media-stream"] } });

async function signInScanVolunteer(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(E2E_SCAN_VOLUNTEER.email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_SCAN_VOLUNTEER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Volunteer dashboard" })).toBeVisible();
}

/** In-app navigation keeps the in-memory mock store; `page.goto` would reset it. */
async function openTab(page: Page, name: "Check-in" | "Food" | "Points") {
  await page.getByRole("navigation", { name: "Volunteer" }).getByRole("link", { name, exact: true }).click();
}

async function lookUp(page: Page, token: string) {
  await page.getByLabel("Or enter the participant's code").fill(token);
  await page.getByRole("button", { name: "Look up participant" }).click();
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.describe("volunteer QR scanner", () => {
  test("checks a participant in after confirmation and explains repeat scans", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await expect(page.getByRole("heading", { name: "Participant check-in", exact: true })).toBeVisible();

    await lookUp(page, "not-a-code");
    await expect(page.getByRole("alert")).toContainText("isn't a valid participant code");

    await lookUp(page, E2E_QR_TOKENS.ready);
    const confirmation = page.getByRole("region", { name: "Riley Ready" });
    await expect(confirmation).toContainText("Not checked in yet");
    await expect(confirmation).not.toContainText("Dietary");
    await expect(page.getByRole("heading", { name: "Riley Ready" })).toBeFocused();
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: "test-results/scanner-check-in-confirm-mobile.png", fullPage: true });

    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checked in" })).toContainText("Riley Ready is checked in.");
    await expect(page.getByRole("button", { name: "Scan next" })).toBeFocused();
    await page.screenshot({ path: "test-results/scanner-check-in-success-mobile.png", fullPage: true });

    await page.getByRole("button", { name: "Scan next" }).click();
    await lookUp(page, E2E_QR_TOKENS.ready);
    await expect(page.getByRole("status").filter({ hasText: "Already checked in" })).toContainText("Nothing was changed.");
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toHaveCount(0);

    for (const [token, message] of [
      [E2E_QR_TOKENS.unknown, "Participant not found"],
      [E2E_QR_TOKENS.ineligible, "Participant not eligible"],
    ] as const) {
      await page.getByRole("button", { name: "Scan next" }).click();
      await lookUp(page, token);
      await expect(page.getByRole("alert")).toContainText(message);
    }
    await expectNoHorizontalScroll(page);
  });

  test("shows dietary information only while confirming food", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Food");
    await lookUp(page, E2E_QR_TOKENS.ready);
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);

    await lookUp(page, E2E_QR_TOKENS.ready);
    await expect(page.getByText("Not redeemed yet")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: "test-results/scanner-food-confirm-mobile.png", fullPage: true });

    await page.getByRole("button", { name: "Confirm food given" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Food redeemed" })).toBeVisible();
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);

    await page.getByRole("button", { name: "Scan next" }).click();
    await lookUp(page, E2E_QR_TOKENS.checkedIn);
    await expect(page.getByRole("status").filter({ hasText: "Food already redeemed" })).toContainText("Morgan Present");

    await openTab(page, "Check-in");
    await lookUp(page, E2E_QR_TOKENS.ready);
    await expect(page.getByRole("heading", { name: "Riley Ready" })).toBeVisible();
    await expect(page.getByText(/Vegetarian|Dietary/)).toHaveCount(0);
  });

  test("awards the selected event's fixed points and clears state on event change", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Points");
    await expect(page.getByText("Choose an event to start scanning.")).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await page.getByRole("radio", { name: new RegExp(E2E_EVENTS.workshop.name) }).click();
    await expect(page).toHaveURL(new RegExp(`event=${E2E_EVENTS.workshop.eventId}`));
    await expect(page.getByText(`${E2E_EVENTS.workshop.pointsAwarded} points`).first()).toBeVisible();

    await lookUp(page, E2E_QR_TOKENS.ready);
    await page.getByRole("button", { name: `Award ${E2E_EVENTS.workshop.pointsAwarded} points` }).click();
    await expect(page.getByRole("alert")).toContainText("Not checked in yet");

    await page.getByRole("button", { name: "Scan next" }).click();
    await lookUp(page, E2E_QR_TOKENS.checkedIn);
    await expect(page.getByRole("region", { name: "Morgan Present" })).toContainText(E2E_EVENTS.workshop.name);
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: "test-results/scanner-points-confirm-mobile.png", fullPage: true });

    await page.getByRole("button", { name: "Change event" }).click();
    await expect(page.getByRole("region", { name: "Morgan Present" })).toHaveCount(0);
    await page.getByRole("radio", { name: new RegExp(E2E_EVENTS.panel.name) }).click();
    await lookUp(page, E2E_QR_TOKENS.checkedIn);
    await expect(page.getByRole("status").filter({ hasText: "Points already awarded" })).toContainText(E2E_EVENTS.panel.name);

    await page.getByRole("button", { name: "Change event" }).click();
    await page.getByRole("radio", { name: new RegExp(E2E_EVENTS.workshop.name) }).click();
    await lookUp(page, E2E_QR_TOKENS.checkedIn);
    await page.getByRole("button", { name: `Award ${E2E_EVENTS.workshop.pointsAwarded} points` }).click();
    await expect(page.getByRole("status").filter({ hasText: "25 points awarded" })).toContainText("Morgan Present received 25 points");
  });

  test("keeps the confirmation and offers a retry while offline", async ({ page, context }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await lookUp(page, E2E_QR_TOKENS.ready);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByRole("alert")).toContainText("Connection problem");
    await context.setOffline(false);
    await page.getByRole("button", { name: /Try again/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checked in" })).toBeVisible();
  });
});

test.describe("volunteer camera scanner", () => {
  test.use({ permissions: ["camera"] });

  test("starts the camera only on request and releases it when stopped or left", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    const video = page.getByLabel("Camera preview");
    await expect(video).toBeHidden();
    expect(await video.evaluate((element: HTMLVideoElement) => element.srcObject)).toBeNull();

    await page.getByRole("button", { name: "Scan with camera" }).click();
    await expect(page.getByRole("status")).toHaveText("Point the camera at the participant's QR code.", { timeout: 15_000 });
    await expect(video).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: "test-results/scanner-camera-mobile.png", fullPage: true });

    const tracks = await video.evaluate((element: HTMLVideoElement) => {
      const stream = element.srcObject as MediaStream;
      (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks = stream.getTracks();
      return stream.getTracks().length;
    });
    expect(tracks).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Stop camera and enter code" }).click();
    await expect(video).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks.every((track) => track.readyState === "ended"))).toBe(true);

    await page.getByRole("button", { name: "Scan with camera" }).click();
    await expect(page.getByRole("status")).toHaveText("Point the camera at the participant's QR code.", { timeout: 15_000 });
    await video.evaluate((element: HTMLVideoElement) => {
      (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks = (element.srcObject as MediaStream).getTracks();
    });
    await openTab(page, "Food");
    await expect(page.getByRole("heading", { name: "Food", exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks.every((track) => track.readyState === "ended"))).toBe(true);
  });
});

test.describe("volunteer camera decoding", () => {
  test.use({ permissions: ["camera"] });

  test("reads a participant QR code, stops the camera, and waits for confirmation", async ({ page }) => {
    await showQrToCamera(page, await qrCodeSvg(E2E_QR_TOKENS.ready));
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await page.getByRole("button", { name: "Scan with camera" }).click();

    await expect(page.getByRole("heading", { name: "Riley Ready" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toBeEnabled();
    await expect(page.getByText("Checked in", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks.every((track) => track.readyState === "ended"))).toBe(true);

    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checked in" })).toBeVisible();

    await page.getByRole("button", { name: "Scan next" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Already checked in" })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("volunteer camera without permission", () => {
  test("explains blocked camera access and keeps manual entry available", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await page.getByRole("button", { name: "Scan with camera" }).click();
    await expect(page.getByRole("alert")).toContainText("Camera access is blocked");
    await expect(page.getByRole("button", { name: "Try camera again" })).toBeVisible();
    await lookUp(page, E2E_QR_TOKENS.ready);
    await expect(page.getByRole("heading", { name: "Riley Ready" })).toBeVisible();
  });
});
