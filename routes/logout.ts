import { define } from "../utils.ts";
import { type Api } from "../lib/api/mod.ts";
import { clearSessionCookies } from "../lib/session.ts";

function signOut(api: Api, token: string | null): Response {
  const headers = new Headers({ Location: "/login" });
  clearSessionCookies(headers);
  if (token) {
    // Revoke the server-side session (best-effort; cookies cleared regardless).
    api.auth.logout().catch(() => {});
  }
  return new Response(null, { status: 303, headers });
}

export const handler = define.handlers({
  POST(ctx) {
    return signOut(ctx.state.api, ctx.state.sessionKey);
  },
  GET(ctx) {
    return signOut(ctx.state.api, ctx.state.sessionKey);
  },
});
