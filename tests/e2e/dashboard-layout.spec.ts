import { expect, test } from "@playwright/test";
import { E2E_ADMIN, signInOrganizer, signInVolunteer } from "./fixtures/auth";
import { setDecisionQueue } from "./fixtures/decisionQueue";
import { reviewScreenshot } from "./fixtures/reviewScreenshot";

const widths = [320, 375, 768, 1024, 1440];
const adminPages = ["Applications", "Decision emails", "Participants", "Volunteers", "Events", "Meals", "Shop"] as const;

test("keeps page headers and role navigation usable at every dashboard width", async ({ page }, testInfo) => {
  await signInOrganizer(page, E2E_ADMIN);
  await page.getByRole("button", { name: "Calm", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Admin", exact: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const name of adminPages) {
    await navigation.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(navigation.locator('[aria-current="page"]')).toHaveText(name);
    await expect(navigation.getByRole("link")).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await reviewScreenshot(page, `${name.toLowerCase().replaceAll(" ", "-")}-1440.png`, testInfo);
  }
  await navigation.getByRole("link", { name: "Applications", exact: true }).click();
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Applications");
    await expect(navigation.getByRole("link")).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375) await reviewScreenshot(page, "applications-375.png", testInfo);
  }
});

test("keeps the storm backdrop pinned while page content scrolls", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Shop", exact: true }).click();
  await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText("Shop");
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const backdrop = await page.locator(".sign-in-storm").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { top: rect.top, height: rect.height, scrollY };
  });
  expect(backdrop.scrollY).toBeGreaterThan(0);
  expect(backdrop.top).toBe(0);
  expect(backdrop.height).toBe(600);
});

test("keeps long staff and applicant details within the viewport", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await setDecisionQueue(page, "mixed");
  await setDecisionQueue(page, "long-content");
  for (const name of ["Applications", "Decision emails"]) {
    await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name, exact: true }).click();
    for (const width of [320, 375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const trigger = page.getByRole("button", { name: /Account menu for/ });
      if (width < 640) {
        await trigger.click();
        await expect(page.getByRole("menu")).toContainText("Alexandria Montgomery-Wellington, HackUTA Operations");
        const menuBox = (await page.getByRole("menu").boundingBox())!;
        expect(menuBox.x).toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
      }
    }
  }
});

test("supports mobile account keyboard interaction and reduced-motion loading", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 812 });
  await signInOrganizer(page, E2E_ADMIN);
  const trigger = page.getByRole("button", { name: /Account menu for/ });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Applications", exact: true })).toBeFocused();
  await setDecisionQueue(page, "loading");
  await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: "Decision emails" }).click();
  await expect(page.getByRole("status")).toHaveText("Loading decision emails…");
  await expect(page.locator(".admin-skeleton").first()).toHaveCSS("animation-name", "none");
  await expect(page.locator('[aria-current="page"]')).toHaveCSS("transition-duration", "0s");
  await expect(page.locator(".sign-in-storm")).toHaveAttribute("data-motion", "false");
});

test("keeps management and email controls available at 200 percent CSS zoom", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signInOrganizer(page, E2E_ADMIN);
  await setDecisionQueue(page, "mixed");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  for (const name of ["Participants", "Meals", "Shop", "Decision emails"]) {
    await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByRole("button", { name: "Send all queued" })).toBeVisible();
});

test("keeps status and primary-action text above a 4.5 to 1 contrast ratio", async ({ page }) => {
  await signInOrganizer(page, E2E_ADMIN);
  await setDecisionQueue(page, "mixed");
  const contrast = (foreground: string, background: string) => {
    const luminance = (color: string) => {
      expect(color, "Expected an opaque computed RGB color").toMatch(/^rgb\(\d+, \d+, \d+\)$/);
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const first = luminance(foreground), second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };
  for (const name of ["Applications", "Decision emails"]) {
    await page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveText(name);
    const badges = page.locator(".admin-badge:visible");
    await expect(badges).toHaveCount(name === "Applications" ? 4 : 7);
    // Read together so navigation cannot detach a badge between lookups.
    const badgeColors = await badges.evaluateAll((elements) => elements.map((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    })));
    for (const colors of badgeColors) {
      expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  }
  const button = page.getByRole("button", { name: "Send selected", exact: true });
  await page.getByRole("checkbox", { name: "Select Casey Decision" }).check();
  const colors = await button.evaluate((element) => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
});

test("captures the volunteer dashboard at mobile and desktop widths", async ({ page }, testInfo) => {
  await signInVolunteer(page);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening),/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Admin", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 375 || width === 1440) await reviewScreenshot(page, `volunteer-dashboard-${width}.png`, testInfo);
  }
});
