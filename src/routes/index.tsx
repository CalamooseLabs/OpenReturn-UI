import { define } from "../utils.ts";
import { page } from "fresh";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/templates.tsx";
import { FilterChip, KpiCard } from "../components/molecules.tsx";
import {
  DashboardApiError,
  DashboardHeader,
  DimensionBars,
  type DimensionRow,
  type DistributionBucket,
  LandingHero,
  NeedsReviewTable,
  type QuickLink,
  QuickLinks,
  type ReviewRow,
  ScoreDistribution,
  Watchlist,
} from "../components/organisms/Dashboard.tsx";
import { scoreBand, to100 } from "../lib/score.ts";
import { pickOverallModel } from "../lib/models.ts";
import type { LeaderboardRow, OrgSummary } from "../lib/types.ts";

interface Data {
  loggedIn: boolean;
  orgTotal?: number;
  modelCount?: number;
  following: OrgSummary[];
  leaderboard: LeaderboardRow[];
  overallVersion?: string;
  /** "nonprofit" | "foundation" — the type the page is scoped to. */
  orgType: string;
  apiError?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const principal = ctx.state.principal;
    const orgType = ctx.url.searchParams.get("type") === "foundation"
      ? "foundation"
      : "nonprofit";
    if (!principal) {
      return page<Data>({
        loggedIn: false,
        following: [],
        leaderboard: [],
        orgType,
      });
    }

    const api = ctx.state.api;
    const results = await Promise.allSettled([
      api.orgs.list({ limit: 1, type: orgType }),
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

    // The "overall" model depends on the active type: the super-composite for
    // nonprofits (v30), the foundation-stewardship model for foundations (v40).
    const overallVersion = await pickOverallModel(api, orgType).catch((e) => {
      bubble401(e);
      return orgType === "foundation" ? "40" : "30";
    });

    // Portfolio stats are derived from a slice of the leaderboard for that model,
    // scoped to the active org type.
    const lbRes = overallVersion !== undefined
      ? await api.scores
        .leaderboard({ model: overallVersion, type: orgType, limit: 50 })
        .catch((e) => {
          bubble401(e);
          return undefined;
        })
      : undefined;
    const leaderboard = lbRes?.leaderboard ?? [];

    const apiError = results.every((r) => r.status === "rejected")
      ? "Could not reach the OpenReturn API."
      : undefined;

    return page<Data>({
      loggedIn: true,
      orgTotal: orgs?.total,
      modelCount: tpl?.templates?.length,
      following: follows?.organizations ?? [],
      leaderboard,
      overallVersion,
      orgType,
      apiError,
    });
  },
});

const QUICK_LINKS: QuickLink[] = [
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

function buildBuckets(scores: number[]): DistributionBucket[] {
  const counts = [0, 0, 0, 0, 0]; // <60, 60-69, 70-79, 80-89, 90+
  for (const s of scores) {
    if (s >= 90) counts[4]++;
    else if (s >= 80) counts[3]++;
    else if (s >= 70) counts[2]++;
    else if (s >= 60) counts[1]++;
    else counts[0]++;
  }
  // Representative score per bucket → band colour (clay for the two low buckets).
  return [
    { label: "<60", count: counts[0], color: scoreBand(50).hex },
    { label: "60–69", count: counts[1], color: scoreBand(65).hex },
    { label: "70–79", count: counts[2], color: scoreBand(75).hex },
    { label: "80–89", count: counts[3], color: scoreBand(85).hex },
    { label: "90+", count: counts[4], color: scoreBand(95).hex },
  ];
}

// Sample deltas/flags for the "Needs review" table & dimension averages —
// our API does not yet expose YoY deltas or pillar-level portfolio aggregates.
// TODO: wire to API (per-org score history for Δ; per-type leaderboards for pillars).
const SAMPLE_DELTAS = [-4, -2, -6, -3, -5, -1, -7, -2];
const SAMPLE_FLAGS = [
  "Financial",
  "Leadership",
  "Financial",
  "Governance",
  "Mission",
];

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  // ---- Signed-out landing (restyled navy) ----------------------------------
  if (!data.loggedIn) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <LandingHero />
        <QuickLinks links={QUICK_LINKS} />
      </Layout>
    );
  }

  // ---- Signed-in dashboard --------------------------------------------------
  const scores100 = data.leaderboard
    .map((r) => to100(r.total_score))
    .filter((v): v is number => v !== null);

  const trackedCount = data.orgTotal ?? data.leaderboard.length;
  const followCount = data.following.length;

  const avgScore = scores100.length
    ? Math.round(scores100.reduce((a, b) => a + b, 0) / scores100.length)
    : null;
  const needReview = scores100.filter((s) => s < 70).length;
  const buckets = buildBuckets(scores100);

  // Orgs scoring <70, worst first, for the "Needs review" table.
  const reviewRows: ReviewRow[] = data.leaderboard
    .map((r) => ({ row: r, s: to100(r.total_score) }))
    .filter((x): x is { row: LeaderboardRow; s: number } =>
      x.s !== null && x.s < 70
    )
    .sort((a, b) => a.s - b.s)
    .slice(0, 6)
    .map(({ row, s }, i) => ({
      ein: row.ein,
      name: row.name,
      score: s,
      delta: SAMPLE_DELTAS[i % SAMPLE_DELTAS.length],
      flag: SAMPLE_FLAGS[i % SAMPLE_FLAGS.length],
    }));

  // Pillar averages map to model TYPES. We currently surface financial-type
  // data; other pillars render muted "Pending". The Financial bar uses the
  // real portfolio average; the rest are sample stand-ins.
  // TODO: wire to API — per-type leaderboard averages.
  const financialAvg = avgScore;
  const dimensions: DimensionRow[] = [
    { label: "Financial Health", value: financialAvg, pending: false },
    { label: "Whole-Person Impact", value: 84, pending: true },
    { label: "Leadership", value: 76, pending: true },
    { label: "Christ-Centered & Mission", value: 88, pending: true },
  ];

  const updatedHeading = "Dashboard";

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {data.apiError && <DashboardApiError message={data.apiError} />}

      <DashboardHeader
        heading={updatedHeading}
        trackedCount={trackedCount}
        followCount={followCount}
      />

      {/* Org-type toggle: re-scope the portfolio to non-profits or foundations. */}
      <div class="mb-6 flex gap-2">
        <FilterChip
          href="/?type=nonprofit"
          label="Non-Profits"
          active={data.orgType !== "foundation"}
        />
        <FilterChip
          href="/?type=foundation"
          label="Foundations"
          active={data.orgType === "foundation"}
        />
      </div>

      {/* KPI row */}
      <div
        class="mb-6 grid gap-4"
        style={{ gridTemplateColumns: "repeat(4,1fr)" }}
      >
        <KpiCard
          label="Avg. portfolio score"
          value={avgScore !== null ? String(avgScore) : "—"}
          delta={avgScore !== null ? "▲ +2.4" : undefined}
          sub="across the scored portfolio"
        />
        <KpiCard
          label="Organizations tracked"
          value={trackedCount.toLocaleString()}
          sub={`${followCount} on your watchlist`}
        />
        <KpiCard
          label="Combined revenue"
          // TODO: wire to API — sum of canonical revenue across the portfolio.
          value="—"
          sub="reported (pending)"
        />
        <KpiCard
          label="Need review"
          value={String(needReview)}
          valueColor="#b5762a"
          sub="scoring below 70"
        />
      </div>

      {/* Main grid: distribution + dimensions */}
      <div
        class="mb-5 grid gap-5"
        style={{ gridTemplateColumns: "1.55fr 1fr" }}
      >
        <ScoreDistribution buckets={buckets} />
        <DimensionBars dimensions={dimensions} />
      </div>

      {/* Second grid: needs-review table + watchlist */}
      <div class="grid gap-5" style={{ gridTemplateColumns: "1.55fr 1fr" }}>
        <NeedsReviewTable rows={reviewRows} />
        <Watchlist following={data.following} />
      </div>
    </Layout>
  );
});
