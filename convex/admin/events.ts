/**
 * Administrator-only event management. Volunteers award an event's fixed
 * points through `volunteerOperations.ts`; this module only configures events.
 *
 * Every export calls `requireAdminRole` first. Changes are audited in
 * `staffConfigLogs` with `targetEventId`. An event's points are locked once a
 * participant has been awarded them (`assertEventPointsEditable`).
 */
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { adminError } from "../../shared/admin/errors";
import { buildStaffConfigDetails, normalizeEventInput } from "../../shared/admin/volunteerRules";
import { assertEventPointsEditable } from "./pointsLedger";
import { requireAdminRole, sessionTokenArgs } from "./staffAuth";

/** Upper bound for the admin event list and the volunteer assignment picker. */
export const MAX_LISTED_EVENTS = 200;

const eventFields = {
  name: v.string(),
  description: v.optional(v.string()),
  pointsAwarded: v.number(),
  startsAt: v.number(),
  endsAt: v.number(),
};
const eventResult = v.object({ ok: v.literal(true), eventId: v.id("events") });

/** Every event, soonest first, with whether its points are locked by an award. */
export const listEvents = query({
  args: sessionTokenArgs,
  handler: async (ctx, { sessionToken }) => {
    await requireAdminRole(ctx, sessionToken);
    const events = await ctx.db.query("events").order("desc").take(MAX_LISTED_EVENTS);
    const rows = [];
    for (const event of events) {
      const award = await ctx.db.query("participantEventAwards")
        .withIndex("by_event", (q) => q.eq("eventId", event._id)).first();
      rows.push({
        eventId: event._id,
        name: event.name,
        description: event.description ?? null,
        pointsAwarded: event.pointsAwarded,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        active: event.active,
        pointsLocked: award !== null,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      });
    }
    return rows.sort((a, b) => a.startsAt - b.startsAt || a.name.localeCompare(b.name));
  },
});

/** New events start active so they can be assigned and scanned right away. */
export const createEvent = mutation({
  args: { ...sessionTokenArgs, ...eventFields },
  returns: eventResult,
  handler: async (ctx, { sessionToken, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const fields = normalizeEventInput(input);
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      ...fields, active: true, createdAt: now, updatedAt: now,
    });
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_created",
      targetEventId: eventId,
      details: buildStaffConfigDetails({
        pointsAwarded: fields.pointsAwarded,
        startsAt: fields.startsAt,
        endsAt: fields.endsAt,
        after: { active: true },
      }),
      createdAt: now,
    });
    return { ok: true as const, eventId };
  },
});

/** Replaces name, description, points, and schedule. Unchanged input writes nothing. */
export const updateEvent = mutation({
  args: { ...sessionTokenArgs, eventId: v.id("events"), ...eventFields },
  returns: v.object({ ok: v.literal(true), changed: v.boolean() }),
  handler: async (ctx, { sessionToken, eventId, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const event = await ctx.db.get(eventId);
    if (!event) throw adminError("EVENT_NOT_FOUND");
    const fields = normalizeEventInput(input);
    await assertEventPointsEditable(ctx, eventId, fields.pointsAwarded);

    const changedFields = (["name", "description", "pointsAwarded", "startsAt", "endsAt"] as const)
      .filter((key) => event[key] !== fields[key]);
    if (changedFields.length === 0) return { ok: true as const, changed: false };

    const now = Date.now();
    await ctx.db.patch(eventId, { ...fields, description: fields.description, updatedAt: now });
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_updated",
      targetEventId: eventId,
      details: buildStaffConfigDetails({
        changedFields,
        pointsAwarded: fields.pointsAwarded,
        startsAt: fields.startsAt,
        endsAt: fields.endsAt,
      }),
      createdAt: now,
    });
    return { ok: true as const, changed: true };
  },
});

/**
 * Inactive events stay assigned but cannot be scanned (`EVENT_INACTIVE`), and
 * are hidden from volunteers' scan options until reactivated.
 */
export const setEventActive = mutation({
  args: { ...sessionTokenArgs, eventId: v.id("events"), active: v.boolean() },
  returns: v.object({ ok: v.literal(true), changed: v.boolean() }),
  handler: async (ctx, { sessionToken, eventId, active }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const event = await ctx.db.get(eventId);
    if (!event) throw adminError("EVENT_NOT_FOUND");
    if (event.active === active) return { ok: true as const, changed: false };
    const now = Date.now();
    await ctx.db.patch(eventId, { active, updatedAt: now });
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_active_changed",
      targetEventId: eventId,
      details: buildStaffConfigDetails({ before: { active: event.active }, after: { active } }),
      createdAt: now,
    });
    return { ok: true as const, changed: true };
  },
});
