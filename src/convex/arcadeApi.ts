import { makeFunctionReference } from "convex/server";
import type { ArcadeMode, ArcadeState } from "../../shared/admin/arcadeRules";

export type ArcadeAdminGameRow = {
  key: string;
  name: string;
  order: number;
  enabled: boolean;
  updatedAt: number;
};

export type ArcadeAdminSettings = {
  mode: ArcadeMode;
  opensAt?: number | null;
  closesAt?: number | null;
  launchEnabled: boolean;
  backupSignIn: boolean;
  updatedAt: number;
};

export type ArcadeAdminSnapshot = {
  serverNow: number;
  settings: ArcadeAdminSettings;
  state: ArcadeState;
  games: ArcadeAdminGameRow[];
};

export const getArcadeAdminRef = makeFunctionReference<
  "query",
  { sessionToken: string },
  ArcadeAdminSnapshot
>("arcade/admin:getArcadeAdmin");

export const updateArcadeSettingsRef = makeFunctionReference<
  "mutation",
  {
    sessionToken: string;
    mode: ArcadeMode;
    opensAt?: number | null;
    closesAt?: number | null;
    launchEnabled?: boolean;
    backupSignIn?: boolean;
  },
  { ok: true }
>("arcade/admin:updateArcadeSettings");

export const updateArcadeGameRef = makeFunctionReference<
  "mutation",
  { sessionToken: string; key: string; enabled: boolean },
  { ok: true }
>("arcade/admin:updateArcadeGame");
