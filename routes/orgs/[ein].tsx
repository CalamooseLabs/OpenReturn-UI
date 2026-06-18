import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/Layout.tsx";
import { EmptyState, ErrorAlert, LinkButton } from "../../components/ui.tsx";
import { GaugeRing } from "../../components/score.tsx";
import { formatEin, money, titleCase } from "../../lib/format.ts";
import { letterGrade, ordinal, scoreBand, to100 } from "../../lib/score.ts";
import type {
  FinancialFact,
  ModelSummary,
  OrgFull,
  Person,
  RankCell,
  ScoreHistoryRow,
  ScoreRow,
} from "../../lib/types.ts";

interface GrantSummary {
  grant_count: number;
  total_amount: number;
  counterparties: number;
}

interface Data {
  ein: string;
  org?: OrgFull;
  notFound?: boolean;
  error?: string;
  overallVersion?: number;
  scores: ScoreRow[];
  history: ScoreHistoryRow[];
  ranking: Record<string, RankCell | null>;
  facts: FinancialFact[];
  factsYear?: number;
  models: ModelSummary[];
  people: Person[];
  grantsMade?: GrantSummary;
  grantsReceived?: GrantSummary;
}

function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    const api = ctx.state.api;

    let org: OrgFull;
    try {
      org = await api.orgs.full(ein);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      if (err instanceof ApiError && err.status === 404) {
        return page<Data>({
          ein,
          notFound: true,
          scores: [],
          history: [],
          ranking: {},
          facts: [],
          models: [],
          people: [],
        });
      }
      return page<Data>({
        ein,
        error: err instanceof Error
          ? err.message
          : "Failed to load organization.",
        scores: [],
        history: [],
        ranking: {},
        facts: [],
        models: [],
        people: [],
      });
    }
    if ((org as unknown as { error?: string }).error) {
      return page<Data>({
        ein,
        notFound: true,
        scores: [],
        history: [],
        ranking: {},
        facts: [],
        models: [],
        people: [],
      });
    }

    const scoresRes = await api.scores.list(ein).catch((e) => {
      only(e);
      return { ein, scores: [] as ScoreRow[] };
    });
    const scores = scoresRes.scores ?? [];
    const overallVersion = scores.length
      ? Math.max(...scores.map((s) => s.model_version))
      : 30;

    const latestYear = org.filings?.length
      ? Math.max(...org.filings.map((f) => f.year))
      : undefined;

    const [historyR, rankingR, finR, peopleR, modelsR, madeR, recvR] =
      await Promise.allSettled([
        api.scores.history(ein, overallVersion),
        api.scores.ranking(ein, overallVersion),
        latestYear !== undefined
          ? api.financials.facts(ein, latestYear)
          : Promise.resolve({ facts: [] as FinancialFact[] }),
        api.people.list({ ein }),
        // Used only to map model version -> model_type for the pillar rings.
        // Requires user:admin; tolerated (the rings fall back to "Pending").
        api.admin.listModels(),
        api.orgs.grants(ein, "made"),
        api.orgs.grants(ein, "received"),
      ]);
    for (const r of [historyR, rankingR, finR, peopleR, madeR, recvR]) {
      if (r.status === "rejected") only(r.reason);
    }
    // listModels may 403 for non-admins — only re-throw a genuine 401.
    if (modelsR.status === "rejected") only(modelsR.reason);

    return page<Data>({
      ein,
      org,
      overallVersion,
      scores,
      history: historyR.status === "fulfilled"
        ? historyR.value.history ?? []
        : [],
      ranking: rankingR.status === "fulfilled"
        ? rankingR.value.dimensions ?? {}
        : {},
      facts: finR.status === "fulfilled" ? finR.value.facts ?? [] : [],
      factsYear: latestYear,
      people: peopleR.status === "fulfilled" ? peopleR.value.people ?? [] : [],
      models: modelsR.status === "fulfilled" ? modelsR.value.models ?? [] : [],
      grantsMade: madeR.status === "fulfilled"
        ? madeR.value.summary
        : undefined,
      grantsReceived: recvR.status === "fulfilled"
        ? recvR.value.summary
        : undefined,
    });
  },

  async POST(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    if (!ctx.state.principal) return ctx.redirect("/login");
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    try {
      if (action === "follow") {
        await ctx.state.api.follows.follow(ein);
      } else if (action === "unfollow") {
        await ctx.state.api.follows.unfollow(ein);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      // otherwise fall through and just reload
    }
    return ctx.redirect(`/orgs/${ein}`);
  },
});

/** The four pillars, in display order, keyed to model TYPE codes. */
const PILLARS: { label: string; types: string[] }[] = [
  { label: "Financial Health", types: ["financial"] },
  { label: "Whole-Person Impact", types: ["whole_person"] },
  { label: "Leadership", types: ["leadership", "governance"] },
  {
    label: "Christ-Centered",
    types: ["christ_centeredness", "christ_centered"],
  },
];

/** Concept codes the financial picture reads (with reasonable fallbacks). */
function factValue(facts: FinancialFact[], codes: string[]): number | null {
  for (const code of codes) {
    const f = facts.find((x) => x.concept_code === code);
    if (f && f.canonical_value !== null && f.canonical_value !== undefined) {
      return f.canonical_value;
    }
  }
  return null;
}

/** Compact "$18.4M" / "$920K" money for the big KPI figures. */
function moneyCompact(value: number | null): string {
  if (value === null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return money(value);
}

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;

  if (data.notFound) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <EmptyState
          title="Organization not found"
          hint={`No organization with EIN ${formatEin(data.ein)}.`}
        >
          <LinkButton href="/search" variant="primary">
            Back to search
          </LinkButton>
        </EmptyState>
      </Layout>
    );
  }
  if (!data.org) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <ErrorAlert message={data.error ?? "Failed to load organization."} />
      </Layout>
    );
  }

  const org = data.org;
  const addr = org.address;

  // ----- Overall score: latest row of the highest model version -----
  const latestHist = data.history.length
    ? data.history[data.history.length - 1]
    : undefined;
  const overall = to100(latestHist?.total_score);
  const latestYear = data.factsYear ??
    (org.filings?.length
      ? Math.max(...org.filings.map((f) => f.year))
      : undefined);
  const globalRank = data.ranking.global;
  const percentile = globalRank ? Math.round(globalRank.percentile) : undefined;
  const overallSub = overall !== null
    ? `${letterGrade(overall)}${
      percentile !== undefined ? ` · ${ordinal(percentile)}` : ""
    }`
    : undefined;

  // ----- Pillar rings: latest score per model TYPE -----
  // Map model version -> type from /admin/models; for each pillar pick the
  // highest-version score we actually have for that type.
  const typeByVersion = new Map<number, string>();
  for (const m of data.models) {
    if (m.model_type) typeByVersion.set(m.version, m.model_type);
  }
  const pillarValues = PILLARS.map((p) => {
    const rows = data.scores
      .filter((s) => {
        const t = typeByVersion.get(s.model_version);
        return t !== undefined && p.types.includes(t);
      })
      .sort((a, b) => b.model_version - a.model_version || b.year - a.year);
    return rows.length ? to100(rows[0].total_score) : null;
  });

  // ----- Financial picture KPIs -----
  const revenue = factValue(data.facts, ["cy_rev", "total_rev", "contrib"]);
  const expenses = factValue(data.facts, ["total_exp", "cy_exp"]);
  const netAssets = factValue(data.facts, ["equity", "net_assets"]);
  const program = factValue(data.facts, ["prog", "prog_exp"]);
  const programRatio = program !== null && expenses && expenses !== 0
    ? (program / expenses) * 100
    : null;

  // ----- Revenue / score trend (derived from /scores/history years) -----
  const trend = [...data.history]
    .filter((h) =>
      h.total_score !== null && h.total_score !== undefined &&
      !isNaN(h.total_score)
    )
    .sort((a, b) => a.year - b.year);
  const haveTrend = trend.length >= 2;

  // ----- "Why this score" bullets (band-driven from real pillar data) -----
  const bulletSource = PILLARS
    .map((p, i) => ({ label: p.label, value: pillarValues[i] }))
    .filter((x): x is { label: string; value: number } => x.value !== null)
    .sort((a, b) => b.value - a.value);
  const reasons = bulletSource.length
    ? bulletSource.slice(0, 3)
    : (overall !== null ? [{ label: "Overall standing", value: overall }] : []);

  // ----- People (key personnel) -----
  const people = data.people.slice(0, 4);

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} bleed>
      {/* ───────────────────────── NAVY HERO ───────────────────────── */}
      <div
        class="bg-navy text-white"
        style={{ padding: "42px 44px" }}
      >
        <div
          class="mx-auto flex flex-wrap items-center gap-11"
          style={{ maxWidth: "1340px" }}
        >
          <div class="min-w-0 flex-1">
            <div
              class="mono mb-5 inline-flex items-center gap-2 rounded-full uppercase"
              style={{
                border: "1px solid rgba(238,241,247,.3)",
                padding: "5px 13px",
                fontSize: "12px",
                letterSpacing: ".04em",
                color: "#9fb6e6",
              }}
            >
              {org.sector_name ?? titleCase(org.org_type) ?? "Nonprofit"}
            </div>
            <h1
              class="font-display font-bold text-white"
              style={{
                fontSize: "50px",
                lineHeight: "1.0",
                letterSpacing: "-0.03em",
                margin: "0 0 16px",
              }}
            >
              {org.name}
            </h1>
            {/* TODO: wire to API — no mission text in /organizations/full yet */}
            <p
              style={{
                fontSize: "17px",
                lineHeight: "1.55",
                color: "rgba(238,241,247,.74)",
                maxWidth: "440px",
                margin: "0 0 22px",
                textWrap: "pretty",
              }}
            >
              Advancing its charitable mission through programs and services
              reported on its annual Form 990 filings.
            </p>
            <div
              class="mono flex flex-wrap"
              style={{
                gap: "18px",
                fontSize: "12px",
                color: "rgba(238,241,247,.6)",
              }}
            >
              <span>EIN {formatEin(org.ein)}</span>
              {addr?.city && (
                <span>
                  {[addr.city, addr.state].filter(Boolean).join(", ")}
                </span>
              )}
              <span style={{ color: "#9fb6e6" }}>
                Verified 990{latestYear ? ` · FY${latestYear}` : ""}
              </span>
            </div>
            {state.principal && (
              <div class="mt-6">
                <form method="POST">
                  <input
                    type="hidden"
                    name="action"
                    value={org.following ? "unfollow" : "follow"}
                  />
                  <button
                    type="submit"
                    class="mono inline-flex items-center rounded-full font-semibold"
                    style={{
                      border: "1px solid rgba(238,241,247,.4)",
                      padding: "9px 18px",
                      fontSize: "13px",
                      color: "#eef1f7",
                      background: org.following
                        ? "rgba(238,241,247,.12)"
                        : "transparent",
                    }}
                  >
                    {org.following ? "✓ Following" : "+ Follow"}
                  </button>
                </form>
              </div>
            )}
          </div>
          {/* overall gauge ring */}
          <div class="flex shrink-0 flex-col items-center gap-3.5">
            <GaugeRing
              dark
              value={overall}
              size={186}
              label="OVERALL"
              sub={overallSub}
            />
            {overall === null && (
              <span class="mono text-xs" style={{ color: "#9fb6e6" }}>
                Pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ───────────────────── SCORE RINGS RAIL ───────────────────── */}
      <div class="border-b border-line bg-page">
        <div
          class="mx-auto flex flex-wrap items-stretch"
          style={{ maxWidth: "1340px", padding: "30px 44px", gap: "18px" }}
        >
          {PILLARS.map((p, i) => {
            const v = pillarValues[i];
            const has = v !== null;
            return (
              <>
                {i > 0 && (
                  <div
                    class="self-stretch bg-line"
                    style={{ width: "1px" }}
                  />
                )}
                <div class="flex flex-1 items-center" style={{ gap: "16px" }}>
                  <GaugeRing value={v} size={78} />
                  <div>
                    <div
                      class="font-semibold text-navy"
                      style={{ fontSize: "13.5px", marginBottom: "3px" }}
                    >
                      {p.label}
                    </div>
                    {has
                      ? (
                        <div
                          class="mono font-semibold"
                          style={{
                            fontSize: "12px",
                            color: scoreBand(v).pillText,
                          }}
                        >
                          Grade {letterGrade(v)}
                        </div>
                      )
                      : (
                        <div
                          class="mono font-semibold text-faint"
                          style={{ fontSize: "12px" }}
                        >
                          Pending
                        </div>
                      )}
                  </div>
                </div>
              </>
            );
          })}
        </div>
      </div>

      {/* ──────────────────── TWO-COLUMN NARRATIVE ──────────────────── */}
      <div class="mx-auto" style={{ maxWidth: "1340px" }}>
        <div
          class="grid"
          style={{
            padding: "34px 44px",
            gridTemplateColumns: "1fr 1fr",
            gap: "28px",
          }}
        >
          {/* financial picture */}
          <div class="card" style={{ borderRadius: "20px", padding: "26px" }}>
            <h2
              class="font-display font-bold text-navy"
              style={{
                fontSize: "18px",
                margin: "0 0 20px",
                letterSpacing: "-0.01em",
              }}
            >
              Financial picture
            </h2>
            <div
              class="grid"
              style={{
                gridTemplateColumns: "1fr 1fr",
                gap: "20px 16px",
                marginBottom: "24px",
              }}
            >
              <Kpi label="Total revenue" value={moneyCompact(revenue)} />
              <Kpi label="Total expenses" value={moneyCompact(expenses)} />
              <Kpi label="Net assets" value={moneyCompact(netAssets)} />
              <Kpi
                label="Program ratio"
                value={programRatio !== null
                  ? `${programRatio.toFixed(1)}%`
                  : "—"}
                accent
              />
            </div>

            {haveTrend ? <ScoreTrend rows={trend} /> : (
              <>
                <div
                  class="text-muted"
                  style={{ fontSize: "12px", marginBottom: "8px" }}
                >
                  Revenue trend
                </div>
                {/* TODO: wire to API — needs ≥2 years of canonical financials */}
                <svg
                  viewBox="0 0 320 90"
                  width="100%"
                  height="90"
                  preserveAspectRatio="none"
                  style={{ display: "block" }}
                >
                  <path
                    d="M0,69.6 L80,53.5 L160,40.3 L240,24.2 L320,10 L320,90 L0,90 Z"
                    fill="#dde7f6"
                  />
                  <path
                    d="M0,69.6 L80,53.5 L160,40.3 L240,24.2 L320,10"
                    fill="none"
                    stroke="#3a5da8"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </>
            )}
          </div>

          {/* why this score */}
          <div class="card" style={{ borderRadius: "20px", padding: "26px" }}>
            <h2
              class="font-display font-bold text-navy"
              style={{
                fontSize: "18px",
                margin: "0 0 18px",
                letterSpacing: "-0.01em",
              }}
            >
              Why this score
            </h2>
            {reasons.length === 0
              ? (
                <p class="text-muted" style={{ fontSize: "13.5px" }}>
                  This organization has not been scored yet.
                </p>
              )
              : (
                <div class="flex flex-col" style={{ gap: "14px" }}>
                  {reasons.map((r) => (
                    <div class="flex" style={{ gap: "12px" }}>
                      <span
                        class="shrink-0"
                        style={{
                          width: "6px",
                          borderRadius: "3px",
                          background: scoreBand(r.value).hex,
                        }}
                      />
                      <p
                        style={{
                          margin: "0",
                          fontSize: "13.5px",
                          lineHeight: "1.55",
                          color: "#454b58",
                        }}
                      >
                        <strong class="text-navy">
                          {r.label} ({r.value}).
                        </strong>{" "}
                        {scoreBand(r.value).name === "Strong"
                          ? "A standout strength — well above peer benchmarks."
                          : scoreBand(r.value).name === "Solid"
                          ? "Healthy and dependable, in line with strong peers."
                          : scoreBand(r.value).name === "Watch"
                          ? "Adequate, but worth monitoring against peers."
                          : "Below benchmark — a priority area for improvement."}
                        {/* TODO: wire to API — narrative factor commentary */}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            {globalRank && (
              <div
                class="flex items-center justify-between"
                style={{
                  marginTop: "20px",
                  borderTop: "1px solid #e6eaf1",
                  paddingTop: "16px",
                }}
              >
                <span class="text-muted" style={{ fontSize: "13px" }}>
                  Percentile in category
                </span>
                <span
                  class="font-display font-bold text-navy"
                  style={{ fontSize: "22px" }}
                >
                  {percentile}
                  <span
                    class="text-faint"
                    style={{ fontSize: "13px", fontWeight: "500" }}
                  >
                    {percentile !== undefined
                      ? ordinal(percentile).slice(String(percentile).length)
                      : ""}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ───────── PROGRAM PHOTO + KEY PERSONNEL ───────── */}
        <div
          class="grid items-stretch"
          style={{
            padding: "0 44px 40px",
            gridTemplateColumns: "1fr 1.1fr",
            gap: "28px",
          }}
        >
          {/* placeholder */}
          <div
            class="flex items-center justify-center"
            style={{
              borderRadius: "20px",
              border: "1px dashed #b7c1d6",
              background:
                "repeating-linear-gradient(135deg,#e4e8f0,#e4e8f0 11px,#dce1ec 11px,#dce1ec 22px)",
              minHeight: "200px",
            }}
          >
            {/* TODO: wire to API — no program imagery in the 990 dataset */}
            <span
              class="mono"
              style={{
                fontSize: "12px",
                color: "#8893ab",
                background: "#eceff5",
                padding: "6px 12px",
                borderRadius: "7px",
              }}
            >
              program photo — field operations
            </span>
          </div>

          {/* people cards */}
          <div>
            <h2
              class="font-display font-bold text-navy"
              style={{
                fontSize: "18px",
                margin: "0 0 16px",
                letterSpacing: "-0.01em",
              }}
            >
              Key personnel
            </h2>
            {people.length === 0
              ? (
                <div
                  class="card text-muted"
                  style={{
                    borderRadius: "14px",
                    padding: "15px",
                    fontSize: "13px",
                  }}
                >
                  No personnel on record for this organization.
                </div>
              )
              : (
                <div
                  class="grid"
                  style={{ gridTemplateColumns: "1fr 1fr", gap: "12px" }}
                >
                  {people.map((p) => (
                    <div
                      class="card"
                      style={{ borderRadius: "14px", padding: "15px" }}
                    >
                      <div
                        class="font-semibold text-navy"
                        style={{ fontSize: "13.5px" }}
                      >
                        {p.full_name}
                      </div>
                      <div
                        class="text-faint"
                        style={{ fontSize: "12px", margin: "2px 0 0" }}
                      >
                        {p.title ? titleCase(p.title) : "—"}
                      </div>
                      {/* comp shows comp $; omitted — no compensation in API */}
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      </div>
    </Layout>
  );
});

/** A big-figure financial KPI cell. */
function Kpi(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div
        class="text-muted"
        style={{ fontSize: "12px", marginBottom: "5px" }}
      >
        {props.label}
      </div>
      <div
        class="font-display font-bold"
        style={{
          fontSize: "27px",
          letterSpacing: "-0.02em",
          color: props.accent ? "#2f4a85" : "#222838",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

/**
 * Area chart of the org's overall-score history (derived from /scores/history).
 * Score is 0–1 → 0–100; plotted across the org's filing years.
 */
function ScoreTrend(props: { rows: ScoreHistoryRow[] }) {
  const rows = props.rows;
  const W = 320;
  const H = 90;
  const vals = rows.map((r) => to100(r.total_score) ?? 0);
  const n = rows.length;
  const x = (i: number) => (n === 1 ? W : (i / (n - 1)) * W);
  // Scale the band 0..100 into the chart, with a little headroom.
  const y = (v: number) =>
    H - 10 - (Math.max(0, Math.min(100, v)) / 100) * (H - 20);
  const line = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`)
    .join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const firstYear = rows[0].year;
  const lastYear = rows[rows.length - 1].year;
  return (
    <>
      <div
        class="text-muted"
        style={{ fontSize: "12px", marginBottom: "8px" }}
      >
        Score trend · {firstYear} → {lastYear}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="90"
        preserveAspectRatio="none"
        style={{ display: "block" }}
      >
        <path d={area} fill="#dde7f6" />
        <path
          d={line}
          fill="none"
          stroke="#3a5da8"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        {vals.map((v, i) => (
          <circle
            cx={x(i)}
            cy={y(v)}
            r={i === n - 1 ? 4.5 : 3.5}
            fill="#3a5da8"
          />
        ))}
      </svg>
    </>
  );
}
