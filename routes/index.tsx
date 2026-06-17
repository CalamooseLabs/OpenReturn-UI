import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import {
  Badge,
  EmptyState,
  InfoAlert,
  LinkButton,
  Stat,
} from "../components/ui.tsx";
import { formatEin, titleCase } from "../lib/format.ts";
import type { OrgSummary } from "../lib/types.ts";

interface Data {
  loggedIn: boolean;
  orgTotal?: number;
  modelCount?: number;
  following: OrgSummary[];
  apiError?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const principal = ctx.state.principal;
    if (!principal) return page<Data>({ loggedIn: false, following: [] });

    const api = ctx.state.api;
    const results = await Promise.allSettled([
      api.orgs.list({ limit: 1 }),
      api.templates.list(),
      api.follows.list(),
    ]);
    for (const r of results) if (r.status === "rejected") bubble401(r.reason);

    const orgs = results[0].status === "fulfilled"
      ? results[0].value
      : undefined;
    const tpl = results[1].status === "fulfilled"
      ? results[1].value
      : undefined;
    const follows = results[2].status === "fulfilled"
      ? results[2].value
      : undefined;
    const apiError = results.every((r) => r.status === "rejected")
      ? "Could not reach the OpenReturn API."
      : undefined;

    return page<Data>({
      loggedIn: true,
      orgTotal: orgs?.total,
      modelCount: tpl?.templates?.length,
      following: follows?.organizations ?? [],
      apiError,
    });
  },
});

const QUICK_LINKS = [
  {
    href: "/search",
    title: "Search organizations",
    desc: "Find nonprofits & foundations by name, EIN, sector, or region.",
  },
  {
    href: "/reports",
    title: "Leaderboards & rankings",
    desc: "Rank organizations by any scoring model, globally or by subset.",
  },
  {
    href: "/models",
    title: "Scoring models",
    desc: "Browse the model catalog and factor definitions.",
  },
  {
    href: "/compare",
    title: "Compare",
    desc: "Compare an organization across every model, or orgs head-to-head.",
  },
];

function SearchBox() {
  return (
    <form method="GET" action="/search" class="flex gap-2">
      <input
        class="input"
        type="text"
        name="q"
        placeholder="Search organizations by name or EIN…"
        autofocus
      />
      <button type="submit" class="btn btn-primary">Search</button>
    </form>
  );
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  if (!data.loggedIn) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <div class="py-10 text-center">
          <h1 class="text-4xl font-bold tracking-tight text-slate-900">
            Explore nonprofit financial health
          </h1>
          <p class="mx-auto mt-3 max-w-2xl text-slate-500">
            OpenReturn turns IRS Form 990 filings into searchable organizations,
            multi-year financial-health scores, and rankings.
          </p>
          <div class="mx-auto mt-6 max-w-xl">
            <SearchBox />
          </div>
          <div class="mt-4">
            <LinkButton href="/login" variant="primary">Sign in</LinkButton>
          </div>
        </div>
        <div class="mt-8 grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((l) => (
            <a
              href={l.href}
              class="card card-pad transition-shadow hover:shadow-md"
            >
              <h3 class="font-semibold text-slate-900">{l.title}</h3>
              <p class="mt-1 text-sm text-slate-500">{l.desc}</p>
            </a>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout principal={state.principal} path={ctx.url.pathname}>
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p class="mt-1 text-sm text-slate-500">
          Welcome back, {state.principal?.user?.username ?? "there"}.
        </p>
      </div>

      {data.apiError && (
        <div class="mb-6">
          <InfoAlert>{data.apiError}</InfoAlert>
        </div>
      )}

      <div class="mb-6">
        <SearchBox />
      </div>

      <div class="mb-8 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Organizations"
          value={data.orgTotal?.toLocaleString() ?? "—"}
        />
        <Stat label="Following" value={data.following.length} />
        <Stat label="Model templates" value={data.modelCount ?? "—"} />
      </div>

      <section class="mb-8">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="section-title">Your watchlist</h2>
          <a href="/search" class="link text-sm">Find more →</a>
        </div>
        {data.following.length === 0
          ? (
            <EmptyState
              title="No followed organizations yet"
              hint="Follow organizations from their detail page to track them here."
            >
              <LinkButton href="/search" variant="primary">
                Browse organizations
              </LinkButton>
            </EmptyState>
          )
          : (
            <div class="grid gap-3 sm:grid-cols-2">
              {data.following.map((o) => (
                <a
                  href={`/orgs/${o.ein}`}
                  class="card card-pad transition-shadow hover:shadow-md"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="font-medium text-slate-900">{o.name}</span>
                    {o.org_type && (
                      <Badge variant="blue">{titleCase(o.org_type)}</Badge>
                    )}
                  </div>
                  <div class="mt-1 text-xs text-slate-400">
                    EIN {formatEin(o.ein)}
                  </div>
                </a>
              ))}
            </div>
          )}
      </section>

      <div class="grid gap-4 sm:grid-cols-2">
        {QUICK_LINKS.map((l) => (
          <a
            href={l.href}
            class="card card-pad transition-shadow hover:shadow-md"
          >
            <h3 class="font-semibold text-slate-900">{l.title}</h3>
            <p class="mt-1 text-sm text-slate-500">{l.desc}</p>
          </a>
        ))}
      </div>
    </Layout>
  );
});
