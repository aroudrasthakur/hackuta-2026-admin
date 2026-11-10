import { expect, test } from "@playwright/test";
import { E2E_ADMIN, signInOrganizer } from "./fixtures/auth";
import { setDecisionQueue } from "./fixtures/decisionQueue";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

async function openQueue(page: import("@playwright/test").Page) {
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Decision emails" }).click();
}

test.describe("decision email queue", () => {
  test("admins hold, unhold, send selected, retry failed, and send all queued", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await setDecisionQueue(page, "mixed");
    await openQueue(page);
    const queuedRow = page.getByRole("row").filter({ hasText: "Casey Decision" });
    await queuedRow.getByRole("button", { name: "Hold", exact: true }).click();
    await expect(queuedRow.getByRole("checkbox")).toBeDisabled();
    await expect(queuedRow.getByLabel("Delivery: held")).toBeVisible();
    await queuedRow.getByRole("button", { name: "Unhold", exact: true }).click();
    await queuedRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send selected", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sent 1 of 1. 0 failed." })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recently sent decision emails" })).toContainText("Casey Decision");
    await expect(page.getByRole("button", { name: "Send selected", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Retry failed", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 failed email returned to the queue." })).toBeVisible();
    await page.getByRole("button", { name: "Send all queued", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sent 1 of 1. 0 failed." })).toBeVisible();
    await expect(page.getByLabel("Delivery: held")).toHaveCount(1);
  });

  test("sending blocks release actions and failures recover within the page", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await setDecisionQueue(page, "sending");
    await openQueue(page);
    await expect(page.getByLabel("Delivery: sending")).toHaveText("Sending");
    for (const name of ["Send selected", "Send all queued", "Retry failed"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    }
    await setDecisionQueue(page, "error");
    await expect(page.getByRole("alert")).toContainText("Unable to load decision emails");
    await expect(page.getByRole("heading", { name: "Decision emails", exact: true })).toBeVisible();
    await setDecisionQueue(page, "mixed");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("keeps all row controls reachable on small screens", async ({ page }, testInfo) => {
    await signInOrganizer(page, E2E_ADMIN);
    await setDecisionQueue(page, "mixed");
    await openQueue(page);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const region = page.getByRole("region", { name: "Queued decision emails", exact: true });
      await region.focus();
      await expect(region).toBeFocused();
      const hold = region.getByRole("button", { name: "Hold", exact: true });
      await hold.scrollIntoViewIfNeeded();
      await expect(hold).toBeInViewport();
      await region.evaluate((element) => { element.scrollLeft = 0; });
      if (width === 375 || width === 1440) await reviewScreenshot(page, `decision-emails-${width}.png`, testInfo);
    }
  });

  test("pauses decision sending from the outbound mail card after Confirm", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await setDecisionQueue(page, "mixed");
    await openQueue(page);
    const confirmation = page.getByRole("switch", { name: "Confirmation emails", exact: true });
    const decision = page.getByRole("switch", { name: "Decision emails", exact: true });
    const confirm = page.getByRole("button", { name: "Confirm", exact: true });
    await expect(page.getByRole("heading", { name: "Outbound mail" })).toBeVisible();
    const dangerTitle = page.getByText("Danger zone", { exact: true });
    await expect(dangerTitle).toBeVisible();
    await expect(dangerTitle).toHaveCSS("text-align", "center");
    await expect(page.getByText("Set flag for decision and confirmation emails, (off = sending off).")).toBeVisible();
    await expect(page.locator(".admin-card--danger")).toHaveCSS("border-top-color", "rgb(155, 48, 59)");
    await expect(confirm).toHaveClass(/admin-danger-confirm/);
    await expect(confirm).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(confirmation).toHaveAttribute("aria-checked", "true");
    await expect(decision).toHaveAttribute("aria-checked", "true");
    await expect(confirm).toBeDisabled();

    await decision.click();
    await expect(decision).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Decision emails are paused" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send all queued", exact: true })).toBeEnabled();

    await confirm.click();
    await expect(page.getByRole("status").filter({ hasText: "Decision emails are paused" })).toBeVisible();
    for (const name of ["Send selected", "Send all queued", "Retry failed"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    }
    await expect(page.getByRole("button", { name: "Hold", exact: true })).toBeEnabled();

    await confirmation.click();
    await expect(confirmation).toHaveAttribute("aria-checked", "false");
    await expect(decision).toHaveAttribute("aria-checked", "false");
    await confirm.click();
    await expect(confirmation).toHaveAttribute("aria-checked", "false");
    await expect(decision).toHaveAttribute("aria-checked", "false");

    await decision.click();
    await confirm.click();
    await expect(page.getByRole("status").filter({ hasText: "Decision emails are paused" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send all queued", exact: true })).toBeEnabled();
  });

  test("shows contextual loading and empty states", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await setDecisionQueue(page, "loading");
    await openQueue(page);
    await expect(page.getByRole("status").filter({ hasText: "Loading decision emails…" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Decision emails", exact: true })).toBeVisible();
    await setDecisionQueue(page, "empty");
    await expect(page.getByRole("heading", { name: "No decision emails are waiting" })).toBeVisible();
    await expect(page.getByText("No decision emails have been sent yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send all queued" })).toBeDisabled();
  });
});
