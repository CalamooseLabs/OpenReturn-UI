import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError, createApi } from "../lib/api/mod.ts";
import { setSessionCookies } from "../lib/session.ts";
import type { Principal } from "../lib/types.ts";
import { ErrorAlert } from "../components/ui.tsx";

interface Data {
  error?: string;
  next: string;
  username?: string;
}

function safeNext(raw: string | null): string {
  // Only allow same-site relative paths.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export const handler = define.handlers({
  GET(ctx) {
    const next = safeNext(ctx.url.searchParams.get("next"));
    return page<Data>({ next });
  },

  async POST(ctx) {
    const form = await ctx.req.formData();
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const next = safeNext(String(form.get("next") ?? "/"));

    if (!username || !password) {
      return page<Data>({
        error: "Enter a username and password.",
        next,
        username,
      });
    }

    try {
      const res = await ctx.state.api.auth.login(username, password);
      // Enrich the cached principal with permissions when the backend exposes
      // them (--auth mode). Against a dev backend without --auth, /auth/me
      // returns 200 {error:"not authenticated"} (no throw), so fall back to the
      // login user (which carries roles) whenever /auth/me lacks permissions.
      const fallback: Principal = {
        kind: "user",
        label: res.user.username,
        permissions: [],
        user: res.user,
      };
      let principal: Principal = fallback;
      try {
        const fetched = await createApi(res.session_key).auth.me();
        if (fetched && Array.isArray((fetched as Principal).permissions)) {
          principal = fetched;
        }
      } catch {
        // keep fallback
      }
      const headers = new Headers({ Location: next });
      setSessionCookies(headers, res.session_key, principal, res.expires_at);
      return new Response(null, { status: 303, headers });
    } catch (err) {
      const message = err instanceof ApiError
        ? (err.status === 401 ? "Invalid username or password." : err.message)
        : "Login failed. Is the API reachable?";
      return page<Data>({ error: message, next, username });
    }
  },
});

export default define.page<typeof handler>(({ data }) => {
  return (
    <div class="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div class="w-full max-w-sm">
        <div class="mb-6 text-center">
          <div class="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-brand-600 font-bold text-white">
            OR
          </div>
          <h1 class="text-xl font-bold text-slate-900">
            Sign in to OpenReturn
          </h1>
          <p class="mt-1 text-sm text-slate-500">
            Access organizations, scores, and reports.
          </p>
        </div>
        <form method="POST" class="card card-pad space-y-4">
          {data.error && <ErrorAlert message={data.error} />}
          <input type="hidden" name="next" value={data.next} />
          <div>
            <label class="label" for="username">Username</label>
            <input
              class="input"
              id="username"
              name="username"
              type="text"
              autocomplete="username"
              value={data.username ?? ""}
              required
            />
          </div>
          <div>
            <label class="label" for="password">Password</label>
            <input
              class="input"
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <button type="submit" class="btn btn-primary w-full">Sign in</button>
        </form>
        <p class="mt-4 text-center text-xs text-slate-400">
          Accounts are managed by an administrator.
        </p>
      </div>
    </div>
  );
});
