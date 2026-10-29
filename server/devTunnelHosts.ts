/** Reserved ngrok hostnames for local Vite (development only). */
export const ADMIN_DEV_NGROK_HOSTS = [
  "drusilla-trabeculate-catina.ngrok-free.dev",
] as const;

export function normalizeRequestHost(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed.split(":")[0] ?? trimmed;
}

export function isAdminDevNgrokHost(host: string) {
  const normalized = normalizeRequestHost(host);
  return (ADMIN_DEV_NGROK_HOSTS as readonly string[]).includes(normalized);
}
