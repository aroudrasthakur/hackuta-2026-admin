import { expect, test, type Page } from "@playwright/test";
import { E2E_BADGES, E2E_EVENTS, E2E_QR_TOKENS, E2E_SCAN_VOLUNTEER } from "../../shared/admin/e2e/credentials";
import { installQrCamera, qrCodeSvg, scanQr, showQrToCamera } from "./fixtures/qrCamera";
import { setMealScenario } from "./fixtures/meals";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

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
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
  await setMealScenario(page, "serving");
}

/** In-app navigation keeps the in-memory mock store; `page.goto` would reset it. */
async function openTab(page: Page, name: "Check-in" | "Food" | "Points") {
  await page.getByRole("navigation", { name: "Volunteer" }).getByRole("link", { name, exact: true }).click();
}

const enterRegistration = scanQr;
const enterBadge = scanQr;

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

const currentStep = (page: Page) => page.getByRole("list", { name: "Scan progress" }).locator('[aria-current="step"]');

test.describe("volunteer badge check-in", () => {
  test.use({ permissions: ["camera"] });
  test.beforeEach(({ page }) => installQrCamera(page));

  test("verifies the registration, assigns a badge on confirm, and retires the registration QR", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await expect(page.getByRole("heading", { name: "Participant check-in", exact: true })).toBeVisible();
    await expect(currentStep(page)).toHaveText("1. Registration QR");
    await expect(page.locator('[data-scan-mode="registration"]')).toContainText("Scan the registration QR");

    await enterRegistration(page, E2E_BADGES.unused);
    await expect(page.getByRole("alert")).toContainText("Not a registration QR");

    await enterRegistration(page, E2E_QR_TOKENS.arrival);
    await expect(page.getByRole("heading", { name: "Avery Arrival" })).toBeFocused();
    await expect(page.getByText("Registration verified · not checked in yet")).toBeVisible();
    await expect(currentStep(page)).toHaveText("2. Badge QR");
    await expect(page.locator('[data-scan-mode="badge"]')).toContainText("Scan the badge QR");
    await expectNoHorizontalScroll(page);
    await reviewScreenshot(page, "test-results/scanner-check-in-badge-step-mobile.png");

    await enterBadge(page, E2E_QR_TOKENS.arrival);
    await expect(page.getByRole("alert")).toContainText("That's the registration QR again");
    await enterBadge(page, E2E_BADGES.ready);
    await expect(page.getByRole("alert")).toContainText("Badge already assigned");
    await enterBadge(page, E2E_BADGES.retired);
    await expect(page.getByRole("alert")).toContainText("Badge deactivated");

    await enterBadge(page, E2E_BADGES.unused);
    await expect(currentStep(page)).toHaveText("3. Confirm");
    await expect(page.getByText("Scanned and unused, ready to assign")).toBeVisible();
    await expect(page.getByText(E2E_BADGES.unused)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await reviewScreenshot(page, "test-results/scanner-check-in-confirm-mobile.png");

    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checked in" })).toContainText("Avery Arrival is checked in with their badge");
    await expect(page.getByRole("button", { name: "Scan next" })).toBeFocused();
    await reviewScreenshot(page, "test-results/scanner-check-in-success-mobile.png");

    await page.getByRole("button", { name: "Scan next" }).click();
    await enterRegistration(page, E2E_QR_TOKENS.arrival);
    await expect(page.getByRole("alert")).toContainText("Registration QR already used");
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toHaveCount(0);

    for (const [token, message] of [
      [E2E_QR_TOKENS.unknown, "Participant not found"],
      [E2E_QR_TOKENS.ineligible, "Participant not eligible"],
      [E2E_QR_TOKENS.legacy, "Already checked in"],
    ] as const) {
      await page.getByRole("button", { name: "Scan next" }).click();
      await enterRegistration(page, token);
      await expect(page.getByRole("region", { name: "Scan result" })).toContainText(message);
    }
    await expectNoHorizontalScroll(page);
  });

  test("goes back a step or starts over without saving anything", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await enterRegistration(page, E2E_QR_TOKENS.arrival);
    await enterBadge(page, E2E_BADGES.unused);
    await page.getByRole("button", { name: "Back: scan a different badge" }).click();
    await expect(currentStep(page)).toHaveText("2. Badge QR");
    await page.getByRole("button", { name: "Back: scan a different registration" }).click();
    await expect(currentStep(page)).toHaveText("1. Registration QR");
    await expect(page.getByText("Avery Arrival")).toHaveCount(0);

    await enterRegistration(page, E2E_QR_TOKENS.arrival);
    await enterBadge(page, E2E_BADGES.unused);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(currentStep(page)).toHaveText("1. Registration QR");

    await enterRegistration(page, E2E_QR_TOKENS.arrival);
    await expect(page.getByRole("heading", { name: "Avery Arrival" })).toBeVisible();
  });

  test("keeps the confirmation and offers a retry while offline", async ({ page, context }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await enterRegistration(page, E2E_QR_TOKENS.arrival);
    await enterBadge(page, E2E_BADGES.unusedSecond);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Confirm check-in" }).click();
    await expect(page.getByRole("alert")).toContainText("Connection problem");
    await context.setOffline(false);
    await page.getByRole("button", { name: "Try again: confirm check-in" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Checked in" })).toBeVisible();
  });
});

test.describe("volunteer badge scans", () => {
  test.use({ permissions: ["camera"] });
  test.beforeEach(({ page }) => installQrCamera(page));

  test("shows dietary information only while confirming food, and only for a badge", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Food");
    await enterBadge(page, E2E_QR_TOKENS.ready);
    await expect(page.getByRole("alert")).toContainText("Registration QR no longer works");
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);
    await page.getByRole("button", { name: "Scan next" }).click();

    await enterBadge(page, E2E_BADGES.ready);
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);

    await enterBadge(page, E2E_BADGES.ready);
    await expect(page.getByText("Not redeemed yet")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await reviewScreenshot(page, "test-results/scanner-food-confirm-mobile.png");

    await page.getByRole("button", { name: "Confirm food given" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Food collected" })).toBeVisible();
    await expect(page.getByText("Vegetarian; Allergies: peanuts")).toHaveCount(0);

    await page.getByRole("button", { name: "Scan next" }).click();
    await enterBadge(page, E2E_BADGES.ready);
    await expect(page.getByRole("status").filter({ hasText: "Food Already Collected" })).toContainText("already received their food for Lunch.");
  });

  test("awards the selected event's fixed points by badge and clears state on event change", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Points");
    await expect(page.getByText("Choose an event to start scanning.")).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await page.getByRole("radio", { name: new RegExp(E2E_EVENTS.workshop.name) }).click();
    await expect(page).toHaveURL(new RegExp(`event=${E2E_EVENTS.workshop.eventId}`));
    await expect(page.getByText(`${E2E_EVENTS.workshop.pointsAwarded} points`).first()).toBeVisible();

    for (const [value, message] of [
      [E2E_QR_TOKENS.arrival, "Not checked in yet"],
      [E2E_QR_TOKENS.legacy, "No badge assigned"],
      [E2E_BADGES.retired, "Badge deactivated"],
      [E2E_QR_TOKENS.checkedIn, "Registration QR no longer works"],
    ] as const) {
      await enterBadge(page, value);
      await expect(page.getByRole("region", { name: "Scan result" })).toContainText(message);
      await page.getByRole("button", { name: "Scan next" }).click();
    }

    await enterBadge(page, E2E_BADGES.checkedIn);
    await expect(page.getByRole("region", { name: "Morgan Present" })).toContainText(E2E_EVENTS.workshop.name);
    await expectNoHorizontalScroll(page);
    await reviewScreenshot(page, "test-results/scanner-points-confirm-mobile.png");

    // Event switching is locked while a participant confirmation is open.
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Change event" }).click();
    await expect(page.getByRole("region", { name: "Morgan Present" })).toHaveCount(0);
    await page.getByRole("radio", { name: new RegExp(E2E_EVENTS.panel.name) }).click();
    await enterBadge(page, E2E_BADGES.checkedIn);
    await expect(page.getByRole("status").filter({ hasText: "Points already awarded" })).toContainText(E2E_EVENTS.panel.name);

    await page.getByRole("button", { name: "Scan next" }).click();
    await page.getByRole("button", { name: "Change event" }).click();
    await page.getByRole("radio", { name: new RegExp(E2E_EVENTS.workshop.name) }).click();
    await enterBadge(page, E2E_BADGES.checkedIn);
    await page.getByRole("button", { name: `Award ${E2E_EVENTS.workshop.pointsAwarded} points` }).click();
    await expect(page.getByRole("status").filter({ hasText: "25 points awarded" })).toContainText("Morgan Present received 25 points");
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
    await expect(page.getByRole("status")).toHaveText("Point the camera at the registration QR on the participant's phone.", { timeout: 15_000 });
    await expect(video).toBeVisible();
    await expectNoHorizontalScroll(page);
    await reviewScreenshot(page, "test-results/scanner-camera-mobile.png");

    const tracks = await video.evaluate((element: HTMLVideoElement) => {
      const stream = element.srcObject as MediaStream;
      (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks = stream.getTracks();
      return stream.getTracks().length;
    });
    expect(tracks).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Stop camera" }).click();
    await expect(video).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks.every((track) => track.readyState === "ended"))).toBe(true);

    await page.getByRole("button", { name: "Scan with camera" }).click();
    await expect(page.getByRole("status")).toHaveText("Point the camera at the registration QR on the participant's phone.", { timeout: 15_000 });
    await video.evaluate((element: HTMLVideoElement) => {
      (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks = (element.srcObject as MediaStream).getTracks();
    });
    await openTab(page, "Food");
    await expect(page.getByRole("heading", { name: "Food distribution", exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { scanTracks: MediaStreamTrack[] }).scanTracks.every((track) => track.readyState === "ended"))).toBe(true);
  });
});

test.describe("volunteer camera decoding", () => {
  test.use({ permissions: ["camera"] });

  test("reads a registration QR, then refuses the same code as a badge", async ({ page }) => {
    await showQrToCamera(page, await qrCodeSvg(E2E_QR_TOKENS.arrival));
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await page.getByRole("button", { name: "Scan with camera" }).click();

    await expect(page.getByRole("heading", { name: "Avery Arrival" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-scan-mode="badge"]')).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("That's the registration QR again", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toHaveCount(0);
  });
});

test.describe("volunteer camera without permission", () => {
  test("explains blocked camera access without offering typed codes", async ({ page }) => {
    await signInScanVolunteer(page);
    await openTab(page, "Check-in");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Paste code" })).toHaveCount(0);
    await page.getByRole("button", { name: "Scan with camera" }).click();
    await expect(page.getByRole("alert")).toContainText("Camera access is blocked");
    await expect(page.getByRole("alert")).toContainText("ask an organizer for help");
    await expect(page.getByRole("button", { name: "Try camera again" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use manual entry" })).toHaveCount(0);
  });
});
