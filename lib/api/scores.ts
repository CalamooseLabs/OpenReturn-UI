import { ApiResource } from "./client.ts";
import type {
  CodeNameDesc,
  FactorsResponse,
  LeaderboardResponse,
  RankingResponse,
  ScoreHistoryRow,
  ScoreRow,
} from "../types.ts";

export interface LeaderboardParams {
  model: number;
  year?: number;
  sector?: string;
  state?: string;
  city?: string;
  county?: string;
  type?: string;
  grantmaker?: number;
  list?: number;
  limit?: number;
  offset?: number;
}

/** /scores* — history, compare, leaderboard, ranking, factors, vocab. */
export class ScoresApi extends ApiResource {
  list(ein: string) {
    return this.get<{ ein: string; scores: ScoreRow[] }>("/scores", { ein });
  }
  history(ein: string, version: number) {
    return this.get<
      { ein: string; model_version: number; history: ScoreHistoryRow[] }
    >(
      "/scores/history",
      { ein, version },
    );
  }
  compare(ein: string, year: number) {
    return this.get<{ ein: string; year: number; scores: ScoreRow[] }>(
      "/scores/compare",
      { ein, year },
    );
  }
  leaderboard(params: LeaderboardParams) {
    return this.get<LeaderboardResponse>("/scores/leaderboard", { ...params });
  }
  ranking(ein: string, model: number, year?: number) {
    return this.get<RankingResponse>("/scores/ranking", { ein, model, year });
  }
  factors(version: number) {
    return this.get<FactorsResponse>("/scores/factors", { version });
  }
  kinds() {
    return this.get<{ kinds: CodeNameDesc[] }>("/scores/kinds");
  }
  types() {
    return this.get<{ types: CodeNameDesc[] }>("/scores/types");
  }
  /** Full evaluation trace for an org-year-model: formula → numbers → 990 source. */
  debug(ein: string, year: number, version: number) {
    return this.get<DebugTrace>("/scores/debug", { ein, year, version });
  }
}

/** A single input variable in a factor trace (the provenance record). */
export interface DebugVariable {
  key: string;
  kind: "concept" | "factor" | "model" | "literal";
  concept?: string;
  references?: string | number | null;
  xml_path?: string | null;
  value?: number | null;
  raw_value?: string | number | null;
  present?: boolean;
  /** Schema location of a 990-derived concept (form / part / section / line / col). */
  source?: {
    field_id?: number;
    xml_path?: string;
    sub_letter?: string | null;
    column_code?: string | null;
    box_label?: string | null;
    data_type?: string;
    line?: { number?: string; label?: string; data_type?: string } | null;
    section?: { code?: string; name?: string | null } | null;
    part?: { number?: string; name?: string } | null;
    form?: { code?: string; name?: string } | null;
  } | null;
  canonical_source?: string | null;
  confidence?: number | null;
  conflict?: boolean;
}

export interface DebugFactor {
  factor_id: number;
  name: string;
  formula_type: string;
  weight: number;
  formula_description?: string | null;
  inputs: string[];
  variables: DebugVariable[];
  /** Rendered formula: human `expression` + `substituted` (with this org's numbers). */
  formula: {
    type?: string;
    expression?: string;
    substituted?: string;
    raw_value?: number | null;
    computable?: boolean;
    note?: string | null;
  };
  /** Normalization step (benchmark → 0–1). */
  normalization?: {
    direction?: string;
    benchmark_lo?: number;
    benchmark_hi?: number;
    expression?: string;
    substituted?: string;
    normalized?: number | null;
  } | null;
  raw_value: number | null;
  normalized: number | null;
  weighted_value: number | null;
}

export interface DebugTrace {
  ein: string;
  year: number;
  filing_id: string;
  form_code?: string;
  model_version: number;
  model_type?: string | null;
  model_kind?: string | null;
  total_score: number;
  evaluation_order: string[];
  factors: DebugFactor[];
  error?: string;
}
