import type { GenericId } from "convex/values";
import type { MutationCtx } from "../../convex/lib/dataModel";
import { CHECK_IN_STARTING_POINTS } from "../../shared/admin/volunteerRules";

type CheckedInFields = {
  badgeQrCodeToken?: string;
  registrationQrCodeToken?: string;
  badgeAssignedAt?: number;
  badgeAssignedBy?: GenericId<"admins">;
  points?: number;
  pointsReachedAt?: number;
  foodCheckedInAt?: number;
};

export type ParticipantSeedFields = CheckedInFields & {
  qrCodeToken: string;
  foodRestriction?: string;
  checkedInAt?: number;
  createdAt?: number;
  updatedAt?: number;
  /** Defaults to accepted for pre-check-in seeds so door-scan tests match production after disclosure. */
  mediaDisclosureAccepted?: boolean;
};

/**
 * Inserts a slim `participants` row. Operational badge/points fields create a
 * `checkedIn` row so tests match the post-split schema.
 */
export async function insertParticipantWithOptionalCheckIn(
  ctx: MutationCtx,
  args: {
    applicationId: GenericId<"applications">;
    authUserId: GenericId<"users">;
    acceptedBy: GenericId<"admins">;
    acceptedAt?: number;
  } & ParticipantSeedFields,
) {
  const {
    applicationId,
    authUserId,
    acceptedBy,
    acceptedAt = 1,
    qrCodeToken,
    foodRestriction,
    checkedInAt,
    createdAt = 1,
    updatedAt = 1,
    badgeQrCodeToken,
    registrationQrCodeToken,
    badgeAssignedAt,
    badgeAssignedBy,
    points,
    pointsReachedAt,
    foodCheckedInAt: _foodCheckedInAt,
    mediaDisclosureAccepted,
  } = args;
  void _foodCheckedInAt;

  const participantId = await ctx.db.insert("participants", {
    applicationId,
    authUserId,
    acceptedAt,
    acceptedBy,
    qrCodeToken,
    ...(foodRestriction !== undefined ? { foodRestriction } : {}),
    ...(checkedInAt !== undefined ? { checkedInAt } : {}),
    createdAt,
    updatedAt,
  });

  const acceptDisclosure = mediaDisclosureAccepted ?? checkedInAt === undefined;
  if (acceptDisclosure) {
    await ctx.db.insert("participantMediaDisclosures", {
      participantId,
      acceptedAt,
    });
  }

  const onSite = checkedInAt !== undefined || badgeQrCodeToken !== undefined || registrationQrCodeToken !== undefined;
  if (!onSite) {
    return { participantId, checkedInId: null };
  }

  const checkedInId = await ctx.db.insert("checkedIn", {
    participantId,
    applicationId,
    authUserId,
    acceptedAt,
    acceptedBy,
    ...(foodRestriction !== undefined ? { foodRestriction } : {}),
    checkedInAt: checkedInAt ?? badgeAssignedAt ?? updatedAt,
    checkedInBy: badgeAssignedBy ?? acceptedBy,
    qrCodeToken: badgeQrCodeToken ?? qrCodeToken,
    registrationQrCodeToken: registrationQrCodeToken ?? qrCodeToken,
    ...(badgeQrCodeToken !== undefined ? { badgeQrCodeToken } : {}),
    ...(badgeAssignedAt !== undefined ? { badgeAssignedAt } : {}),
    ...(badgeAssignedBy !== undefined ? { badgeAssignedBy } : {}),
    points: points ?? CHECK_IN_STARTING_POINTS,
    ...(pointsReachedAt !== undefined
      ? { pointsReachedAt }
      : points === undefined
        ? { pointsReachedAt: checkedInAt ?? badgeAssignedAt ?? updatedAt }
        : {}),
    createdAt,
    updatedAt,
  });
  if (points === undefined) {
    await ctx.db.insert("volunteerActionLogs", {
      actorAdminId: badgeAssignedBy ?? acceptedBy,
      checkedInId,
      action: "check_in",
      pointsDelta: CHECK_IN_STARTING_POINTS,
      previousPoints: 0,
      newPoints: CHECK_IN_STARTING_POINTS,
      createdAt,
    });
  }
  return { participantId, checkedInId };
}

export function getCheckedIn(ctx: MutationCtx, participantId: GenericId<"participants">) {
  return ctx.db
    .query("checkedIn")
    .withIndex("by_participant", (q) => q.eq("participantId", participantId))
    .unique();
}
