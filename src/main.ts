import { App, staticFiles } from "fresh";
import { type State } from "./utils.ts";
import { ApiError, createApi } from "./lib/api/mod.ts";
import {
  clearSessionCookies,
  getCachedPrincipal,
  getSessionToken,
} from "./lib/session.ts";

export const app = new App<State>();

app.use(staticFiles());

// Load the session (token + cached principal) from cookies and bind an API
// client to it (ctx.state.api), so routes call ctx.state.api.<concern>.<method>.
app.use((ctx) => {
  const token = getSessionToken(ctx.req);
  ctx.state.sessionKey = token;
  ctx.state.principal = token ? getCachedPrincipal(ctx.req) : null;
  ctx.state.api = createApi(token);
  return ctx.next();
});

// Convert an upstream 401 (expired/invalid session against a --auth backend)
// into a redirect to the login page, clearing the stale cookies.
app.use(async (ctx) => {
  try {
    return await ctx.next();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const url = new URL(ctx.req.url);
      const next = encodeURIComponent(url.pathname + url.search);
      const headers = new Headers({ Location: `/login?next=${next}` });
      clearSessionCookies(headers);
      return new Response(null, { status: 303, headers });
    }
    throw err;
  }
});

// File-system based routes (routes/).
app.fsRoutes();
