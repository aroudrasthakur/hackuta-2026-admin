import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sessionTokenRoute from "../../api/admin/session-token";
import signInRoute from "../../api/admin/sign-in";
import signOutRoute from "../../api/admin/sign-out";
import { ADMIN_SESSION_COOKIE, isSecureRequest, readAdminSessionCookie, serializeAdminSessionCookie } from "../../server/adminAuthCookie";
import { routeAdminAuthRequest } from "../../server/adminAuthHandlers";
import { viteAdminAuthApiPlugin } from "../../server/viteAdminAuthApiPlugin";

const convex = vi.hoisted(() => ({ mutation: vi.fn(), urls: [] as string[] }));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    constructor(url: string) {
      convex.urls.push(url);
    }
    mutation = convex.mutation;
  },
}));

const base = "http://127.0.0.1:5173";
const token = "c".repeat(64);
const cookieHeader = `${ADMIN_SESSION_COOKIE}=${token}`;

beforeEach(() => {
  convex.mutation.mockReset();
  convex.urls.length = 0;
  vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function post(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("sign-in API", () => {
  it("sets the HttpOnly session cookie and never returns the token in the body", async () => {
    convex.mutation.mockResolvedValue({ ok: true, sessionToken: token, expiresAt: 123 });
    const response = await signInRoute(post("/api/admin/sign-in", { email: "a@hackuta.org", password: "pw" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, expiresAt: 123 });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=${token}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), { email: "a@hackuta.org", password: "pw" });
    expect(convex.urls).toEqual(["https://example.convex.cloud"]);
  });

  it("marks the cookie Secure behind an HTTPS proxy", async () => {
    convex.mutation.mockResolvedValue({ ok: true, sessionToken: token, expiresAt: 1 });
    const response = await signInRoute(post("/api/admin/sign-in", {}, { "x-forwarded-proto": "https" }));
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), { email: "", password: "" });
  });

  it.each([
    ["Invalid email or password.", 401],
    ["This account is inactive.", 403],
  ])("returns %s with status %i", async (message, status) => {
    convex.mutation.mockResolvedValue({ ok: false, error: message });
    const response = await signInRoute(post("/api/admin/sign-in", { email: "a", password: "b" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: message });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns a generic error for a non-Error failure", async () => {
    convex.mutation.mockRejectedValue("boom");
    const response = await signInRoute(post("/api/admin/sign-in", { email: "a", password: "b" }));
    expect(await response.json()).toEqual({ error: "Sign-in failed." });
  });

  it("rejects a body that is not JSON", async () => {
    const response = await signInRoute(post("/api/admin/sign-in", "not json"));
    expect(response.status).toBe(400);
    expect(convex.mutation).not.toHaveBeenCalled();
  });

  it("fails closed when the Convex URL is missing", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");
    vi.stubEnv("CONVEX_URL", "");
    const response = await signInRoute(post("/api/admin/sign-in", { email: "a", password: "b" }));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatch(/Missing VITE_CONVEX_URL/);
  });

  it("falls back to CONVEX_URL", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");
    vi.stubEnv("CONVEX_URL", "https://fallback.convex.cloud");
    convex.mutation.mockResolvedValue({ ok: true, sessionToken: token, expiresAt: 1 });
    await signInRoute(post("/api/admin/sign-in", {}));
    expect(convex.urls).toEqual(["https://fallback.convex.cloud"]);
  });
});

describe("sign-out API", () => {
  it("ends the server session and clears the cookie", async () => {
    convex.mutation.mockResolvedValue({ ok: true });
    const response = await signOutRoute(post("/api/admin/sign-out", undefined, { cookie: cookieHeader }));
    expect(convex.mutation).toHaveBeenCalledWith(expect.anything(), { sessionToken: token });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("clears the cookie even when the server call fails", async () => {
    convex.mutation.mockRejectedValue(new Error("gone"));
    const response = await signOutRoute(post("/api/admin/sign-out", undefined, { cookie: cookieHeader }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("skips the server call without a cookie", async () => {
    const response = await signOutRoute(post("/api/admin/sign-out"));
    expect(convex.mutation).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

describe("session-token API", () => {
  it("returns the token from the cookie", async () => {
    const response = await sessionTokenRoute(new Request(`${base}/api/admin/session-token`, { headers: { cookie: cookieHeader } }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(token);
  });

  it("returns 401 without a cookie", async () => {
    const response = await sessionTokenRoute(new Request(`${base}/api/admin/session-token`));
    expect(response.status).toBe(401);
  });
});

describe("API routing", () => {
  it.each([
    ["GET", "/api/admin/sign-in"],
    ["GET", "/api/admin/sign-out"],
    ["POST", "/api/admin/session-token"],
  ])("rejects %s %s", async (method, path) => {
    const response = await routeAdminAuthRequest(new Request(`${base}${path}`, { method }));
    expect(response.status).toBe(405);
  });

  it("returns 404 for unknown paths", async () => {
    expect((await routeAdminAuthRequest(new Request(`${base}/api/admin/other`))).status).toBe(404);
  });

  it("routes every known path", async () => {
    convex.mutation.mockResolvedValue({ ok: true, sessionToken: token, expiresAt: 1 });
    expect((await routeAdminAuthRequest(post("/api/admin/sign-in", {}))).status).toBe(200);
    expect((await routeAdminAuthRequest(post("/api/admin/sign-out"))).status).toBe(200);
    expect((await routeAdminAuthRequest(new Request(`${base}/api/admin/session-token`))).status).toBe(401);
  });
});

describe("cookie helpers", () => {
  it("returns null for a missing or malformed cookie", () => {
    expect(readAdminSessionCookie(null)).toBeNull();
    expect(readAdminSessionCookie("other=1")).toBeNull();
    expect(readAdminSessionCookie(`${ADMIN_SESSION_COOKIE}=%E0%A4%A`)).toBeNull();
  });

  it("round-trips tokens with special characters", () => {
    const cookie = serializeAdminSessionCookie("a b;c", false).split(";")[0];
    expect(readAdminSessionCookie(cookie)).toBe("a b;c");
  });

  it("detects HTTPS from the URL", () => {
    expect(isSecureRequest(new Request("https://admin.hackuta.org/"))).toBe(true);
    expect(isSecureRequest(new Request("http://127.0.0.1/"))).toBe(false);
  });
});

describe("Vite dev auth plugin", () => {
  type Middleware = (req: unknown, res: unknown, next: () => void) => void;

  function mountPlugin() {
    let middleware!: Middleware;
    const plugin = viteAdminAuthApiPlugin();
    (plugin.configureServer as (server: unknown) => void)({
      middlewares: { use: (fn: Middleware) => (middleware = fn) },
    });
    return middleware;
  }

  function nodeRequest(url: string, method: string, body = "", headers: Record<string, string> = {}) {
    const chunks = body ? [body] : [];
    return {
      url,
      method,
      headers: { host: "127.0.0.1:5173", ...headers },
      async *[Symbol.asyncIterator]() {
        yield* chunks;
      },
    };
  }

  function nodeResponse() {
    const headers: Record<string, string> = {};
    let resolveEnd!: (body: string) => void;
    const ended = new Promise<string>((resolve) => (resolveEnd = resolve));
    return {
      headers,
      ended,
      statusCode: 0,
      setHeader: (key: string, value: string) => (headers[key] = value),
      end: (body: Buffer | string) => resolveEnd(String(body)),
    };
  }

  it("passes non-API requests to the next middleware", () => {
    const next = vi.fn();
    mountPlugin()(nodeRequest("/admin/applications", "GET"), nodeResponse(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("serves sign-in with the request body and cookie header", async () => {
    convex.mutation.mockResolvedValue({ ok: true, sessionToken: token, expiresAt: 9 });
    const res = nodeResponse();
    mountPlugin()(
      nodeRequest("/api/admin/sign-in", "POST", JSON.stringify({ email: "a@hackuta.org", password: "pw" }), {
        "content-type": "application/json",
      }),
      res,
      vi.fn(),
    );
    expect(JSON.parse(await res.ended)).toEqual({ ok: true, expiresAt: 9 });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toContain(ADMIN_SESSION_COOKIE);
  });

  it("serves GET requests without a body", async () => {
    const res = nodeResponse();
    mountPlugin()(nodeRequest("/api/admin/session-token", "GET", "", { cookie: cookieHeader }), res, vi.fn());
    expect(await res.ended).toBe(token);
  });

  it("returns 500 when reading the request fails", async () => {
    const res = nodeResponse();
    const broken = {
      url: "/api/admin/sign-in",
      method: "POST",
      headers: {},
      // eslint-disable-next-line require-yield
      async *[Symbol.asyncIterator]() {
        throw new Error("socket closed");
      },
    };
    mountPlugin()(broken, res, vi.fn());
    expect(await res.ended).toBe("socket closed");
    expect(res.statusCode).toBe(500);
  });

  it("returns a generic 500 for a non-Error failure", async () => {
    const res = nodeResponse();
    const broken = {
      url: "/api/admin/sign-in",
      method: "POST",
      headers: {},
      // eslint-disable-next-line require-yield
      async *[Symbol.asyncIterator]() {
        throw "boom";
      },
    };
    mountPlugin()(broken, res, vi.fn());
    expect(await res.ended).toBe("Internal Server Error");
  });
});
