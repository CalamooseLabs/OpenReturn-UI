import { ApiResource } from "./client.ts";
import type { CodeNameDesc, FinancialFact } from "../types.ts";

/** One organization with unresolved financial-fact conflicts. */
export interface ConflictOrg {
  ein: string;
  name: string;
  conflict_count: number;
}

export interface ConflictOrgsResponse {
  total: number;
  limit: number;
  offset: number;
  organizations: ConflictOrg[];
}

/** /financials* — multi-source facts, conflicts, and canonical selection. */
export class FinancialsApi extends ApiResource {
  facts(ein: string, year?: number) {
    return this.get<{ ein: string; facts: FinancialFact[] }>("/financials", {
      ein,
      year,
    });
  }
  conflicts(ein: string) {
    return this.get<{ ein: string; conflicts: FinancialFact[] }>(
      "/financials/conflicts",
      { ein },
    );
  }
  /** Organizations that have at least one unresolved conflict (the inbox). */
  conflictOrgs(params: { limit?: number; offset?: number } = {}) {
    return this.get<ConflictOrgsResponse>("/financials/conflict-orgs", {
      limit: params.limit,
      offset: params.offset,
    });
  }
  sources() {
    return this.get<{ sources: (CodeNameDesc & { rank?: number })[] }>(
      "/financials/sources",
    );
  }
  concepts() {
    return this.get<{ concepts: CodeNameDesc[] }>("/financials/concepts");
  }
  setCanonical(body: {
    ein: string;
    fiscal_year: number;
    concept: string;
    observation_id: number;
  }) {
    return this.post("/financials/canonical", body);
  }
  recordObservations(body: Record<string, unknown>) {
    return this.post("/financials/observations", body);
  }
  /** Hand-edit a fact's value (mints a manual observation for non-manual facts,
   * updates the manual one in place otherwise) and make it canonical. */
  editValue(body: {
    ein: string;
    fiscal_year: number;
    concept: string;
    value: number;
    note?: string;
  }) {
    return this.post<Record<string, unknown>>("/financials/value", body);
  }
}
