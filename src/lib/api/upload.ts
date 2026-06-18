import { ApiResource } from "./client.ts";

/** One archive pulled from a URL (the `ingested_zip` ledger). */
export interface GrabbedArchive {
  source: string;
  url?: string | null;
  filename?: string | null;
  content_length?: number | null;
  filings_stored?: number | null;
  last_modified?: string | null;
  ingested_at?: string | null;
}

/** One source ZIP summarized from the filing table (any ingest method). */
export interface ArchiveSummary {
  zip_filename: string | null;
  filings: number;
  first_year: number | null;
  last_year: number | null;
  first_ingested: string | null;
  last_ingested: string | null;
}

export interface IngestedResponse {
  grabbed: GrabbedArchive[];
  grabbed_count: number;
  archives: ArchiveSummary[];
  ingest_running: boolean;
  ingest: { pid?: number; source?: string; started_at?: string } | null;
  default_source: string;
}

/** A discoverable archive at a URL, flagged with whether it's already ingested. */
export interface DiscoveredArchive {
  url: string;
  filename: string;
  ingested: boolean;
}

export interface DiscoverResponse {
  source: string;
  count: number;
  new: number;
  archives: DiscoveredArchive[];
  error?: string;
}

export interface GrabResponse {
  status?: string;
  source?: string;
  force?: boolean;
  note?: string;
  error?: string;
  detail?: string;
}

/** /upload* — bulk ZIP of 990 XML, single-PDF OCR, and grab-from-IRS. */
export class UploadApi extends ApiResource {
  /** Upload a ZIP of 990 XML filings. `form` must contain the .zip file part. */
  zip(form: FormData) {
    return this.postRaw<Record<string, unknown>>("/upload", form);
  }
  /** OCR a single 990 PDF into observations for the given org-year. */
  pdf(ein: string, year: string | number, form: FormData) {
    return this.postRaw<Record<string, unknown>>("/upload/pdf", form, {
      ein,
      year,
    });
  }
  /** What has been grabbed/ingested, plus whether an ingest is running now. */
  ingested() {
    return this.get<IngestedResponse>("/upload/ingested");
  }
  /** Dry run: list the ZIP archives reachable at `url` (default the IRS page). */
  discover(url?: string) {
    return this.post<DiscoverResponse>("/upload/discover", { url });
  }
  /**
   * Start a detached background ingest of `url` (briefly restarts the server).
   * `schedule` defers the run: omit/"now" = immediate; "01:00" = a clock time.
   */
  grab(url: string, force = false, schedule?: string) {
    const body: { url: string; force: boolean; schedule?: string } = {
      url,
      force,
    };
    if (schedule && schedule !== "now") body.schedule = schedule;
    return this.post<GrabResponse>("/upload/grab", body);
  }
}
