import { expect, test } from "@playwright/test";
import { E2E_ADMIN, E2E_REVIEWER, signInOrganizer } from "./fixtures/auth";
import { setDecisionQueue } from "./fixtures/decisionQueue";

async function openQueue(page: import("@playwright/test").Page) {
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Decision emails" }).click();
}

test.describe("decision email queue", () => {
  test("reviewers can read delivery states but cannot select, hold, or send", async ({ page }) => {
    await signInOrganizer(page, E2E_REVIEWER);
    await setDecisionQueue(page, "mixed");
    await openQueue(page);
    await expect(page.getByRole("table", { name: "Decision email queue" })).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Send|Hold|Retry failed/i })).toHaveCount(0);
    await expect(page.getByLabel("Delivery: queued", { exact: true })).toHaveText("Queued");
    await expect(page.getByLabel("Delivery: failed", { exact: true })).toHaveText("Failed");
  });

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
    await expect(page.getByRole("status")).toContainText("Sent 1 of 1. 0 failed.");
    await expect(page.getByRole("region", { name: "Recently sent decision emails" })).toContainText("Casey Decision");
    await expect(page.getByRole("button", { name: "Send selected", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Retry failed", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("1 failed email returned to the queue.");
    await page.getByRole("button", { name: "Send all queued", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Sent 1 of 1. 0 failed.");
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
      if (width === 375 || width === 1440) await page.screenshot({ path: testInfo.outputPath(`decision-emails-${width}.png`), fullPage: true });
    }
  });

  test("shows contextual loading and empty states", async ({ page }) => {
    await signInOrganizer(page, E2E_ADMIN);
    await setDecisionQueue(page, "loading");
    await openQueue(page);
    await expect(page.getByRole("status")).toHaveText("Loading decision emails…");
    await expect(page.getByRole("heading", { name: "Decision emails", exact: true })).toBeVisible();
    await setDecisionQueue(page, "empty");
    await expect(page.getByRole("heading", { name: "No decision emails are waiting" })).toBeVisible();
    await expect(page.getByText("No decision emails have been sent yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send all queued" })).toBeDisabled();
  });
});
