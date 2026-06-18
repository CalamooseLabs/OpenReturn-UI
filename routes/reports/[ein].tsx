// /reports/[ein] — the NKC Family Foundation Summary Report (printable, per-org).
//
// Coexists with /reports (leaderboard, index.tsx) and /reports/export (export.ts);
// Fresh matches the static /reports/export before this dynamic segment.
//
// Layout: <Layout bleed> so the report owns its page chrome — a print-hidden
// REPORT LIBRARY RAIL (orgs from /organizations) + a print-hidden toolbar
// (breadcrumb + Print / Export PDF islands) + THE DOCUMENT (ReportDocument
// organism). Real API data drives the letterhead, score breakdown, and
// financials; foundation-relationship sections render marked SAMPLE content.

import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/templates.tsx";
import { EmptyState, ErrorAlert } from "../../components/molecules.tsx";
import { LinkButton } from "../../components/atoms.tsx";
import {
  ReportDocument,
  type ReportKpi,
  type ReportPillar,
  type ReportUpdate,
} from "../../components/organisms/ReportDocument.tsx";
import PrintButton from "../../islands/PrintButton.tsx";
import { formatEin, titleCase } from "../../lib/format.ts";
import { letterGrade, scoreBand, to100 } from "../../lib/score.ts";
import type {
  FinancialFact,
  ModelSummary,
  OrgFull,
  OrgSummary,
  ScoreHistoryRow,
  ScoreRow,
} from "../../lib/types.ts";

interface Data {
  ein: string;
  org?: OrgFull;
  notFound?: boolean;
  error?: string;
  scores: ScoreRow[];
  history: ScoreHistoryRow[];
  facts: FinancialFact[];
  factsYear?: number;
  models: ModelSummary[];
  rail: OrgSummary[];
}

/** Re-throw only a genuine 401 so middleware can bounce to /login. */
function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

function emptyData(ein: string, extra: Partial<Data> = {}): Data {
  return {
    ein,
    scores: [],
    history: [],
    facts: [],
    models: [],
    rail: [],
    ...extra,
  };
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
        return page<Data>(emptyData(ein, { notFound: true }));
      }
      return page<Data>(emptyData(ein, {
        error: err instanceof Error
          ? err.message
          : "Failed to load organization.",
      }));
    }
    if ((org as unknown as { error?: string }).error) {
      return page<Data>(emptyData(ein, { notFound: true }));
    }

    const scoresRes = await api.scores.list(ein).catch((e) => {
      bubble401(e);
      return { ein, scores: [] as ScoreRow[] };
    });
    const scores = scoresRes.scores ?? [];
    const overallVersion = scores.length
      ? Math.max(...scores.map((s) => s.model_version))
      : 30;

    const latestYear = org.filings?.length
      ? Math.max(...org.filings.map((f) => f.year))
      : undefined;

    const [historyR, finR, modelsR, railR] = await Promise.allSettled([
      api.scores.history(ein, overallVersion),
      latestYear !== undefined
        ? api.financials.facts(ein, latestYear)
        : Promise.resolve({ facts: [] as FinancialFact[] }),
      // Maps model version -> model_type for the pillar rows. Requires
      // user:admin; tolerated (rows fall back to "Pending").
      api.admin.listModels(),
      api.orgs.list({ limit: 50 }),
    ]);
    for (const r of [historyR, finR, railR]) {
      if (r.status === "rejected") bubble401(r.reason);
    }
    if (modelsR.status === "rejected") bubble401(modelsR.reason);

    return page<Data>({
      ein,
      org,
      scores,
      history: historyR.status === "fulfilled"
        ? historyR.value.history ?? []
        : [],
      facts: finR.status === "fulfilled" ? finR.value.facts ?? [] : [],
      factsYear: latestYear,
      models: modelsR.status === "fulfilled" ? modelsR.value.models ?? [] : [],
      rail: railR.status === "fulfilled" ? railR.value.organizations ?? [] : [],
    });
  },
});

/** The four report pillars, keyed to model TYPE codes (display order). */
const PILLARS: { label: string; types: string[] }[] = [
  {
    label: "Christ-Centered & Mission Alignment",
    types: [
      "christ_centeredness",
      "christ_centered",
    ],
  },
  { label: "Financial", types: ["financial"] },
  { label: "Whole-Person Impact", types: ["whole_person"] },
  { label: "Leadership", types: ["leadership", "governance"] },
];

/** Pick a concept value by code with fallbacks (matches the org-profile logic). */
function factValue(facts: FinancialFact[], codes: string[]): number | null {
  for (const code of codes) {
    const f = facts.find((x) => x.concept_code === code);
    if (f && f.canonical_value !== null && f.canonical_value !== undefined) {
      return f.canonical_value;
    }
  }
  return null;
}

/** Compact "$1.46M" / "$74.3K" money for the snapshot tiles. */
function moneyCompact(value: number | null): string {
  if (value === null || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/** Signed compact money for the NET label, e.g. "−$176,377" / "+$1.2M". */
function netLabel(value: number | null): string | null {
  if (value === null || isNaN(value)) return null;
  const sign = value < 0 ? "−" : "+";
  return `${sign}${moneyCompact(Math.abs(value)).replace("-", "")}`;
}

/** Band-driven generic narrative for a scored pillar. */
function pillarNarrative(label: string, value: number | null): string {
  if (value === null) {
    return `No ${label.toLowerCase()} model has scored this organization yet. ` +
      `Register and run a ${label.toLowerCase()} model to populate this section.`;
  }
  const band = scoreBand(value);
  const grade = letterGrade(value);
  switch (band.name) {
    case "Strong":
      return `Grade ${grade} (${value}/100) — a standout strength, well above ` +
        `peer benchmarks for this dimension.`;
    case "Solid":
      return `Grade ${grade} (${value}/100) — healthy and dependable, in line ` +
        `with strong peers.`;
    case "Watch":
      return `Grade ${grade} (${value}/100) — adequate, but worth monitoring ` +
        `against peer organizations.`;
    default:
      return `Grade ${grade} (${value}/100) — below benchmark; a priority area ` +
        `for improvement and follow-up.`;
  }
}

/** Sample relationship updates (foundation-internal — not in the 990 API). */
const SAMPLE_UPDATES: ReportUpdate[] = [
  {
    year: "Relationship notes",
    sample: true,
    body: "Sample timeline entry. Foundation meeting notes, site visits, and " +
      "milestones will appear here as the relationship with this organization " +
      "develops.",
  },
];

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const path = ctx.url.pathname;

  if (data.notFound) {
    return (
      <Layout principal={state.principal} path={path}>
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
      <Layout principal={state.principal} path={path}>
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

  // ----- Pillar scores: latest score per model TYPE -----
  const typeByVersion = new Map<number, string>();
  for (const m of data.models) {
    if (m.model_type) typeByVersion.set(m.version, m.model_type);
  }
  const pillars: ReportPillar[] = PILLARS.map((p) => {
    const rows = data.scores
      .filter((s) => {
        const t = typeByVersion.get(s.model_version);
        return t !== undefined && p.types.includes(t);
      })
      .sort((a, b) => b.model_version - a.model_version || b.year - a.year);
    const value = rows.length ? to100(rows[0].total_score) : null;
    return { label: p.label, value, note: pillarNarrative(p.label, value) };
  });

  // ----- Financial snapshot (real canonical financials) -----
  const revenue = factValue(data.facts, ["cy_rev", "total_rev", "contrib"]);
  const expenses = factValue(data.facts, ["total_exp", "cy_exp"]);
  const assets = factValue(data.facts, ["assets", "total_assets"]);
  const liabilities = factValue(data.facts, ["liabilities", "total_liab"]);
  const net = revenue !== null && expenses !== null ? revenue - expenses : null;
  const kpis: ReportKpi[] = [
    { label: "Income", value: moneyCompact(revenue) },
    { label: "Expenses", value: moneyCompact(expenses) },
    { label: "Assets", value: moneyCompact(assets) },
    { label: "Liabilities", value: moneyCompact(liabilities), accent: true },
  ];

  // ----- Recent updates (derive from filings, else sample) -----
  const filingYears = [...(org.filings ?? [])]
    .sort((a, b) => b.year - a.year)
    .slice(0, 4);
  const updates: ReportUpdate[] = filingYears.length
    ? filingYears.map((f) => ({
      year: String(f.year),
      body: `Filed a Form ${f.form_code} return for fiscal year ${f.year}` +
        `${f.created_at ? ` (recorded ${f.created_at.split("T")[0]})` : ""}.`,
    }))
    : SAMPLE_UPDATES;

  // ----- Rail (other reports) -----
  const rail = data.rail;
  const lastUpdated = latestYear ? `FY${latestYear}` : undefined;

  return (
    <Layout principal={state.principal} path={path} bleed>
      <div class="flex items-start">
        {/* ════════════════ REPORT LIBRARY RAIL (print-hidden) ════════════════ */}
        <aside
          class="hidden shrink-0 self-start border-r border-line bg-white lg:block print:hidden"
          style={{
            width: "272px",
            minHeight: "calc(100vh - 58px)",
            position: "sticky",
            top: "58px",
            padding: "22px 16px",
          }}
        >
          <div
            class="flex items-center justify-between"
            style={{ padding: "0 6px 14px" }}
          >
            <span
              class="mono uppercase"
              style={{
                fontSize: "10.5px",
                letterSpacing: ".14em",
                color: "#aeb6c7",
              }}
            >
              Report Library
            </span>
            <span
              style={{
                fontSize: "11px",
                color: "#9aa3b5",
                background: "#f1f3f8",
                borderRadius: "6px",
                padding: "2px 7px",
              }}
            >
              {lastUpdated ?? "Reports"}
            </span>
          </div>
          {/* Filter box (static — typing is a future enhancement). */}
          <div
            class="flex items-center gap-2.5"
            style={{
              background: "#f1f3f8",
              border: "1px solid #e1e6ef",
              borderRadius: "9px",
              height: "34px",
              padding: "0 11px",
              marginBottom: "14px",
              color: "#8893ab",
              fontSize: "12.5px",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="#aeb6c7" stroke-width="1.6" />
              <path
                d="M11 11l3 3"
                stroke="#aeb6c7"
                stroke-width="1.6"
                stroke-linecap="round"
              />
            </svg>
            Filter reports
          </div>
          {/* org list */}
          <div class="flex flex-col" style={{ gap: "2px" }}>
            {rail.map((o) => {
              const active = o.ein === data.ein;
              return (
                <a
                  href={`/reports/${o.ein}`}
                  class="flex items-center gap-3 no-underline"
                  style={{
                    padding: "11px 10px",
                    borderRadius: "11px",
                    background: active ? "#eef2fa" : "transparent",
                    border: active
                      ? "1px solid #d4e0f3"
                      : "1px solid transparent",
                  }}
                >
                  <span
                    class="flex shrink-0 items-center justify-center font-display font-bold"
                    style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      background: active ? "#192a54" : "#f1f3f8",
                      color: active ? "#fff" : "#8893ab",
                    }}
                  >
                    {o.name.trim().slice(0, 2).toUpperCase()}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div
                      class="truncate font-semibold"
                      style={{
                        fontSize: "13px",
                        lineHeight: "1.2",
                        color: active ? "#192a54" : "#3a4150",
                      }}
                    >
                      {o.name}
                    </div>
                    <div
                      class="mono"
                      style={{
                        fontSize: "11px",
                        color: "#9aa3b5",
                        marginTop: "2px",
                      }}
                    >
                      {formatEin(o.ein)}
                    </div>
                  </div>
                </a>
              );
            })}
            {rail.length === 0 && (
              <div
                class="text-muted"
                style={{ fontSize: "12.5px", padding: "8px 10px" }}
              >
                No organizations available.
              </div>
            )}
          </div>
        </aside>

        {/* ════════════════════════ MAIN: DOCUMENT ════════════════════════ */}
        <div
          class="or-shell min-w-0 flex-1 bg-page"
          style={{ padding: "26px 32px 64px" }}
        >
          {/* toolbar (print-hidden) */}
          <div
            class="mx-auto mb-4 flex flex-wrap items-center gap-3.5 print:hidden"
            style={{ maxWidth: "960px" }}
          >
            <div class="flex items-center gap-2" style={{ fontSize: "13.5px" }}>
              <a href="/reports" class="link" style={{ color: "#9aa3b5" }}>
                Reports
              </a>
              <span style={{ color: "#cfd5e2" }}>/</span>
              <span class="font-semibold" style={{ color: "#3a4150" }}>
                {org.name}
              </span>
            </div>
            <div class="ml-auto flex items-center gap-2.5">
              <PrintButton>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M5 6V2.5h6V6M4 6h8v5H4zM5.5 11v2.5h5V11"
                    stroke="#7c89a3"
                    stroke-width="1.5"
                    stroke-linejoin="round"
                  />
                </svg>
                Print
              </PrintButton>
              <PrintButton>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 1.5v8M5 7l3 2.5L11 7M2.5 12.5h11"
                    stroke="#7c89a3"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                Export PDF
              </PrintButton>
            </div>
          </div>

          <ReportDocument
            name={org.name}
            ein={org.ein}
            city={addr?.city}
            state={addr?.state}
            sector={org.sector_name ||
              titleCase(org.org_type) || "Nonprofit"}
            overall={overall}
            fiscalYear={latestYear}
            lastUpdated={lastUpdated}
            pillars={pillars}
            kpis={kpis}
            net={net}
            netLabel={netLabel(net)}
            financialPeriod={latestYear ? `FY${latestYear}` : undefined}
            updates={updates}
          />
        </div>
      </div>
    </Layout>
  );
});
