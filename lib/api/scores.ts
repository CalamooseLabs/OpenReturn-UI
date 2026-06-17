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
}
