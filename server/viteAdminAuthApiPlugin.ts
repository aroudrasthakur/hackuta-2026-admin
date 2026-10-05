import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { routeAdminAuthRequest } from "./adminAuthHandlers";

async function readNodeRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function writeNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function toWebRequest(req: IncomingMessage, body: Buffer) {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const method = req.method ?? "GET";
  const init: RequestInit = {
    method,
    headers: req.headers as HeadersInit,
  };
  if (method !== "GET" && method !== "HEAD" && body.length > 0) {
    init.body = new Uint8Array(body);
  }
  return new Request(url, init);
}

export function viteAdminAuthApiPlugin(): Plugin {
  return {
    name: "hackuta-admin-auth-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/admin/")) {
          next();
          return;
        }
        void (async () => {
          try {
            const body = await readNodeRequestBody(req);
            const request = toWebRequest(req, body);
            const response = await routeAdminAuthRequest(request);
            await writeNodeResponse(res, response);
          } catch (error) {
            res.statusCode = 500;
            res.end(error instanceof Error ? error.message : "Internal Server Error");
          }
        })();
      });
    },
  };
}
