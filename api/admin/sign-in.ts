import { handleAdminSignIn } from "../../server/adminAuthHandlers.ts";
import { vercelAdminAuthHandler } from "../../server/nodeAdminAuthHttp.ts";

export default vercelAdminAuthHandler(handleAdminSignIn);
