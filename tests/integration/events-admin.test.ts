import { anyApi, type ApiFromModules } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as eventsModule from "../../convex/admin/events";
import type * as volunteersModule from "../../convex/admin/volunteers";
import { awardEventPointsRef } from "../../src/convex/adminApi";
import { EVENT_DESCRIPTION_MAX_LENGTH, EVENT_NAME_MAX_LENGTH, EVENT_POINTS_MAX } from "../../shared/admin/volunteerRules";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { ORGANIZER_TEST_PASSWORD } from "../helpers/staffTestFixtures";

const { events, volunteers } = (anyApi as ApiFromModules<{
  "admin/events": typeof eventsModule;
  "admin/volunteers": typeof volunteersModule;
}>).admin;

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 14, 15);
const QR_TOKEN = "ab".repeat(32);
const page = { numItems: 50, cursor: null };
const workshop = { name: "  Intro to Hardware ", description: " Bring a laptop ", startsAt: NOW - HOUR, endsAt: NOW + HOUR };
const schedule = { name: workshop.name, description: workshop.description, startsAt: workshop.startsAt, endsAt: workshop.endsAt };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function fixture() {
  const t = createConvexTest();
  const actor = await seedStaff(t, { role: "admin", name: "Admin Ada" });
  const create = async (overrides: Record<string, unknown> = {}) =>
    (await t.mutation(events.createEvent, { sessionToken: actor.sessionToken, ...workshop, pointsAwarded: 25, ...overrides })).eventId;
  return { t, actor, sessionToken: actor.sessionToken, create };
}

function configLogs(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
}

async function lastDetails(t: ConvexTestInstance, action: string) {
  const log = (await configLogs(t)).filter((row) => row.action === action).at(-1);
  return { log, details: JSON.parse(log!.details!) as Record<string, unknown> };
}

/** Checked-in accepted participant plus a volunteer assigned to `eventId`. */
async function scanSetup(t: ConvexTestInstance, actorAdminId: GenericId<"admins">, eventId: GenericId<"events">) {
  const { applicationId, userId } = await seedApplicant(t, { review: { status: "accepted" } });
  const volunteer = await seedStaff(t, { role: "volunteer" });
  const participantId = await t.run(async (ctx) => {
    await ctx.db.insert("volunteerEventAccess", { volunteerAdminId: volunteer.adminId, eventId, grantedBy: actorAdminId, createdAt: 1 });
    return ctx.db.insert("participants", {
      applicationId, authUserId: userId, acceptedBy: actorAdminId, acceptedAt: 1,
      qrCodeToken: QR_TOKEN, points: 0, checkedInAt: 1, createdAt: 1, updatedAt: 1,
    });
  });
  const award = () => t.mutation(awardEventPointsRef, { sessionToken: volunteer.sessionToken, qrCodeToken: QR_TOKEN, eventId });
  return { participantId, award };
}

function awards(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("participantEventAwards").collect());
}

describe("createEvent", () => {
  it("stores a trimmed, switched-on event with server timestamps and audits the new values", async () => {
    const { t, actor, create } = await fixture();
    const eventId = await create();
    expect(await t.run((ctx) => ctx.db.get(eventId))).toMatchObject({
      name: "Intro to Hardware", description: "Bring a laptop", pointsAwarded: 25,
      startsAt: NOW - HOUR, endsAt: NOW + HOUR, active: true, createdAt: NOW, updatedAt: NOW,
    });
    const { log, details } = await lastDetails(t, "event_created");
    expect(log).toMatchObject({ actorAdminId: actor.adminId, targetEventId: eventId, createdAt: NOW });
    expect(details).toEqual({ after: { active: true, pointsAwarded: 25, startsAt: NOW - HOUR, endsAt: NOW + HOUR } });
  });

  it.each([
    { name: " " },
    { name: "x".repeat(EVENT_NAME_MAX_LENGTH + 1) },
    { description: "x".repeat(EVENT_DESCRIPTION_MAX_LENGTH + 1) },
    { pointsAwarded: 0 },
    { pointsAwarded: 2.5 },
    { pointsAwarded: EVENT_POINTS_MAX + 1 },
    { startsAt: NOW, endsAt: NOW },
    { startsAt: NOW + 1, endsAt: NOW },
    { startsAt: Number.NaN },
    { endsAt: Number.POSITIVE_INFINITY },
  ])("rejects %o without writing", async (override) => {
    const { t, create } = await fixture();
    await expectAdminErrorCode(create(override), "INVALID_EVENT");
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual([]);
    expect(await configLogs(t)).toEqual([]);
  });
});

describe("listEvents and getEvent", () => {
  it("pages every event newest first, including switched-off and ended ones, with the points lock", async () => {
    const { t, actor, sessionToken, create } = await fixture();
    const ended = await create({ name: "Ended", startsAt: NOW - 2 * HOUR, endsAt: NOW - HOUR });
    const off = await create({ name: "Off", description: undefined });
    await t.mutation(events.setEventActive, { sessionToken, eventId: off, active: false });
    const { award } = await scanSetup(t, actor.adminId, await create({ name: "Awarded" }));
    await award();

    const first = await t.query(events.listEvents, { sessionToken, paginationOpts: { numItems: 2, cursor: null } });
    expect(first.page.map((row) => row.name)).toEqual(["Awarded", "Off"]);
    expect(first.page[0]).toMatchObject({ pointsLocked: true, active: true });
    expect(first.page[1]).toMatchObject({ eventId: off, description: null, active: false, pointsLocked: false });
    const rest = await t.query(events.listEvents, { sessionToken, paginationOpts: { numItems: 2, cursor: first.continueCursor } });
    expect(rest.page.map((row) => row.eventId)).toEqual([ended]);
    expect(rest.isDone).toBe(true);
  });

  it("returns one event in the list shape, or null once it is gone", async () => {
    const { t, sessionToken, create } = await fixture();
    const eventId = await create();
    const listed = (await t.query(events.listEvents, { sessionToken, paginationOpts: page })).page[0];
    expect(await t.query(events.getEvent, { sessionToken, eventId })).toEqual(listed);
    await t.run((ctx) => ctx.db.delete(eventId));
    expect(await t.query(events.getEvent, { sessionToken, eventId })).toBeNull();
  });
});

describe("updateEvent", () => {
  it("records changed fields with before/after times and clears a blank description", async () => {
    const { t, sessionToken, create } = await fixture();
    const eventId = await create();
    vi.setSystemTime(NOW + 1000);
    expect(await t.mutation(events.updateEvent, {
      sessionToken, eventId, ...schedule, name: "Hardware Lab", description: "  ", endsAt: NOW + 2 * HOUR,
    })).toEqual({ ok: true, changed: true });
    const stored = await t.run((ctx) => ctx.db.get(eventId));
    expect(stored).toMatchObject({ name: "Hardware Lab", pointsAwarded: 25, endsAt: NOW + 2 * HOUR, updatedAt: NOW + 1000 });
    expect(stored?.description).toBeUndefined();
    const { log, details } = await lastDetails(t, "event_updated");
    expect(log?.targetEventId).toBe(eventId);
    expect(details).toEqual({
      changedFields: ["name", "description", "endsAt"],
      before: { startsAt: NOW - HOUR, endsAt: NOW + HOUR },
      after: { startsAt: NOW - HOUR, endsAt: NOW + 2 * HOUR },
    });
  });

  it("writes nothing when nothing changed", async () => {
    const { t, sessionToken, create } = await fixture();
    const eventId = await create();
    expect(await t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule })).toEqual({ ok: true, changed: false });
    expect((await configLogs(t)).map((row) => row.action)).toEqual(["event_created"]);
  });

  it("keeps existing awards and balances when metadata changes after an award", async () => {
    const { t, actor, sessionToken, create } = await fixture();
    const eventId = await create();
    const { participantId, award } = await scanSetup(t, actor.adminId, eventId);
    expect(await award()).toEqual({ status: "success", pointsAwarded: 25 });
    const before = { awards: await awards(t), participant: await t.run((ctx) => ctx.db.get(participantId)) };

    await t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule, name: "Renamed", startsAt: NOW - 2 * HOUR });
    expect(await awards(t)).toEqual(before.awards);
    expect((await t.run((ctx) => ctx.db.get(participantId)))?.points).toBe(before.participant?.points);
  });

  it("rejects an invalid window and missing events", async () => {
    const { t, sessionToken, create } = await fixture();
    const eventId = await create();
    await expectAdminErrorCode(t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule, endsAt: NOW - HOUR }), "INVALID_EVENT");
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule }), "EVENT_NOT_FOUND");
  });
});

describe("setEventPoints", () => {
  it("changes points before the first award, then locks them and keeps the awarded amount", async () => {
    const { t, actor, sessionToken, create } = await fixture();
    const eventId = await create({ pointsAwarded: 10 });
    expect(await t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded: 10 })).toEqual({ ok: true, changed: false });
    expect(await t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded: 15 })).toEqual({ ok: true, changed: true });
    expect((await lastDetails(t, "event_updated")).details).toEqual({
      changedFields: ["pointsAwarded"], before: { pointsAwarded: 10 }, after: { pointsAwarded: 15 },
    });

    const { participantId, award } = await scanSetup(t, actor.adminId, eventId);
    expect(await award()).toEqual({ status: "success", pointsAwarded: 15 });
    await expectAdminErrorCode(t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded: 20 }), "EVENT_POINTS_LOCKED");
    expect(await t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded: 15 })).toEqual({ ok: true, changed: false });
    expect(await awards(t)).toEqual([expect.objectContaining({ participantId, eventId, pointsAwarded: 15 })]);
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.pointsAwarded).toBe(15);
  });

  it.each([0, -5, 1.5, EVENT_POINTS_MAX + 1])("rejects %d points", async (pointsAwarded) => {
    const { t, sessionToken, create } = await fixture();
    const eventId = await create();
    await expectAdminErrorCode(t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded }), "INVALID_EVENT");
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded: 5 }), "EVENT_NOT_FOUND");
  });
});

describe("setEventActive", () => {
  it("toggles with a before/after audit and ignores no-op changes", async () => {
    const { t, sessionToken, create } = await fixture();
    const eventId = await create();
    expect(await t.mutation(events.setEventActive, { sessionToken, eventId, active: true })).toEqual({ ok: true, changed: false });
    expect(await t.mutation(events.setEventActive, { sessionToken, eventId, active: false })).toEqual({ ok: true, changed: true });
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.active).toBe(false);
    expect((await lastDetails(t, "event_active_changed")).details).toEqual({ before: { active: true }, after: { active: false } });
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(t.mutation(events.setEventActive, { sessionToken, eventId, active: true }), "EVENT_NOT_FOUND");
  });
});

describe("award availability", () => {
  it("awards only while switched on and from startsAt up to, not including, endsAt", async () => {
    const { t, actor, sessionToken, create } = await fixture();
    const eventId = await create({ startsAt: NOW + HOUR, endsAt: NOW + 2 * HOUR });
    const { award } = await scanSetup(t, actor.adminId, eventId);

    vi.setSystemTime(NOW + HOUR - 1);
    expect(await award()).toEqual({ status: "event_inactive" });
    vi.setSystemTime(NOW + 2 * HOUR);
    expect(await award()).toEqual({ status: "event_inactive" });
    vi.setSystemTime(NOW + HOUR);
    await t.mutation(events.setEventActive, { sessionToken, eventId, active: false });
    expect(await award()).toEqual({ status: "event_inactive" });
    await t.mutation(events.setEventActive, { sessionToken, eventId, active: true });
    expect(await award()).toEqual({ status: "success", pointsAwarded: 25 });
  });

  it("applies a schedule change on the next scan", async () => {
    const { t, actor, sessionToken, create } = await fixture();
    const eventId = await create();
    const { award } = await scanSetup(t, actor.adminId, eventId);
    await t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule, startsAt: NOW - 2 * HOUR, endsAt: NOW - HOUR });
    expect(await award()).toEqual({ status: "event_inactive" });
    await t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule });
    expect(await award()).toEqual({ status: "success", pointsAwarded: 25 });
  });
});

describe("getVolunteer", () => {
  it("returns one volunteer with events, or null for other roles and missing ids", async () => {
    const { t, actor, sessionToken, create } = await fixture();
    const { adminId } = await t.mutation(volunteers.createVolunteer, {
      sessionToken, email: "vol@hackuta.org", name: "Val Volunteer", password: ORGANIZER_TEST_PASSWORD, canCheckIn: true, canFoodCheckIn: false,
    });
    const eventId = await create();
    await t.mutation(volunteers.setVolunteerEventAccess, { sessionToken, volunteerAdminId: adminId, eventIds: [eventId] });

    expect(await t.query(volunteers.getVolunteer, { sessionToken, volunteerAdminId: adminId })).toMatchObject({
      adminId, name: "Val Volunteer", email: "vol@hackuta.org", active: true, canCheckIn: true, canFoodCheckIn: false,
      participant: null, events: [{ eventId, name: "Intro to Hardware", active: true }],
    });
    expect(await t.query(volunteers.getVolunteer, { sessionToken, volunteerAdminId: actor.adminId })).toBeNull();
    await t.run((ctx) => ctx.db.delete(adminId));
    expect(await t.query(volunteers.getVolunteer, { sessionToken, volunteerAdminId: adminId })).toBeNull();
  });
});

describe("event management authorization", () => {
  it.each(["reviewer", "volunteer"] as const)("denies every event API to a %s without writing", async (role) => {
    const { t, actor, sessionToken, create } = await fixture();
    const eventId = await create();
    const snapshot = () => t.run(async (ctx) => ({
      events: await ctx.db.query("events").collect(),
      logs: await ctx.db.query("staffConfigLogs").collect(),
    }));
    const before = await snapshot();
    await t.run((ctx) => ctx.db.patch(actor.adminId, { role }));
    const code = role === "reviewer" ? "ADMIN_ONLY" : "NOT_AUTHORIZED";
    await expectAdminErrorCode(t.query(events.listEvents, { sessionToken, paginationOpts: page }), code);
    await expectAdminErrorCode(t.query(events.getEvent, { sessionToken, eventId }), code);
    await expectAdminErrorCode(create(), code);
    await expectAdminErrorCode(t.mutation(events.updateEvent, { sessionToken, eventId, ...schedule, name: "X" }), code);
    await expectAdminErrorCode(t.mutation(events.setEventPoints, { sessionToken, eventId, pointsAwarded: 5 }), code);
    await expectAdminErrorCode(t.mutation(events.setEventActive, { sessionToken, eventId, active: false }), code);
    await expectAdminErrorCode(t.query(volunteers.getVolunteer, { sessionToken, volunteerAdminId: actor.adminId }), code);
    expect(await snapshot()).toEqual(before);
  });
});
