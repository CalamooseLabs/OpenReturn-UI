# OpenReturn UI

Web frontend for the [OpenReturn](../OpenReturn) IRS Form 990 API. Built with
**Deno + [Fresh 2](https://usefresh.dev)** (Vite) + **Preact** + **Tailwind
v4**.

It renders pages server-side and calls the OpenReturn API from the server (a
BFF), so the API session token lives in an httpOnly cookie and never reaches the
browser. Works against a backend running with or without `--auth`.

## Quick start

```bash
direnv allow              # or: nix develop   (provides deno + helper commands)
deno task dev             # Fresh dev server with hot reload → http://localhost:8000
```

Point it at your API with `OPENRETURN_API_URL` (default
`http://localhost:8080`):

```bash
OPENRETURN_API_URL=http://localhost:8080 deno task dev
```

The dev shell also exposes shortcuts: `dev`, `build`, `serve`, `check`.

## Configuration (environment)

| Variable                                    | Default                 | Purpose                                                                   |
| ------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `OPENRETURN_API_URL`                        | `http://localhost:8080` | Base URL of the OpenReturn API (called server-side).                      |
| `COOKIE_SECURE`                             | `false`                 | Set `true` when served over HTTPS so the session cookie carries `Secure`. |
| `OPENRETURN_UI_PORT` / `OPENRETURN_UI_HOST` | `8000` / `0.0.0.0`      | Bind for the production launcher (`bin/openreturn-ui`).                   |

## Pages

| Route                     | What it does                                                                     | Key API calls                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/login`, `/logout`       | Session auth (sets/clears the cookie)                                            | `POST /auth/login`, `/auth/me`, `/auth/logout`                                                           |
| `/`                       | Dashboard: quick search, watchlist, stats                                        | `/organizations`, `/follows`, `/templates`                                                               |
| `/search`                 | Filterable org search (name/EIN/state/city/sector/type/grantmaker)               | `/organizations/search`, `/organizations/{sectors,states}`                                               |
| `/orgs/{ein}`             | Org detail: score history, ranking, financials, grants, filings; follow/unfollow | `/organizations/full`, `/scores/{history,ranking}`, `/financials`, `/organizations/grants`, `/follows/*` |
| `/reports`                | Leaderboards & rankings by model, with subset filters; **export to PDF / CSV**   | `/scores/leaderboard`                                                                                    |
| `/models`                 | Model catalog, factor inspector, and an admin model builder                      | `/templates`, `/scores/factors`, `/admin/models`                                                         |
| `/compare`                | One org across models, or orgs head-to-head                                      | `/scores/compare`, `/scores/history`                                                                     |
| `/lists`, `/lists/{id}`   | Static/smart organization lists + members                                        | `/lists`, `/lists/detail`, `/lists/members/*`                                                            |
| `/people`, `/people/{id}` | People CRM + org memberships                                                     | `/people`, `/people/detail`, `/people/membership/*`                                                      |
| `/tags`                   | Tag browser; apply/remove tags on orgs                                           | `/tags`, `/tags/organizations`, `/tags/remove`                                                           |
| `/financials`             | Financial-fact stewardship: resolve source conflicts                             | `/financials`, `/financials/conflicts`, `/financials/canonical`                                          |
| `/upload`                 | Bulk ZIP of 990 XML + OCR a single 990 PDF (`upload:write`)                      | `POST /upload`, `POST /upload/pdf`                                                                       |
| `/admin`, `/admin/roles`  | User, role & permission administration (`user:admin`)                            | `/admin/users`, `/admin/roles`, `/admin/permissions`                                                     |

Page links adapt to the caller's permissions: the **Data** menu (Lists, People,
Tags, Financials, and Upload when `upload:write`) and **Admin** appear only when
relevant. The API remains the real enforcer.

### Report export

The `/reports` leaderboard can be exported as a downloadable file:
`GET /reports/export?format=pdf|csv&…filters` pulls the full ranked result from
the API (all pages) and the BFF transforms it into a **PDF** (default, via
`pdf-lib` — a titled, paginated table with the applied filters and date) or a
**CSV**. The export buttons on the page carry the current filters.

## Build & production

```bash
deno task build           # Vite build → ./_fresh
deno task start           # deno serve -A _fresh/server.js
deno task check           # deno fmt --check + lint + type-check
deno task test            # build + run the test suite
deno task test:cov        # build + tests + coverage report
```

The `bin/openreturn-ui` launcher (from the Nix package) syncs the app into a
writable work dir, builds once, and serves — used by the NixOS module.

## Testing

Hermetic, offline tests (no real backend). Run `deno task test` (the dev shell
also exposes `test`).

- **Unit tests** exercise the `lib/` layer directly: `format`, `auth`, `session`
  (cookies), `export` (CSV escaping + PDF bytes), the low-level `request()`
  (URL/query/error handling via a stubbed `fetch`), every API resource class
  (right path/method/body), and `models` discovery.
- **Route/integration tests** drive the **built** server (`_fresh/server.js`)
  through `tests/app.ts`'s `appRequest()` helper with a **stubbed backend**
  (`globalThis.fetch` returns canned API JSON), asserting status, rendered HTML,
  redirects, cookies, and the PDF/CSV downloads — covering auth, every page, and
  the mutations. The `test` task builds first so the bundle matches the source.

## Project structure

```
main.ts            App() + middleware (session load, bind ctx.state.api, 401→/login) + fsRoutes
utils.ts           define = createDefine<State>()  (State: sessionKey, principal, api)
client.ts          imports assets/styles.css (Tailwind)
vite.config.ts     Fresh + Tailwind Vite plugins
lib/
  api/             class-based API client (mirrors the backend's db.<concern>):
    client.ts        request() + ApiError + the ApiResource base class
    mod.ts           Api coordinator (new Api(token) → .orgs/.scores/.people/…)
    orgs.ts scores.ts people.ts tags.ts lists.ts financials.ts
    follows.ts templates.ts admin.ts upload.ts auth.ts   (one resource each)
  session.ts       httpOnly session + cached-principal cookies
  auth.ts          permission helpers (can / isAdmin)
  models.ts        model-picker discovery (/admin/models | /templates)
  export.ts        report CSV + PDF (pdf-lib) generation
  format.ts        money / score% / EIN formatting
  types.ts         shared response interfaces
components/        Layout, Nav, ui.tsx (Card, Table, Badge, ScoreBar, …)
routes/            pages + _app/_404/_error
tests/             unit + hermetic route/integration tests
```

## NixOS module

`flake.nix` exposes `nixosModules.default`. Example:

```nix
{
  inputs.openreturn-ui.url = "path:/path/to/OpenReturn-UI";

  # in your configuration:
  imports = [ inputs.openreturn-ui.nixosModules.default ];
  services.openreturn-ui = {
    enable = true;
    port = 8000;
    apiUrl = "http://localhost:8080";   # the OpenReturn API
    cookieSecure = true;                # serving over HTTPS (default)
  };
}
```

The service builds the app once into its state directory
(`/var/lib/openreturn-ui`, needs network on first start), caches the Deno deps
there, and serves it under a hardened systemd unit (dedicated user,
`ProtectSystem=strict`, firewall opened for the port). Redeploys rebuild
automatically when the package changes.
