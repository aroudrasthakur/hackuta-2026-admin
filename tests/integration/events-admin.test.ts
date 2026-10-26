import { anyApi, type ApiFromModules } from "convex/server";
import { describe, expect, it } from "vitest";
import type * as eventsModule from "../../convex/admin/events";
import type * as volunteersModule from "../../convex/admin/volunteers";
import { MAX_LISTED_EVENTS } from "../../convex/admin/events";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest, type ConvexTestInstance } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";
import { ORGANIZER_TEST_PASSWORD } from "../helpers/staffTestFixtures";

const { events, volunteers } = (anyApi as ApiFromModules<{
  "admin/events": typeof eventsModule;
  "admin/volunteers": typeof volunteersModule;
}>).admin;

const HOUR = 60 * 60 * 1000;
const workshop = { name: "  Intro to Hardware ", description: " Bring a laptop ", pointsAwarded: 25, startsAt: 10 * HOUR, endsAt: 12 * HOUR };

async function fixture() {
  const t = createConvexTest();
  const actor = await seedStaff(t, { role: "admin", name: "Admin Ada" });
  return { t, actor, sessionToken: actor.sessionToken };
}

function configLogs(t: ConvexTestInstance) {
  return t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
}

describe("createEvent", () => {
  it("stores a trimmed active event and audits it against the event", async () => {
    const { t, actor, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    const stored = await t.run((ctx) => ctx.db.get(eventId));
    expect(stored).toMatchObject({
      name: "Intro to Hardware", description: "Bring a laptop", pointsAwarded: 25,
      startsAt: 10 * HOUR, endsAt: 12 * HOUR, active: true,
    });
    const [log] = await configLogs(t);
    expect(log).toMatchObject({ actorAdminId: actor.adminId, action: "event_created", targetEventId: eventId });
    expect(JSON.parse(log!.details!)).toEqual({ pointsAwarded: 25, startsAt: 10 * HOUR, endsAt: 12 * HOUR, after: { active: true } });
  });

  it.each([
    { name: " " },
    { pointsAwarded: 0 },
    { pointsAwarded: 2.5 },
    { startsAt: 12 * HOUR, endsAt: 12 * HOUR },
  ])("rejects invalid input %o without writing", async (override) => {
    const { t, sessionToken } = await fixture();
    await expectAdminErrorCode(t.mutation(events.createEvent, { sessionToken, ...workshop, ...override }), "INVALID_EVENT");
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toEqual([]);
    expect(await configLogs(t)).toEqual([]);
  });
});

describe("listEvents", () => {
  it("lists events by start time with the points lock", async () => {
    const { t, actor, sessionToken } = await fixture();
    const late = await t.mutation(events.createEvent, { sessionToken, ...workshop, name: "Late", startsAt: 20 * HOUR, endsAt: 21 * HOUR });
    const early = await t.mutation(events.createEvent, { sessionToken, ...workshop, name: "Early", description: undefined });
    const { applicationId, userId } = await seedApplicant(t);
    await t.run(async (ctx) => {
      const participantId = await ctx.db.insert("participants", {
        applicationId, authUserId: userId, acceptedBy: actor.adminId, acceptedAt: 1,
        qrCodeToken: "ab".repeat(32), points: 25, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("participantEventAwards", {
        participantId, eventId: late.eventId, pointsAwarded: 25, awardedBy: actor.adminId, awardedAt: 1,
      });
    });

    const rows = await t.query(events.listEvents, { sessionToken });
    expect(rows.map((row) => row.name)).toEqual(["Early", "Late"]);
    expect(rows[0]).toMatchObject({ eventId: early.eventId, description: null, pointsLocked: false, active: true });
    expect(rows[1]).toMatchObject({ eventId: late.eventId, description: "Bring a laptop", pointsLocked: true });
  });

  it("caps the list", async () => {
    const { t, sessionToken } = await fixture();
    await t.run(async (ctx) => {
      for (let i = 0; i < MAX_LISTED_EVENTS + 3; i += 1) {
        await ctx.db.insert("events", { name: `E${i}`, pointsAwarded: 1, active: true, startsAt: 1, endsAt: 2, createdAt: 1, updatedAt: 1 });
      }
    });
    expect(await t.query(events.listEvents, { sessionToken })).toHaveLength(MAX_LISTED_EVENTS);
  });
});

describe("updateEvent", () => {
  it("records only the fields that changed and clears a blank description", async () => {
    const { t, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    const result = await t.mutation(events.updateEvent, {
      sessionToken, eventId, ...workshop, name: "Hardware Lab", description: "  ", pointsAwarded: 30,
    });
    expect(result).toEqual({ ok: true, changed: true });
    const stored = await t.run((ctx) => ctx.db.get(eventId));
    expect(stored).toMatchObject({ name: "Hardware Lab", pointsAwarded: 30 });
    expect(stored?.description).toBeUndefined();
    const log = (await configLogs(t)).find((row) => row.action === "event_updated");
    expect(log?.targetEventId).toBe(eventId);
    expect(JSON.parse(log!.details!)).toMatchObject({ changedFields: ["name", "description", "pointsAwarded"], pointsAwarded: 30 });
  });

  it("writes nothing when nothing changed", async () => {
    const { t, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    expect(await t.mutation(events.updateEvent, { sessionToken, eventId, ...workshop })).toEqual({ ok: true, changed: false });
    expect((await configLogs(t)).map((row) => row.action)).toEqual(["event_created"]);
  });

  it("locks points after an award but still allows other edits", async () => {
    const { t, actor, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    const { applicationId, userId } = await seedApplicant(t);
    await t.run(async (ctx) => {
      const participantId = await ctx.db.insert("participants", {
        applicationId, authUserId: userId, acceptedBy: actor.adminId, acceptedAt: 1,
        qrCodeToken: "cd".repeat(32), points: 25, createdAt: 1, updatedAt: 1,
      });
      await ctx.db.insert("participantEventAwards", { participantId, eventId, pointsAwarded: 25, awardedBy: actor.adminId, awardedAt: 1 });
    });
    await expectAdminErrorCode(
      t.mutation(events.updateEvent, { sessionToken, eventId, ...workshop, pointsAwarded: 50 }),
      "EVENT_POINTS_LOCKED",
    );
    expect(await t.mutation(events.updateEvent, { sessionToken, eventId, ...workshop, name: "Renamed" })).toEqual({ ok: true, changed: true });
  });

  it("rejects missing events and invalid input", async () => {
    const { t, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    await expectAdminErrorCode(t.mutation(events.updateEvent, { sessionToken, eventId, ...workshop, endsAt: 1 }), "INVALID_EVENT");
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(t.mutation(events.updateEvent, { sessionToken, eventId, ...workshop }), "EVENT_NOT_FOUND");
  });
});

describe("setEventActive", () => {
  it("toggles active with a before/after audit and ignores no-op changes", async () => {
    const { t, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    expect(await t.mutation(events.setEventActive, { sessionToken, eventId, active: true })).toEqual({ ok: true, changed: false });
    expect(await t.mutation(events.setEventActive, { sessionToken, eventId, active: false })).toEqual({ ok: true, changed: true });
    expect((await t.run((ctx) => ctx.db.get(eventId)))?.active).toBe(false);
    const log = (await configLogs(t)).find((row) => row.action === "event_active_changed");
    expect(JSON.parse(log!.details!)).toEqual({ before: { active: true }, after: { active: false } });
    await t.run((ctx) => ctx.db.delete(eventId));
    await expectAdminErrorCode(t.mutation(events.setEventActive, { sessionToken, eventId, active: true }), "EVENT_NOT_FOUND");
  });
});

describe("getVolunteer", () => {
  it("returns one volunteer with events, or null for other roles and missing ids", async () => {
    const { t, actor, sessionToken } = await fixture();
    const { adminId } = await t.mutation(volunteers.createVolunteer, {
      sessionToken, email: "vol@hackuta.org", name: "Val Volunteer", password: ORGANIZER_TEST_PASSWORD, canCheckIn: true, canFoodCheckIn: false,
    });
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
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
    const { t, actor, sessionToken } = await fixture();
    const { eventId } = await t.mutation(events.createEvent, { sessionToken, ...workshop });
    const before = await t.run(async (ctx) => ({
      events: await ctx.db.query("events").collect(),
      logs: await ctx.db.query("staffConfigLogs").collect(),
    }));
    await t.run((ctx) => ctx.db.patch(actor.adminId, { role }));
    const code = role === "reviewer" ? "ADMIN_ONLY" : "NOT_AUTHORIZED";
    await expectAdminErrorCode(t.query(events.listEvents, { sessionToken }), code);
    await expectAdminErrorCode(t.mutation(events.createEvent, { sessionToken, ...workshop }), code);
    await expectAdminErrorCode(t.mutation(events.updateEvent, { sessionToken, eventId, ...workshop, name: "X" }), code);
    await expectAdminErrorCode(t.mutation(events.setEventActive, { sessionToken, eventId, active: false }), code);
    await expectAdminErrorCode(t.query(volunteers.getVolunteer, { sessionToken, volunteerAdminId: actor.adminId }), code);
    expect(await t.run(async (ctx) => ({
      events: await ctx.db.query("events").collect(),
      logs: await ctx.db.query("staffConfigLogs").collect(),
    }))).toEqual(before);
  });
});
