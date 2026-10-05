import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import {
  clearAdminSessionCookie,
  isSecureRequest,
  readAdminSessionCookie,
  serializeAdminSessionCookie,
} from "./adminAuthCookie";

const adminSignInRef = makeFunctionReference<
  "mutation",
  { email: string; password: string },
  { sessionToken: string; expiresAt: number }
>("admin/auth:signIn");

const adminSignOutRef = makeFunctionReference<
  "mutation",
  { sessionToken: string },
  { ok: true }
>("admin/auth:signOut");

function convexUrl() {
  return process.env.VITE_CONVEX_URL?.trim() || process.env.CONVEX_URL?.trim();
}

function createConvexClient() {
  const url = convexUrl();
  if (!url) {
    throw new Error("Missing VITE_CONVEX_URL for organizer auth API.");
  }
  return new ConvexHttpClient(url);
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export async function handleAdminSignIn(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secure = isSecureRequest(request);
  let email: string;
  let password: string;
  try {
    const body = await readJsonBody<{ email?: string; password?: string }>(request);
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } catch {
    return jsonResponse({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const client = createConvexClient();
    const result = await client.mutation(adminSignInRef, { email, password });
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      serializeAdminSessionCookie(result.sessionToken, secure),
    );
    return jsonResponse({ ok: true, expiresAt: result.expiresAt }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    const status = message.includes("inactive") ? 403 : 401;
    return jsonResponse({ error: message }, { status });
  }
}

export async function handleAdminSignOut(request: Request) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secure = isSecureRequest(request);
  const sessionToken = readAdminSessionCookie(request.headers.get("cookie"));
  if (sessionToken) {
    try {
      const client = createConvexClient();
      await client.mutation(adminSignOutRef, { sessionToken });
    } catch {
      // Always clear the browser cookie even if the server row is already gone.
    }
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearAdminSessionCookie(secure));
  return jsonResponse({ ok: true }, { headers });
}

export async function handleAdminSessionToken(request: Request) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sessionToken = readAdminSessionCookie(request.headers.get("cookie"));
  if (!sessionToken) {
    return new Response(null, { status: 401 });
  }

  return new Response(sessionToken, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function routeAdminAuthRequest(request: Request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/admin/sign-in") {
    return handleAdminSignIn(request);
  }
  if (pathname === "/api/admin/sign-out") {
    return handleAdminSignOut(request);
  }
  if (pathname === "/api/admin/session-token") {
    return handleAdminSessionToken(request);
  }
  return new Response("Not Found", { status: 404 });
}
