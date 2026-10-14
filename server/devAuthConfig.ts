/** Local dev bypass: never enabled outside Vite development mode. */
export function isAdminDevAuthBypassEnabled(options: {
  mode: string;
  viteDevAuthBypass: string | undefined;
}) {
  return options.mode === "development" && options.viteDevAuthBypass === "true";
}
