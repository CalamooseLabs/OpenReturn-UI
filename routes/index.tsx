import { define } from "../utils.ts";
import { page } from "fresh";
import type { ComponentChildren } from "preact";
import { ApiError } from "../lib/api/mod.ts";
import { Layout } from "../components/Layout.tsx";
import { GradePill } from "../components/score.tsx";
import { letterGrade, scoreBand, to100 } from "../lib/score.ts";
import { formatEin, titleCase } from "../lib/format.ts";
import type { LeaderboardRow, OrgSummary } from "../lib/types.ts";

interface Data {
  loggedIn: boolean;
  orgTotal?: number;
  modelCount?: number;
  following: OrgSummary[];
  leaderboard: LeaderboardRow[];
  overallVersion?: number;
  apiError?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const principal = ctx.state.principal;
    if (!principal) {
      return page<Data>({ loggedIn: false, following: [], leaderboard: [] });
    }

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

    // Overall score for an org is the highest model version (the super-composite).
    // Derive it from the template catalog; fall back to 30 (the org-profile default).
    const templateVersions = tpl?.templates
      ?.map((t) => t.version)
      .filter((v): v is number => typeof v === "number") ?? [];
    const overallVersion = templateVersions.length
      ? Math.max(...templateVersions)
      : 30;

    // Portfolio stats are derived from a slice of the leaderboard for that model.
    const lbRes = await api.scores
      .leaderboard({ model: overallVersion, limit: 50 })
      .catch((e) => {
        bubble401(e);
        return undefined;
      });
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

/** A single KPI tile (big Bricolage number + optional delta + sub-line). */
function Kpi(props: {
  label: string;
  value: string;
  valueColor?: string;
  delta?: string;
  deltaColor?: string;
  sub: string;
}) {
  return (
    <div
      class="bg-surface"
      style={{
        border: "1px solid #dde2ec",
        borderRadius: "16px",
        padding: "20px",
        boxShadow: "0 1px 2px rgba(25,42,84,.04)",
      }}
    >
      <div
        style={{ fontSize: "12.5px", color: "#8893ab", marginBottom: "12px" }}
      >
        {props.label}
      </div>
      <div class="flex items-end gap-2">
        <span
          class="font-display font-bold"
          style={{
            fontSize: "36px",
            lineHeight: "0.9",
            letterSpacing: "-0.02em",
            color: props.valueColor ?? "#192A54",
          }}
        >
          {props.value}
        </span>
        {props.delta && (
          <span
            class="font-semibold"
            style={{
              fontSize: "13px",
              color: props.deltaColor ?? "#2f7d5b",
              marginBottom: "5px",
            }}
          >
            {props.delta}
          </span>
        )}
      </div>
      <div style={{ fontSize: "12px", color: "#9aa3b5", marginTop: "8px" }}>
        {props.sub}
      </div>
    </div>
  );
}

/** Shared card wrapper for the lower panels (18px radius, navy heading). */
function Panel(props: {
  title: string;
  action?: { href: string; label: string };
  legend?: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div
      class="bg-surface"
      style={{
        border: "1px solid #dde2ec",
        borderRadius: "18px",
        padding: "24px",
        boxShadow: "0 1px 2px rgba(25,42,84,.04)",
      }}
    >
      <div class="mb-5 flex items-center justify-between gap-3">
        <h2
          class="font-display font-bold"
          style={{
            fontSize: "17px",
            letterSpacing: "-0.01em",
            color: "#192A54",
            margin: 0,
          }}
        >
          {props.title}
        </h2>
        {props.action && (
          <a
            href={props.action.href}
            class="font-semibold no-underline"
            style={{ fontSize: "13px", color: "#3a5da8" }}
          >
            {props.action.label}
          </a>
        )}
        {props.legend}
      </div>
      {props.children}
    </div>
  );
}

interface Bucket {
  label: string;
  count: number;
  /** Band hex for the bar fill. */
  color: string;
}

function buildBuckets(scores: number[]): Bucket[] {
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

interface Dimension {
  label: string;
  value: number | null;
  pending: boolean;
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  // ---- Signed-out landing (restyled navy) ----------------------------------
  if (!data.loggedIn) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <div class="py-12 text-center">
          <div class="section-title mb-3">Nonprofit financial health</div>
          <h1
            class="font-display font-bold"
            style={{
              fontSize: "44px",
              lineHeight: "1.05",
              letterSpacing: "-0.03em",
              color: "#192A54",
              margin: 0,
            }}
          >
            Explore the integrity behind the numbers
          </h1>
          <p
            class="mx-auto mt-4 max-w-2xl text-muted"
            style={{ fontSize: "16px" }}
          >
            OpenReturn turns IRS Form 990 filings into searchable organizations,
            multi-year financial-health scores, and rankings.
          </p>
          <form
            method="GET"
            action="/search"
            class="mx-auto mt-7 flex max-w-xl gap-2"
          >
            <input
              class="input"
              type="text"
              name="q"
              placeholder="Search organizations by name or EIN…"
              autofocus
            />
            <button type="submit" class="btn btn-primary">Search</button>
          </form>
          <div class="mt-5">
            <a href="/login" class="btn btn-primary">Sign in</a>
          </div>
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((l) => (
            <a href={l.href} class="card card-pad card-hover">
              <h3
                class="font-display font-bold"
                style={{ fontSize: "17px", color: "#192A54", margin: 0 }}
              >
                {l.title}
              </h3>
              <p class="mt-1 text-sm text-muted">{l.desc}</p>
            </a>
          ))}
        </div>
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
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  // Orgs scoring <70, worst first, for the "Needs review" table.
  const reviewRows = data.leaderboard
    .map((r) => ({ row: r, s: to100(r.total_score) }))
    .filter((x): x is { row: LeaderboardRow; s: number } =>
      x.s !== null && x.s < 70
    )
    .sort((a, b) => a.s - b.s)
    .slice(0, 6);

  // Pillar averages map to model TYPES. We currently surface financial-type
  // data; other pillars render muted "Pending". The Financial bar uses the
  // real portfolio average; the rest are sample stand-ins.
  // TODO: wire to API — per-type leaderboard averages.
  const financialAvg = avgScore;
  const dimensions: Dimension[] = [
    { label: "Financial Health", value: financialAvg, pending: false },
    { label: "Whole-Person Impact", value: 84, pending: true },
    { label: "Leadership", value: 76, pending: true },
    { label: "Christ-Centered & Mission", value: 88, pending: true },
  ];

  const updatedHeading = "Dashboard";

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {data.apiError && (
        <div
          class="mb-6 rounded-md border px-4 py-3 text-sm"
          style={{
            borderColor: "#dde2ec",
            background: "#f1f3f8",
            color: "#6b7488",
          }}
        >
          {data.apiError}
        </div>
      )}

      {/* Header */}
      <div class="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div class="section-title" style={{ marginBottom: "9px" }}>
            Portfolio Overview
          </div>
          <h1
            class="font-display font-bold"
            style={{
              fontSize: "34px",
              lineHeight: "1.05",
              letterSpacing: "-0.025em",
              color: "#192A54",
              margin: 0,
            }}
          >
            {updatedHeading}
          </h1>
          <p style={{ fontSize: "15px", color: "#6b7488", margin: "8px 0 0" }}>
            Tracking{" "}
            <strong style={{ color: "#2a2f3a", fontWeight: 600 }}>
              {trackedCount.toLocaleString()} organizations
            </strong>{" "}
            · {followCount} on your watchlist
          </p>
        </div>
        <div class="flex gap-2.5">
          <a href="/reports" class="btn btn-secondary">Export portfolio</a>
          <a href="/search" class="btn btn-primary">+ Add organization</a>
        </div>
      </div>

      {/* KPI row */}
      <div
        class="mb-6 grid gap-4"
        style={{ gridTemplateColumns: "repeat(4,1fr)" }}
      >
        <Kpi
          label="Avg. portfolio score"
          value={avgScore !== null ? String(avgScore) : "—"}
          delta={avgScore !== null ? "▲ +2.4" : undefined}
          sub="across the scored portfolio"
        />
        <Kpi
          label="Organizations tracked"
          value={trackedCount.toLocaleString()}
          sub={`${followCount} on your watchlist`}
        />
        <Kpi
          label="Combined revenue"
          // TODO: wire to API — sum of canonical revenue across the portfolio.
          value="—"
          sub="reported (pending)"
        />
        <Kpi
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
        {/* Score distribution */}
        <Panel
          title="Score distribution"
          legend={
            <div
              class="flex gap-3.5"
              style={{ fontSize: "11.5px", color: "#6b7488" }}
            >
              {[
                { c: scoreBand(95).hex, t: "A (90+)" },
                { c: scoreBand(85).hex, t: "B (80–89)" },
                { c: scoreBand(75).hex, t: "C (70–79)" },
                { c: scoreBand(50).hex, t: "<70" },
              ].map((l) => (
                <span class="inline-flex items-center gap-1.5">
                  <span
                    style={{
                      width: "9px",
                      height: "9px",
                      borderRadius: "2px",
                      background: l.c,
                    }}
                  />
                  {l.t}
                </span>
              ))}
            </div>
          }
        >
          {scores100.length === 0
            ? (
              <div
                class="flex items-center justify-center text-muted"
                style={{ height: "200px", fontSize: "13.5px" }}
              >
                No scored organizations in the portfolio yet.
              </div>
            )
            : (
              <div
                class="flex items-end gap-3.5"
                style={{
                  height: "200px",
                  borderBottom: "1px solid #eef1f6",
                }}
              >
                {buckets.map((b) => {
                  const h = b.count === 0
                    ? 4
                    : Math.round((b.count / maxCount) * 168);
                  return (
                    <div
                      class="flex flex-1 flex-col items-center justify-end gap-2"
                      style={{ height: "100%" }}
                    >
                      <span
                        class="mono font-semibold"
                        style={{ fontSize: "12px", color: "#6b7488" }}
                      >
                        {b.count}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: "46px",
                          height: `${h}px`,
                          background: b.color,
                          borderRadius: "5px 5px 0 0",
                        }}
                      />
                      <span
                        class="mono"
                        style={{ fontSize: "10.5px", color: "#9aa3b5" }}
                      >
                        {b.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
        </Panel>

        {/* Avg. by dimension */}
        <Panel title="Avg. by dimension">
          <div class="flex flex-col gap-4">
            {dimensions.map((d) => {
              const v = d.value;
              const has = v !== null;
              const band = has ? scoreBand(v) : null;
              return (
                <div>
                  <div
                    class="mb-1.5 flex items-center justify-between"
                    style={{ fontSize: "13px" }}
                  >
                    <span style={{ color: "#3a4150", fontWeight: 500 }}>
                      {d.label}
                    </span>
                    <span class="flex items-center gap-2">
                      {d.pending && (
                        <span
                          class="mono uppercase"
                          style={{
                            fontSize: "9.5px",
                            letterSpacing: ".1em",
                            color: "#aeb6c7",
                          }}
                        >
                          Pending
                        </span>
                      )}
                      <span
                        class="mono font-semibold"
                        style={{ color: has ? "#192A54" : "#aeb6c7" }}
                      >
                        {has ? v : "—"}
                      </span>
                    </span>
                  </div>
                  <div
                    style={{
                      height: "8px",
                      borderRadius: "999px",
                      background: "#e7ebf2",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: has ? `${Math.max(0, Math.min(100, v))}%` : "0%",
                        background: band?.hex ?? "transparent",
                        borderRadius: "999px",
                        opacity: d.pending ? 0.4 : 1,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: "22px",
              borderTop: "1px solid #eef1f6",
              paddingTop: "16px",
              fontSize: "12.5px",
              color: "#9aa3b5",
              lineHeight: "1.5",
            }}
          >
            {
              /* TODO: wire to API — pillar models (whole_person / leadership /
                christ_centered) are not yet populated; only the financial
                dimension reflects live portfolio data. */
            }
            Only the financial dimension reflects live data today; the
            whole-person, leadership, and mission pillars are pending model
            coverage.
          </div>
        </Panel>
      </div>

      {/* Second grid: needs-review table + watchlist */}
      <div class="grid gap-5" style={{ gridTemplateColumns: "1.55fr 1fr" }}>
        {/* Needs review */}
        <Panel
          title="Needs review"
          action={{ href: "/reports", label: "View all →" }}
        >
          <div
            class="grid gap-2.5"
            style={{
              gridTemplateColumns: "2.4fr 1fr 1fr 1.1fr",
              padding: "12px 0",
              borderBottom: "1px solid #eef1f6",
            }}
          >
            {["Organization", "Score", "Δ YoY", "Flag"].map((h, i) => (
              <span
                class="mono uppercase"
                style={{
                  fontSize: "10.5px",
                  letterSpacing: ".08em",
                  color: "#aeb6c7",
                  textAlign: i === 0 ? "left" : "right",
                }}
              >
                {h}
              </span>
            ))}
          </div>
          {reviewRows.length === 0
            ? (
              <div
                class="text-muted"
                style={{ padding: "22px 0", fontSize: "13.5px" }}
              >
                No organizations are below the review threshold. 🎉
              </div>
            )
            : (
              reviewRows.map(({ row, s }, i) => {
                const band = scoreBand(s);
                const delta = SAMPLE_DELTAS[i % SAMPLE_DELTAS.length];
                const flag = SAMPLE_FLAGS[i % SAMPLE_FLAGS.length];
                return (
                  <a
                    href={`/orgs/${row.ein}`}
                    class="grid items-center no-underline"
                    style={{
                      gridTemplateColumns: "2.4fr 1fr 1fr 1.1fr",
                      gap: "10px",
                      padding: "13px 0",
                      borderBottom: i < reviewRows.length - 1
                        ? "1px solid #f3f5f9"
                        : "none",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "13.5px",
                          fontWeight: 600,
                          color: "#192A54",
                        }}
                      >
                        {titleCase(row.name)}
                      </div>
                      <div
                        class="mono"
                        style={{
                          fontSize: "11.5px",
                          color: "#9aa3b5",
                          marginTop: "2px",
                        }}
                      >
                        EIN {formatEin(row.ein)}
                      </div>
                    </div>
                    <div class="flex items-center justify-end gap-2">
                      <span
                        class="mono font-semibold"
                        style={{ fontSize: "14px", color: "#2a2f3a" }}
                      >
                        {s}
                      </span>
                      <GradePill value={s} band={band} />
                    </div>
                    {/* TODO: wire to API — real YoY delta from score history. */}
                    <div
                      class="mono font-semibold"
                      style={{
                        textAlign: "right",
                        fontSize: "13px",
                        color: "#bf6a3e",
                      }}
                    >
                      ▼ {delta}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          fontSize: "11.5px",
                          fontWeight: 600,
                          color: "#9a6a1c",
                          background: "#f6ecd8",
                          borderRadius: "6px",
                          padding: "3px 8px",
                        }}
                      >
                        {flag}
                      </span>
                    </div>
                  </a>
                );
              })
            )}
        </Panel>

        {/* Your watchlist */}
        <Panel
          title="Your watchlist"
          action={{ href: "/search", label: "Find more →" }}
        >
          {data.following.length === 0
            ? (
              <div
                class="text-muted"
                style={{
                  padding: "8px 0",
                  fontSize: "13.5px",
                  lineHeight: "1.5",
                }}
              >
                You're not following any organizations yet. Follow orgs from
                their profile to track them here.
                <div class="mt-3">
                  <a href="/search" class="btn btn-primary btn-sm">
                    Browse organizations
                  </a>
                </div>
              </div>
            )
            : (
              <div class="flex flex-col" style={{ gap: "2px" }}>
                {data.following.slice(0, 6).map((o, i) => (
                  <a
                    href={`/orgs/${o.ein}`}
                    class="flex items-start gap-3 no-underline"
                    style={{
                      padding: "11px 0",
                      borderBottom: i < Math.min(5, data.following.length - 1)
                        ? "1px solid #f3f5f9"
                        : "none",
                    }}
                  >
                    <div
                      class="flex shrink-0 items-center justify-center font-semibold"
                      style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "8px",
                        background: "#192A54",
                        color: "#eef1f7",
                        fontSize: "11px",
                      }}
                    >
                      {(o.name ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: "13.5px",
                          fontWeight: 600,
                          color: "#192A54",
                          lineHeight: "1.35",
                        }}
                      >
                        {titleCase(o.name)}
                      </div>
                      <div
                        class="mono"
                        style={{
                          fontSize: "11.5px",
                          color: "#9aa3b5",
                          marginTop: "3px",
                        }}
                      >
                        {o.org_type
                          ? titleCase(o.org_type)
                          : "EIN " + formatEin(o.ein)}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          {/* Letter-grade key footnote so the band legend is explained once. */}
          <div
            style={{
              marginTop: "18px",
              borderTop: "1px solid #eef1f6",
              paddingTop: "14px",
              fontSize: "11.5px",
              color: "#9aa3b5",
            }}
          >
            Grades: {letterGrade(95)} ≥90 · {letterGrade(85)} 80–89 ·{" "}
            {letterGrade(75)} 70–79 · {letterGrade(50)} below 70.
          </div>
        </Panel>
      </div>
    </Layout>
  );
});
