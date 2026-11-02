import type { GenericId } from "convex/values";
import type { MutationCtx } from "../../convex/lib/dataModel";

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
    points: points ?? 0,
    ...(pointsReachedAt !== undefined ? { pointsReachedAt } : {}),
    createdAt,
    updatedAt,
  });
  return { participantId, checkedInId };
}

export function getCheckedIn(ctx: MutationCtx, participantId: GenericId<"participants">) {
  return ctx.db
    .query("checkedIn")
    .withIndex("by_participant", (q) => q.eq("participantId", participantId))
    .unique();
}
