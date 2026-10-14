const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function normalizeHost(host: string) {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isLoopbackHost(host: string) {
  return LOOPBACK_HOSTS.has(normalizeHost(host));
}

function requestHost(request: Request) {
  const hostHeader = request.headers.get("host");
  if (hostHeader) {
    return hostHeader.split(":")[0] ?? hostHeader;
  }
  return new URL(request.url).hostname;
}

/** True when the request targets loopback and is not forwarded from a remote client. */
export function isLoopbackAdminRequest(request: Request) {
  const host = requestHost(request);
  if (!isLoopbackHost(host)) {
    return false;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return true;
  }

  const clientHop = forwarded.split(",")[0]?.trim();
  if (!clientHop) {
    return true;
  }

  return isLoopbackHost(clientHop);
}

/** Client IP for organizer sign-in rate limiting (first X-Forwarded-For hop or request host). */
export function getAdminSignInClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const clientHop = forwarded.split(",")[0]?.trim();
    if (clientHop) {
      return clientHop;
    }
  }
  return requestHost(request);
}
