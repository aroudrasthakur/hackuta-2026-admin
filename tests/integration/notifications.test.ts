import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelFlashSaleRef,
  cancelNotificationRef,
  createFlashSaleRef,
  createShopItemRef,
  getNotificationAdminRef,
  listNotificationsAdminRef,
  publishNotificationNowRef,
  saveNotificationDraftRef,
  scheduleNotificationRef,
  updateFlashSaleRef,
  updateNotificationRef,
} from "../../src/convex/adminApi";
import { publishScheduledNotificationRef } from "../../convex/admin/notifications";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";

const NOW = Date.UTC(2026, 10, 14, 15, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const listPublishedNotificationsRef = makeFunctionReference<
  "query",
  { nowBucket?: number },
  Array<{
    notificationId: string;
    title: string;
    message: string;
    type: "general" | "event" | "reminder" | "flash_sale" | "important";
    publishedAt: number;
    expiresAt: number | null;
    linkUrl: string | null;
    linkLabel: string | null;
  }> | null
>("admin/participantShop:listPublishedNotifications");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedNotificationsContext() {
  const t = createConvexTest();
  const admin = await seedStaff(t, { role: "admin" });
  const volunteer = await seedStaff(t, { role: "volunteer" });
  const { userId } = await seedApplicant(t, { review: { status: "accepted" } });
  const asParticipant = t.withIdentity({ subject: userId, email: "taylor@example.com" });
  return { t, admin, volunteer, userId, asParticipant };
}

describe("admin notifications management & participant notifications", () => {
  it("saves drafts, edits drafts, and keeps drafts hidden from participants until published", async () => {
    const { t, admin, asParticipant } = await seedNotificationsContext();

    const { notificationId } = await t.mutation(saveNotificationDraftRef, {
      sessionToken: admin.sessionToken,
      title: "  Opening Ceremony  ",
      message: "  Doors open at 10 AM in the main auditorium. ",
      type: "event",
      linkUrl: "/dashboard/schedule",
      linkLabel: "View schedule",
    });

    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);

    const detail = await t.query(getNotificationAdminRef, {
      sessionToken: admin.sessionToken,
      notificationId,
    });
    expect(detail).toMatchObject({
      notificationId,
      title: "Opening Ceremony",
      message: "Doors open at 10 AM in the main auditorium.",
      type: "event",
      status: "draft",
      linkUrl: "/dashboard/schedule",
      linkLabel: "View schedule",
    });

    await t.mutation(saveNotificationDraftRef, {
      sessionToken: admin.sessionToken,
      notificationId,
      title: "Opening Ceremony Updated",
      message: "Doors open at 9:45 AM.",
      type: "important",
      linkUrl: "/dashboard/schedule",
      linkLabel: "Updated schedule",
    });

    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);

    const published = await t.mutation(publishNotificationNowRef, {
      sessionToken: admin.sessionToken,
      notificationId,
      title: "Opening Ceremony Live",
      message: "Head to the auditorium now!",
      type: "important",
      linkUrl: "/dashboard/schedule",
      linkLabel: "Schedule",
    });
    expect(published.publishedAt).toBe(NOW);

    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([
      {
        notificationId,
        title: "Opening Ceremony Live",
        message: "Head to the auditorium now!",
        type: "important",
        publishedAt: NOW,
        expiresAt: null,
        linkUrl: "/dashboard/schedule",
        linkLabel: "Schedule",
      },
    ]);

    // Published notifications cannot be silently edited or cancelled.
    await expectAdminErrorCode(
      t.mutation(saveNotificationDraftRef, {
        sessionToken: admin.sessionToken,
        notificationId,
        title: "Silent edit",
        message: "Not allowed",
        type: "general",
      }),
      "NOTIFICATION_NOT_EDITABLE",
    );
    await expectAdminErrorCode(
      t.mutation(cancelNotificationRef, {
        sessionToken: admin.sessionToken,
        notificationId,
      }),
      "NOTIFICATION_NOT_EDITABLE",
    );
  });

  it("publishes scheduled notifications automatically at the configured time via Convex scheduler", async () => {
    const { t, admin, asParticipant } = await seedNotificationsContext();
    const scheduledAt = NOW + 15 * MINUTE;

    const { notificationId } = await t.mutation(scheduleNotificationRef, {
      sessionToken: admin.sessionToken,
      title: "AI Workshop",
      message: "Starts in Room 204 in 15 minutes.",
      type: "event",
      scheduledAt,
      linkUrl: "/dashboard/schedule",
      linkLabel: "Workshop details",
    });

    // Hidden before scheduledAt
    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);

    // Drain scheduled functions (vi.runAllTimers advances Date.now() to scheduledAt)
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const participantFeed = await asParticipant.query(listPublishedNotificationsRef, {});
    expect(participantFeed).toEqual([
      {
        notificationId,
        title: "AI Workshop",
        message: "Starts in Room 204 in 15 minutes.",
        type: "event",
        publishedAt: scheduledAt,
        expiresAt: null,
        linkUrl: "/dashboard/schedule",
        linkLabel: "Workshop details",
      },
    ]);

    // Duplicate or retry execution of the scheduled job is a safe no-op
    const retryResult = await t.mutation(publishScheduledNotificationRef, {
      notificationId,
      scheduleVersion: 1,
    });
    expect(retryResult).toEqual({ published: false });
  });

  it("prevents obsolete scheduled jobs from publishing when rescheduled or cancelled", async () => {
    const { t, admin, asParticipant } = await seedNotificationsContext();
    const firstSchedule = NOW + 10 * MINUTE;
    const secondSchedule = NOW + 30 * MINUTE;

    const { notificationId } = await t.mutation(scheduleNotificationRef, {
      sessionToken: admin.sessionToken,
      title: "Midnight Snack",
      message: "Tacos at midnight.",
      type: "reminder",
      scheduledAt: firstSchedule,
    });

    // Reschedule to secondSchedule via updateNotification
    await t.mutation(updateNotificationRef, {
      sessionToken: admin.sessionToken,
      notificationId,
      title: "Midnight Snack Rescheduled",
      message: "Tacos at 12:30 AM.",
      type: "reminder",
      scheduledAt: secondSchedule,
    });

    // Even if an obsolete job with version 1 fires at firstSchedule, it must not publish
    vi.setSystemTime(firstSchedule);
    expect(
      await t.mutation(publishScheduledNotificationRef, {
        notificationId,
        scheduleVersion: 1,
      }),
    ).toEqual({ published: false });
    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);

    // Now cancel the scheduled notification before secondSchedule
    await t.mutation(cancelNotificationRef, {
      sessionToken: admin.sessionToken,
      notificationId,
    });

    vi.setSystemTime(secondSchedule);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await t.mutation(publishScheduledNotificationRef, {
        notificationId,
        scheduleVersion: 2,
      }),
    ).toEqual({ published: false });
    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);

    const adminRow = await t.query(getNotificationAdminRef, {
      sessionToken: admin.sessionToken,
      notificationId,
    });
    expect(adminRow?.status).toBe("cancelled");
  });

  it("sorts published notifications newest-first, hides expired ones from participants, and supports admin search/filters", async () => {
    const { t, admin, asParticipant } = await seedNotificationsContext();

    await t.mutation(publishNotificationNowRef, {
      sessionToken: admin.sessionToken,
      title: "Morning Check-in",
      message: "Bring your QR code to the main desk.",
      type: "general",
    });

    vi.setSystemTime(NOW + 5 * MINUTE);
    await t.mutation(publishNotificationNowRef, {
      sessionToken: admin.sessionToken,
      title: "Temporary Sticker Drop",
      message: "Grab a sticker at the booth.",
      type: "flash_sale",
      expiresAt: NOW + 10 * MINUTE,
    });

    vi.setSystemTime(NOW + 8 * MINUTE);
    await t.mutation(publishNotificationNowRef, {
      sessionToken: admin.sessionToken,
      title: "Judging Guidelines",
      message: "Submit on Devpost before 12 PM.",
      type: "important",
    });

    // At NOW + 8 min, all 3 are active, newest first
    const feedAt8 = await asParticipant.query(listPublishedNotificationsRef, {});
    expect(feedAt8?.map((item) => item.title)).toEqual([
      "Judging Guidelines",
      "Temporary Sticker Drop",
      "Morning Check-in",
    ]);

    // At NOW + 12 min, Temporary Sticker Drop is expired and excluded from participant feed
    vi.setSystemTime(NOW + 12 * MINUTE);
    const feedAt12 = await asParticipant.query(listPublishedNotificationsRef, {});
    expect(feedAt12?.map((item) => item.title)).toEqual([
      "Judging Guidelines",
      "Morning Check-in",
    ]);

    // Admin history still preserves the expired notification with expired: true
    const adminAll = await t.query(listNotificationsAdminRef, {
      sessionToken: admin.sessionToken,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(adminAll.page.map((row) => ({ title: row.title, expired: row.expired }))).toEqual([
      { title: "Judging Guidelines", expired: false },
      { title: "Temporary Sticker Drop", expired: true },
      { title: "Morning Check-in", expired: false },
    ]);

    // Search and filter in admin query
    const filteredByType = await t.query(listNotificationsAdminRef, {
      sessionToken: admin.sessionToken,
      type: "important",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(filteredByType.page.map((row) => row.title)).toEqual(["Judging Guidelines"]);

    const searched = await t.query(listNotificationsAdminRef, {
      sessionToken: admin.sessionToken,
      search: "sticker",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(searched.page.map((row) => row.title)).toEqual(["Temporary Sticker Drop"]);
  });

  it("integrates flash sales with participantNotifications without duplicates on edit or cancellation", async () => {
    const { t, admin, asParticipant } = await seedNotificationsContext();
    const { itemId } = await t.mutation(createShopItemRef, {
      sessionToken: admin.sessionToken,
      name: "HackUTA Hoodie",
      description: "Warm hoodie",
      pointsCost: 500,
      stockQuantity: 10,
      featured: true,
    });

    // Schedule a flash sale in the future
    const { flashSaleId } = await t.mutation(createFlashSaleRef, {
      sessionToken: admin.sessionToken,
      title: "Hoodie Happy Hour",
      message: "Hoodies for 350 points",
      startsAt: NOW + 20 * MINUTE,
      endsAt: NOW + 50 * MINUTE,
      items: [{ itemId: itemId as GenericId<"shopItems">, salePointsCost: 350 }],
    });

    // Not visible to participants before startsAt
    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);

    // Edit the scheduled flash sale — must update the existing notification, not create a duplicate
    await t.mutation(updateFlashSaleRef, {
      sessionToken: admin.sessionToken,
      flashSaleId,
      title: "Late Night Hoodie Sale",
      message: "Hoodies down to 300 points!",
      startsAt: NOW + 25 * MINUTE,
      endsAt: NOW + 55 * MINUTE,
      items: [{ itemId: itemId as GenericId<"shopItems">, salePointsCost: 300 }],
    });

    const adminListBeforeStart = await t.query(listNotificationsAdminRef, {
      sessionToken: admin.sessionToken,
      type: "flash_sale",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(adminListBeforeStart.page).toHaveLength(1);
    expect(adminListBeforeStart.page[0]).toMatchObject({
      title: "Late Night Hoodie Sale",
      message: "Hoodies down to 300 points!",
      type: "flash_sale",
      status: "scheduled",
      scheduledAt: NOW + 25 * MINUTE,
      relatedFlashSale: { flashSaleId, title: "Late Night Hoodie Sale" },
    });

    // At NOW + 25 min, scheduled function publishes the flash sale notification
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const liveFeed = await asParticipant.query(listPublishedNotificationsRef, {});
    expect(liveFeed).toHaveLength(1);
    expect(liveFeed?.[0]).toMatchObject({
      title: "Late Night Hoodie Sale",
      message: "Hoodies down to 300 points!",
      type: "flash_sale",
      publishedAt: NOW + 25 * MINUTE,
      expiresAt: NOW + 55 * MINUTE,
    });

    // Cancelling the live sale withdraws the notification from the participant portal
    await t.mutation(cancelFlashSaleRef, {
      sessionToken: admin.sessionToken,
      flashSaleId,
    });
    expect(await asParticipant.query(listPublishedNotificationsRef, {})).toEqual([]);
  });

  it("covers relatedEvent validation, scheduleNotification on existing rows, and updateNotification on drafts", async () => {
    const { t, admin } = await seedNotificationsContext();

    const eventId = await t.run((ctx) =>
      ctx.db.insert("events", {
        name: "Keynote Panel",
        pointsAwarded: 25,
        startsAt: NOW,
        endsAt: NOW + HOUR,
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );

    // Create draft linked to an event
    const { notificationId } = await t.mutation(saveNotificationDraftRef, {
      sessionToken: admin.sessionToken,
      title: "Keynote Reminder",
      message: "Join the keynote panel.",
      type: "event",
      relatedEventId: eventId,
    });

    // Update draft via updateNotification (stays draft)
    const draftUpdate = await t.mutation(updateNotificationRef, {
      sessionToken: admin.sessionToken,
      notificationId,
      title: "Keynote Reminder Edited",
      message: "Join the keynote panel in 10 minutes.",
      type: "event",
      relatedEventId: eventId,
    });
    expect(draftUpdate).toEqual({ ok: true, status: "draft" });

    // Transition existing draft to scheduled via scheduleNotification
    const scheduled = await t.mutation(scheduleNotificationRef, {
      sessionToken: admin.sessionToken,
      notificationId,
      title: "Keynote Scheduled",
      message: "Starting soon.",
      type: "event",
      scheduledAt: NOW + 30 * MINUTE,
      relatedEventId: eventId,
    });
    expect(scheduled.scheduledAt).toBe(NOW + 30 * MINUTE);

    // Convert scheduled back to draft via saveNotificationDraft
    await t.mutation(saveNotificationDraftRef, {
      sessionToken: admin.sessionToken,
      notificationId,
      title: "Keynote Back To Draft",
      message: "Back to draft.",
      type: "event",
      relatedEventId: eventId,
    });

    // Combined status + type + message search in listNotificationsAdmin
    const filtered = await t.query(listNotificationsAdminRef, {
      sessionToken: admin.sessionToken,
      status: "draft",
      type: "event",
      search: "back to draft",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(filtered.page).toHaveLength(1);
    expect(filtered.page[0]?.relatedEvent).toEqual({ eventId, name: "Keynote Panel" });
  });

  it("restricts notification management to admins and returns null for signed-out participants", async () => {
    const { t, volunteer } = await seedNotificationsContext();

    expect(await t.query(listPublishedNotificationsRef, {})).toBeNull();

    await expectAdminErrorCode(
      t.mutation(saveNotificationDraftRef, {
        sessionToken: volunteer.sessionToken,
        title: "Unauthorized",
        message: "Should fail",
        type: "general",
      }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.mutation(publishNotificationNowRef, {
        sessionToken: volunteer.sessionToken,
        title: "Unauthorized",
        message: "Should fail",
        type: "general",
      }),
      "NOT_AUTHORIZED",
    );
    await expectAdminErrorCode(
      t.query(listNotificationsAdminRef, {
        sessionToken: volunteer.sessionToken,
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "NOT_AUTHORIZED",
    );
  });
});
