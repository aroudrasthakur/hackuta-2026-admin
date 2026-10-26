/**
 * Administrator-only event administration.
 *
 * Volunteer event visibility and scan-time assignment checks live in
 * `volunteerScan.ts` and `staffAuth.ts` (see VOLUNTEER_AUTHORIZATION.md).
 */

import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { adminError } from "../../shared/admin/errors";
import {
  buildStaffConfigDetails,
  normalizeEventInput,
  type EventScheduleInput,
} from "../../shared/admin/volunteerRules";
import { requireAdminRole, sessionTokenArgs } from "./staffAuth";

const EVENT_NAME_MAX_LENGTH = 120;
const EVENT_DESCRIPTION_MAX_LENGTH = 2_000;
const EVENT_POINTS_MAX_VALUE = 1_000_000;

type EventTimeStatus = "upcoming" | "open" | "ended";

function computeTimeStatus(event: { startsAt: number; endsAt: number }, now: number): EventTimeStatus {
  if (now < event.startsAt) return "upcoming";
  if (now >= event.endsAt) return "ended";
  return "open";
}

function buildEventMetadata(event: { startsAt: number; endsAt: number; active: boolean }, now: number) {
  const timeStatus = computeTimeStatus(event, now);
  return {
    timeStatus,
    awardWindowOpen: event.active && timeStatus === "open",
  };
}

function validateEventInputWithLimits(input: EventScheduleInput) {
  const normalized = normalizeEventInput(input);
  if (normalized.name.length > EVENT_NAME_MAX_LENGTH) {
    throw adminError("INVALID_EVENT");
  }
  if (normalized.description && normalized.description.length > EVENT_DESCRIPTION_MAX_LENGTH) {
    throw adminError("INVALID_EVENT");
  }
  if (normalized.pointsAwarded > EVENT_POINTS_MAX_VALUE) {
    throw adminError("INVALID_EVENT");
  }
  return normalized;
}

export const listEvents = query({
  args: {
    ...sessionTokenArgs,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { sessionToken, paginationOpts }) => {
    await requireAdminRole(ctx, sessionToken);
    const now = Date.now();
    const result = await ctx.db.query("events").order("desc").paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((event) => ({
        ...event,
        ...buildEventMetadata(event, now),
      })),
    };
  },
});

export const getEvent = query({
  args: {
    ...sessionTokenArgs,
    eventId: v.id("events"),
  },
  handler: async (ctx, { sessionToken, eventId }) => {
    await requireAdminRole(ctx, sessionToken);
    const event = await ctx.db.get(eventId);
    if (!event) throw adminError("EVENT_NOT_FOUND");
    const now = Date.now();
    return {
      ...event,
      ...buildEventMetadata(event, now),
    };
  },
});

export const createEvent = mutation({
  args: {
    ...sessionTokenArgs,
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    pointsAwarded: v.number(),
    startsAt: v.number(),
    endsAt: v.number(),
  },
  handler: async (ctx, { sessionToken, ...input }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const normalized = validateEventInputWithLimits(input);
    const now = Date.now();
    const eventId = await ctx.db.insert("events", {
      ...normalized,
      active: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_created",
      targetEventId: eventId,
      details: buildStaffConfigDetails({
        pointsAwarded: normalized.pointsAwarded,
        startsAt: normalized.startsAt,
        endsAt: normalized.endsAt,
        active: false,
      }),
      createdAt: now,
    });
    return { ok: true as const, eventId };
  },
});

export const updateEvent = mutation({
  args: {
    ...sessionTokenArgs,
    eventId: v.id("events"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
  },
  handler: async (ctx, { sessionToken, eventId, ...updates }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const event = await ctx.db.get(eventId);
    if (!event) throw adminError("EVENT_NOT_FOUND");

    const nextName = updates.name === undefined ? event.name : updates.name;
    const nextDescription = updates.description === undefined ? event.description ?? null : updates.description;
    const nextStartsAt = updates.startsAt === undefined ? event.startsAt : updates.startsAt;
    const nextEndsAt = updates.endsAt === undefined ? event.endsAt : updates.endsAt;

    const normalized = validateEventInputWithLimits({
      name: nextName,
      description: nextDescription,
      pointsAwarded: event.pointsAwarded,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
    });

    const patch: Partial<typeof event> = {};
    const changedFields: string[] = [];

    if (normalized.name !== event.name) {
      patch.name = normalized.name;
      changedFields.push("name");
    }
    if ((normalized.description ?? null) !== (event.description ?? null)) {
      patch.description = normalized.description;
      changedFields.push("description");
    }
    if (normalized.startsAt !== event.startsAt) {
      patch.startsAt = normalized.startsAt;
      changedFields.push("startsAt");
    }
    if (normalized.endsAt !== event.endsAt) {
      patch.endsAt = normalized.endsAt;
      changedFields.push("endsAt");
    }

    if (changedFields.length === 0) {
      return { ok: true as const, updated: false as const };
    }

    const now = Date.now();
    patch.updatedAt = now;
    await ctx.db.patch(eventId, patch);
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_updated",
      targetEventId: eventId,
      details: buildStaffConfigDetails({
        changedFields,
        ...(patch.startsAt !== undefined ? { startsAt: patch.startsAt } : {}),
        ...(patch.endsAt !== undefined ? { endsAt: patch.endsAt } : {}),
      }),
      createdAt: now,
    });

    return { ok: true as const, updated: true as const };
  },
});

export const setEventActive = mutation({
  args: {
    ...sessionTokenArgs,
    eventId: v.id("events"),
    active: v.boolean(),
  },
  handler: async (ctx, { sessionToken, eventId, active }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const event = await ctx.db.get(eventId);
    if (!event) throw adminError("EVENT_NOT_FOUND");
    if (event.active === active) return { ok: true as const, updated: false as const };
    const now = Date.now();
    await ctx.db.patch(eventId, { active, updatedAt: now });
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_active_changed",
      targetEventId: eventId,
      details: buildStaffConfigDetails({
        active,
        before: { active: event.active },
        after: { active },
      }),
      createdAt: now,
    });
    return { ok: true as const, updated: true as const };
  },
});

export const setEventPoints = mutation({
  args: {
    ...sessionTokenArgs,
    eventId: v.id("events"),
    pointsAwarded: v.number(),
  },
  handler: async (ctx, { sessionToken, eventId, pointsAwarded }) => {
    const actor = await requireAdminRole(ctx, sessionToken);
    const event = await ctx.db.get(eventId);
    if (!event) throw adminError("EVENT_NOT_FOUND");

    const normalized = validateEventInputWithLimits({
      name: event.name,
      description: event.description ?? null,
      pointsAwarded,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    });
    if (normalized.pointsAwarded === event.pointsAwarded) {
      return { ok: true as const, updated: false as const };
    }

    const existingAward = await ctx.db
      .query("participantEventAwards")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .take(1);
    if (existingAward.length > 0) {
      throw adminError("EVENT_POINTS_LOCKED");
    }

    const now = Date.now();
    await ctx.db.patch(eventId, { pointsAwarded: normalized.pointsAwarded, updatedAt: now });
    await ctx.db.insert("staffConfigLogs", {
      actorAdminId: actor._id,
      action: "event_updated",
      targetEventId: eventId,
      details: buildStaffConfigDetails({
        changedFields: ["pointsAwarded"],
        pointsAwarded: normalized.pointsAwarded,
      }),
      createdAt: now,
    });
    return { ok: true as const, updated: true as const };
  },
});

