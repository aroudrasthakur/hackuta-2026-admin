import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  routeAdminAuthRequest,
  type AdminAuthApiConfig,
} from "./adminAuthHandlers.ts";
import { pipeNodeAdminAuth } from "./nodeAdminAuthHttp.ts";

function adminAuthApiMiddleware(config: AdminAuthApiConfig) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/admin/")) {
      next();
      return;
    }
    void pipeNodeAdminAuth(req, res, (request) => routeAdminAuthRequest(request, config));
  };
}

export function viteAdminAuthApiPlugin(config: AdminAuthApiConfig = {}): Plugin {
  const middleware = adminAuthApiMiddleware(config);
  return {
    name: "hackuta-admin-auth-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
