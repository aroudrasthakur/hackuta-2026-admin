/* eslint-disable */
/**
 * Minimal Convex server stubs for CI when codegen is unavailable (no CONVEX_DEPLOYMENT).
 * Copied to convex/_generated/server.ts before typecheck and build.
 */
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import type { GenericActionCtx, GenericMutationCtx, GenericQueryCtx } from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;

export type QueryCtx = GenericQueryCtx<Record<string, never>>;
export type MutationCtx = GenericMutationCtx<Record<string, never>>;
export type ActionCtx = GenericActionCtx<Record<string, never>>;

export const env = process.env;
