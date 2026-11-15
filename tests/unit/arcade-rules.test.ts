import { describe, expect, it } from "vitest";
import {
  ARCADE_MAX_SCHEDULE_MS,
  arcadeStateAt,
  balancesAfter,
  bytesToBase64Url,
  checkArcadeSettings,
  checkDeposit,
  checkWithdraw,
  isArcadeGameKey,
  isLaunchCodeShape,
  normalizePlayId,
} from "../../shared/admin/arcadeRules";

const now = 1_700_000_000_000;

describe("arcade rules", () => {
  it("recognizes game keys", () => {
    expect(isArcadeGameKey("olympus-slots")).toBe(true);
    expect(isArcadeGameKey("not-a-game")).toBe(false);
    expect(isArcadeGameKey(1)).toBe(false);
  });

  it("derives arcade state from settings and time", () => {
    const futureOpen = now + 60_000;
    const futureClose = now + 120_000;
    expect(arcadeStateAt({ mode: "off" }, now).status).toBe("off");
    expect(arcadeStateAt({ mode: "on" }, now).status).toBe("on");
    expect(arcadeStateAt({ mode: "on", closesAt: now - 1 }, now).status).toBe("off");
    expect(arcadeStateAt({ mode: "scheduled", opensAt: futureOpen, closesAt: futureClose }, now).status).toBe("scheduled");
    expect(arcadeStateAt({ mode: "scheduled", opensAt: now - 1, closesAt: futureClose }, now).status).toBe("on");
    expect(arcadeStateAt({ mode: "scheduled", opensAt: now - 120_000, closesAt: now - 60_000 }, now).status).toBe("off");
  });

  it("validates admin settings", () => {
    const opens = now + 60_000;
    const closes = now + 120_000;
    expect(checkArcadeSettings({ mode: "off" }, now)).toEqual({ ok: true, value: { mode: "off" } });
    expect(checkArcadeSettings({ mode: "on" }, now)).toEqual({ ok: true, value: { mode: "on" } });
    expect(checkArcadeSettings({ mode: "on", closesAt: closes }, now)).toEqual({ ok: true, value: { mode: "on", closesAt: closes } });
    expect(checkArcadeSettings({ mode: "on", closesAt: now - 1 }, now).ok).toBe(false);
    expect(checkArcadeSettings({ mode: "scheduled", opensAt: opens, closesAt: closes }, now).ok).toBe(true);
    expect(checkArcadeSettings({ mode: "scheduled", opensAt: closes, closesAt: opens }, now).ok).toBe(false);
    expect(checkArcadeSettings({ mode: "scheduled", opensAt: opens, closesAt: opens + ARCADE_MAX_SCHEDULE_MS + 1 }, now).ok).toBe(false);
    expect(checkArcadeSettings({ mode: "bad" as never, opensAt: opens, closesAt: closes }, now).ok).toBe(false);
  });

  it("normalizes play ids and launch codes", () => {
    expect(normalizePlayId(" spin-1 ")).toBe("spin-1");
    expect(normalizePlayId("")).toBe(null);
    expect(normalizePlayId("has spaces")).toBe(null);
    const code = "A".repeat(43);
    expect(isLaunchCodeShape(code)).toBe(true);
    expect(isLaunchCodeShape("short")).toBe(false);
    const bytes = new Uint8Array([0, 255, 128]);
    expect(bytesToBase64Url(bytes)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("checks transfers and balances", () => {
    expect(checkDeposit(10, 100)).toBe(null);
    expect(checkDeposit(200, 100)).toBe("INSUFFICIENT_POINTS");
    expect(checkDeposit(0.5, 100)).toBe("INVALID_AMOUNT");
    expect(checkWithdraw(10, 50)).toBe(null);
    expect(checkWithdraw(60, 50)).toBe("INSUFFICIENT_ARCADE_POINTS");
    expect(balancesAfter("deposit", 10, 100, 5)).toEqual({ profile: 90, arcade: 15 });
    expect(balancesAfter("withdraw", 10, 100, 50)).toEqual({ profile: 110, arcade: 40 });
  });
});