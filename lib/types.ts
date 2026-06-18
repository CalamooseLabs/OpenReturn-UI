// Shared types mirroring the OpenReturn API response shapes.
// The API is large; we type the fields the UI actually reads and keep the rest
// loose. See the backend's openapi.json / docs/frontend.md for the full contract.

export interface UserAccount {
  user_id: number;
  username: string;
  is_active: boolean;
  created_at?: string;
  last_login_at?: string | null;
  roles: string[];
}

/** The authenticated caller, as returned by GET /auth/me (enriched at login). */
export interface Principal {
  kind: string; // "user" | "program"
  label: string;
  permissions: string[];
  user?: UserAccount;
}

export interface LoginResponse {
  session_key: string;
  expires_at: string;
  user: UserAccount;
}

export interface Address {
  street?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  county_fips?: string | null;
  county_name?: string | null;
  country_code?: string | null;
}

export interface OrgSummary {
  ein: string;
  name: string;
  org_type?: string | null;
  is_grantmaker?: boolean;
  is_favorite?: boolean;
  following?: boolean;
  sector_code?: string | null;
  sector_name?: string | null;
  website?: string | null;
  main_email?: string | null;
  address?: Address | null;
  mailing_address?: Address | null;
}

export interface FilingLink {
  detail: string;
  data: string;
  lookup: string;
}

export interface Filing {
  filing_id: string;
  year: number;
  form_code: string;
  object_id?: string | null;
  xml_filename?: string | null;
  zip_filename?: string | null;
  created_at?: string;
  links?: FilingLink;
}

export interface OrgFull extends OrgSummary {
  filings: Filing[];
}

export interface OrgListResponse {
  total: number;
  limit: number;
  offset: number;
  organizations: OrgSummary[];
}

export interface ScoreHistoryRow {
  year: number;
  total_score: number;
  imputed: boolean;
  score_id: number;
  source_year?: number | null;
}

export interface ScoreRow {
  score_id: number;
  model_version: number;
  filing_id?: string;
  year: number;
  total_score: number;
  scored_at?: string;
  imputed: boolean;
  model_type?: string | null;
  model_kind?: string | null;
}

export interface LeaderboardRow {
  rank: number;
  ein: string;
  name: string;
  total_score: number;
  year: number;
}

export interface LeaderboardResponse {
  model_version: number;
  year: number | null;
  total: number;
  limit: number;
  offset: number;
  leaderboard: LeaderboardRow[];
}

export interface RankCell {
  ein: string;
  rank: number;
  of: number;
  percentile: number;
  total_score: number;
}

export interface RankingResponse {
  ein: string;
  model_version: number;
  year: number | null;
  dimensions: Record<string, RankCell | null>;
}

export interface ModelSummary {
  version: number;
  description?: string | null;
  model_type?: string | null;
  scoring_mode?: string | null;
  model_kind?: string | null;
  created_at?: string;
}

export interface FactorDef {
  factor_id: number;
  name: string;
  weight: number;
  formula_type?: string | null;
  inputs?: string | null; // JSON-encoded string
  direction?: string | null;
  benchmark_lo?: number | null;
  benchmark_hi?: number | null;
  formula_description?: string | null;
  manual_scale?: string | null;
}

export interface FactorsResponse {
  model_version: number;
  model_type?: string;
  scoring_mode?: string;
  model_kind?: string;
  factors: FactorDef[];
}

export interface TemplateSummary {
  code: string;
  name: string;
  description?: string;
  kind: string;
  type: string;
  version: number;
  factor_count: number;
}

export interface CodeNameDesc {
  code: string;
  name: string;
  description?: string;
}

export interface Sector {
  code: string;
  name: string;
  parent_code?: string | null;
}

export interface Role {
  code: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface Permission {
  code: string;
  description?: string;
}

export interface Observation {
  observation_id: number;
  source_code: string;
  value: number | null;
  raw_value?: string | null;
  confidence?: number;
  document_id?: number;
  entered_by?: string | null;
  entered_at?: string;
  is_canonical: boolean;
}

export interface FinancialFact {
  fiscal_year: number;
  concept_code: string;
  chosen_by?: string | null;
  observations: Observation[];
  diverges: boolean;
  resolved: boolean;
  conflict: boolean;
  canonical_value: number | null;
}

export interface Membership {
  membership_id: number;
  person_id: number;
  org_ein: string;
  org_name?: string;
  role_title?: string | null;
  is_primary?: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface Person {
  person_id: number;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  memberships?: Membership[];
}

export interface TagInfo {
  tag_id: number;
  name: string;
  org_count: number;
}

export interface ListSummary {
  list_id: number;
  name: string;
  owner_user_id?: number | null;
  visibility: string; // private | public
  kind: string; // static | smart
  definition?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface ListDetail extends ListSummary {
  organizations: { ein: string; name: string }[];
}
