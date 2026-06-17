import { ApiResource } from "./client.ts";
import type { CodeNameDesc, FinancialFact } from "../types.ts";

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
}
