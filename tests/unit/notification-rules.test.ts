import { describe, expect, it } from "vitest";
import { adminErrorCode } from "../../shared/admin/errors";
import {
  assertNotificationExpiry,
  assertNotificationSchedule,
  isNotificationStatus,
  isNotificationType,
  NOTIFICATION_LINK_LABEL_MAX_LENGTH,
  NOTIFICATION_LINK_URL_MAX_LENGTH,
  NOTIFICATION_MESSAGE_MAX_LENGTH,
  NOTIFICATION_SEARCH_MAX_LENGTH,
  NOTIFICATION_TITLE_MAX_LENGTH,
  normalizeNotificationInput,
  normalizeNotificationLinkLabel,
  normalizeNotificationLinkUrl,
  normalizeNotificationSearch,
} from "../../shared/admin/notificationRules";

function errorCode(run: () => unknown) {
  try {
    run();
  } catch (caught) {
    return adminErrorCode(caught);
  }
  return null;
}

describe("notificationRules", () => {
  it("recognizes valid notification types and statuses", () => {
    expect(isNotificationType("general")).toBe(true);
    expect(isNotificationType("flash_sale")).toBe(true);
    expect(isNotificationType("unknown")).toBe(false);
    expect(isNotificationStatus("draft")).toBe(true);
    expect(isNotificationStatus("published")).toBe(true);
    expect(isNotificationStatus("archived")).toBe(false);
  });

  it("normalizes internal and external link URLs and rejects unsafe schemes", () => {
    expect(normalizeNotificationLinkUrl(undefined)).toBeUndefined();
    expect(normalizeNotificationLinkUrl("   ")).toBeUndefined();
    expect(normalizeNotificationLinkUrl(" /dashboard/schedule ")).toBe("/dashboard/schedule");
    expect(normalizeNotificationLinkUrl("https://hackuta.org/rules")).toBe("https://hackuta.org/rules");
    expect(errorCode(() => normalizeNotificationLinkUrl("//evil.example"))).toBe("INVALID_NOTIFICATION");
    expect(errorCode(() => normalizeNotificationLinkUrl("javascript:alert(1)"))).toBe("INVALID_NOTIFICATION");
    expect(errorCode(() => normalizeNotificationLinkUrl("data:text/html,hi"))).toBe("INVALID_NOTIFICATION");
    expect(errorCode(() => normalizeNotificationLinkUrl(`/${"a".repeat(NOTIFICATION_LINK_URL_MAX_LENGTH)}`))).toBe(
      "INVALID_NOTIFICATION",
    );
  });

  it("requires a link URL when a link label is provided", () => {
    expect(normalizeNotificationLinkLabel("View schedule", true)).toBe("View schedule");
    expect(normalizeNotificationLinkLabel("   ", false)).toBeUndefined();
    expect(errorCode(() => normalizeNotificationLinkLabel("View schedule", false))).toBe(
      "INVALID_NOTIFICATION",
    );
    expect(
      errorCode(() =>
        normalizeNotificationLinkLabel("a".repeat(NOTIFICATION_LINK_LABEL_MAX_LENGTH + 1), true),
      ),
    ).toBe("INVALID_NOTIFICATION");
  });

  it("normalizes notification content and validates schedule/expiry windows", () => {
    expect(
      normalizeNotificationInput({
        title: "  Lunch is Ready ",
        message: "  Main atrium check-in is open. ",
        type: "general",
        linkUrl: "/dashboard/schedule",
        linkLabel: "View schedule",
        expiresAt: 2_000,
      }),
    ).toEqual({
      title: "Lunch is Ready",
      message: "Main atrium check-in is open.",
      type: "general",
      linkUrl: "/dashboard/schedule",
      linkLabel: "View schedule",
      expiresAt: 2_000,
    });

    expect(
      errorCode(() =>
        normalizeNotificationInput({
          title: "a".repeat(NOTIFICATION_TITLE_MAX_LENGTH + 1),
          message: "ok",
          type: "general",
        }),
      ),
    ).toBe("INVALID_NOTIFICATION");

    expect(
      errorCode(() =>
        normalizeNotificationInput({
          title: "ok",
          message: "a".repeat(NOTIFICATION_MESSAGE_MAX_LENGTH + 1),
          type: "general",
        }),
      ),
    ).toBe("INVALID_NOTIFICATION");

    expect(assertNotificationSchedule(5_000, 1_000, 10_000)).toBe(5_000);
    expect(errorCode(() => assertNotificationSchedule(1_000, 1_000))).toBe(
      "INVALID_NOTIFICATION_SCHEDULE",
    );
    expect(errorCode(() => assertNotificationSchedule(5_000, 1_000, 4_000))).toBe(
      "INVALID_NOTIFICATION_SCHEDULE",
    );
    expect(() => assertNotificationExpiry(1_000, 2_000)).not.toThrow();
    expect(errorCode(() => assertNotificationExpiry(1_000, 1_000))).toBe(
      "INVALID_NOTIFICATION_SCHEDULE",
    );
  });

  it("normalizes search terms and rejects overly long filters", () => {
    expect(normalizeNotificationSearch("  Lunch  ")).toBe("lunch");
    expect(
      errorCode(() => normalizeNotificationSearch("x".repeat(NOTIFICATION_SEARCH_MAX_LENGTH + 1))),
    ).toBe("INVALID_NOTIFICATION_FILTER");
  });
});
