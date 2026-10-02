import { convexClient } from "../lib/convexClient";

export function useConvexConfigured(): boolean {
  return convexClient !== null;
}
