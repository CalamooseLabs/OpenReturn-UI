import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import type { Grant } from "../../lib/api/orgs.ts";
import { Layout } from "../../components/templates.tsx";
import { EmptyState, ErrorAlert } from "../../components/molecules.tsx";
import { LinkButton } from "../../components/atoms.tsx";
import {
  FinancialPicture,
  GrantsSummary,
  KeyPersonnel,
  NarrativeRow,
  OrgHero,
  type PillarDatum,
  type Reason,
  ScoreRingsRail,
  WhyThisScore,
} from "../../components/organisms/OrgProfile.tsx";
import { formatEin, titleCase } from "../../lib/format.ts";
import { letterGrade, ordinal, to100 } from "../../lib/score.ts";
import { compareVersions, maxVersion } from "../../lib/models.ts";
import type {
  FinancialFact,
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

interface GrantFlow {
  summary: GrantSummary;
  grants: Grant[];
}

interface Data {
  ein: string;
  org?: OrgFull;
  notFound?: boolean;
  error?: string;
  overallVersion?: string;
  scores: ScoreRow[];
  history: ScoreHistoryRow[];
  ranking: Record<string, RankCell | null>;
  facts: FinancialFact[];
  factsYear?: number;
  people: Person[];
  grantsMade?: GrantFlow;
  grantsReceived?: GrantFlow;
}

function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    const api = ctx.state.api;

    // These don't depend on the org record or the model version, so fire them in
    // parallel with full() instead of serializing behind it. (On a 404 they're
    // simply discarded — allSettled never rejects, so nothing leaks.)
    const sideP = Promise.allSettled([
      api.scores.list(ein),
      api.people.list({ ein }),
      api.orgs.grants(ein, "made"),
      api.orgs.grants(ein, "received"),
    ]);

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
        people: [],
      });
    }

    // The version-independent fan-out we kicked off above.
    const [scoresR, peopleR, madeR, recvR] = await sideP;
    for (const r of [scoresR, peopleR, madeR, recvR]) {
      if (r.status === "rejected") only(r.reason);
    }
    const scores = scoresR.status === "fulfilled"
      ? (scoresR.value.scores ?? [])
      : [];
    const overallVersion = scores.length
      ? maxVersion(scores.map((s) => s.model_version))!
      : "30";

    const latestYear = org.filings?.length
      ? Math.max(...org.filings.map((f) => f.year))
      : undefined;

    // These genuinely depend on the model version / latest year resolved above.
    const [historyR, rankingR, finR] = await Promise.allSettled([
      api.scores.history(ein, overallVersion),
      api.scores.ranking(ein, overallVersion),
      latestYear !== undefined
        ? api.financials.facts(ein, latestYear)
        : Promise.resolve({ facts: [] as FinancialFact[] }),
    ]);
    for (const r of [historyR, rankingR, finR]) {
      if (r.status === "rejected") only(r.reason);
    }

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
      grantsMade: madeR.status === "fulfilled"
        ? { summary: madeR.value.summary, grants: madeR.value.grants ?? [] }
        : undefined,
      grantsReceived: recvR.status === "fulfilled"
        ? { summary: recvR.value.summary, grants: recvR.value.grants ?? [] }
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
  // The /scores rows now carry model_type directly, so we no longer need
  // /admin/models to map version -> type. For each pillar pick the
  // highest-version score we actually have for that type. Pillars with no
  // matching type render "Pending".
  const pillarValues = PILLARS.map((p) => {
    const rows = data.scores
      .filter((s) => !!s.model_type && p.types.includes(s.model_type))
      .sort((a, b) =>
        compareVersions(b.model_version, a.model_version) || b.year - a.year
      );
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

  // ----- "Why this score" bullets (band-driven from real pillar data) -----
  const bulletSource: Reason[] = PILLARS
    .map((p, i) => ({ label: p.label, value: pillarValues[i] }))
    .filter((x): x is Reason => x.value !== null)
    .sort((a, b) => b.value - a.value);
  const reasons: Reason[] = bulletSource.length
    ? bulletSource.slice(0, 3)
    : (overall !== null ? [{ label: "Overall standing", value: overall }] : []);

  // ----- Pillar rings rail data -----
  const pillars: PillarDatum[] = PILLARS.map((p, i) => ({
    label: p.label,
    value: pillarValues[i],
  }));

  // ----- People (key personnel) -----
  const people = data.people.slice(0, 4);

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} bleed>
      <OrgHero
        name={org.name}
        ein={org.ein}
        category={org.sector_name ?? titleCase(org.org_type) ?? "Nonprofit"}
        city={addr?.city}
        state={addr?.state}
        latestYear={latestYear}
        overall={overall}
        overallSub={overallSub}
        following={org.following}
        showFollow={!!state.principal}
      />

      <ScoreRingsRail pillars={pillars} />

      {/* ──────────────────── TWO-COLUMN NARRATIVE ──────────────────── */}
      <div class="mx-auto" style={{ maxWidth: "1340px" }}>
        <NarrativeRow>
          <FinancialPicture
            revenue={revenue}
            expenses={expenses}
            netAssets={netAssets}
            programRatio={programRatio}
            trend={trend}
          />
          <WhyThisScore
            reasons={reasons}
            percentile={percentile}
            hasGlobalRank={!!globalRank}
          />
        </NarrativeRow>

        <GrantsSummary
          made={data.grantsMade}
          received={data.grantsReceived}
        />

        <KeyPersonnel people={people} />
      </div>
    </Layout>
  );
});
