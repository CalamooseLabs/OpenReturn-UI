import { ApiResource } from "./client.ts";
import type { OrgFull, OrgListResponse, OrgSummary, Sector } from "../types.ts";

export interface OrgSearchParams {
  q?: string;
  ein?: string;
  state?: string;
  city?: string;
  county?: string;
  type?: string;
  sector?: string;
  grantmaker?: number;
  fuzzy?: number;
  favorite?: number;
  limit?: number;
  offset?: number;
}

export interface GrantSummary {
  grant_count: number;
  total_amount: number;
  counterparties: number;
  by_year?: { year: number; amount: number }[];
}

/** One grant edge. `recipient`/`recipient_ein` are set for direction=made,
 * `grantor`/`grantor_ein` for direction=received. `amount` = cash + non-cash. */
export interface Grant {
  year: number;
  amount: number;
  purpose?: string | null;
  grant_kind?: string | null;
  recipient?: string | null;
  recipient_ein?: string | null;
  grantor?: string | null;
  grantor_ein?: string | null;
}

export interface GrantsResponse {
  ein: string;
  direction: string;
  summary: GrantSummary;
  grants: Grant[];
}

/** /organizations* — search, lookup, vocab, grants, and mutations. */
export class OrgsApi extends ApiResource {
  list(
    params: {
      limit?: number;
      offset?: number;
      type?: string;
      sector?: string;
      grantmaker?: number;
    } = {},
  ) {
    return this.get<OrgListResponse>("/organizations", { ...params });
  }
  search(params: OrgSearchParams) {
    return this.get<OrgListResponse>("/organizations/search", { ...params });
  }
  full(ein: string) {
    return this.get<OrgFull>("/organizations/full", { ein });
  }
  detail(ein: string) {
    return this.get<OrgSummary>("/organizations/detail", { ein });
  }
  sectors() {
    return this.get<{ sectors: Sector[] }>("/organizations/sectors");
  }
  states() {
    return this.get<{ states: { code: string; name: string }[] }>(
      "/organizations/states",
    );
  }
  cities(state?: string) {
    return this.get<{ cities: string[] }>("/organizations/cities", { state });
  }
  counties(state?: string) {
    return this.get<{ counties: { fips: string; name: string }[] }>(
      "/organizations/counties",
      { state },
    );
  }
  grants(ein: string, direction: "made" | "received") {
    return this.get<GrantsResponse>("/organizations/grants", {
      ein,
      direction,
    });
  }
  create(body: Record<string, unknown>) {
    return this.post<OrgSummary>("/organizations", body);
  }
  edit(body: Record<string, unknown>) {
    return this.post<OrgSummary>("/organizations/edit", body);
  }
  favorite(body: Record<string, unknown>) {
    return this.post("/organizations/favorite", body);
  }
}
