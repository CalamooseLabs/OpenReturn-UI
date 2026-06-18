// ── Organism: IrsGrab ────────────────────────────────────────────────────────
// The admin "grab from the IRS website" workflow + the "what was grabbed and
// ingested" ledger. Server-rendered (POST forms, no island): Discover previews
// the archives at a URL; Start ingest launches a detached background load.

import { Button } from "../atoms.tsx";
import { Card, ErrorAlert, InfoAlert, Section, Table } from "../molecules.tsx";
import { dateOnly, number } from "../../lib/format.ts";
import type {
  ArchiveSummary,
  DiscoverResponse,
  GrabbedArchive,
  GrabResponse,
  IngestedResponse,
} from "../../lib/api/upload.ts";

/** Bytes → a compact human size (mirrors the backend's `_human`). */
function humanSize(n: number | null | undefined): string {
  if (!n) return "—";
  let size = n;
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (size < 1024 || unit === "GB") return `${size.toFixed(1)}${unit}`;
    size /= 1024;
  }
  return `${n}`;
}

/** The discover/grab form + (after a discover) a preview of the archives found. */
export function GrabFromIrs(
  props: {
    defaultUrl: string;
    url?: string;
    discovered?: DiscoverResponse;
    grab?: GrabResponse;
    ingestRunning: boolean;
  },
) {
  const url = props.url ?? props.defaultUrl;
  const d = props.discovered;
  return (
    <Section title="Grab from the IRS website">
      <Card>
        <p class="mb-4 text-sm text-muted">
          Pull filings straight from <code>irs.gov</code>. Paste a direct{" "}
          <code>.zip</code>{" "}
          link or an index page (the IRS Form 990 downloads page is the default)
          — <strong class="text-ink">Discover</strong> previews the archives,
          {" "}
          <strong class="text-ink">Start ingest</strong>{" "}
          loads every new one in the background.
        </p>

        {props.grab?.status === "started" && (
          <div class="mb-4">
            <InfoAlert>
              Ingest started for <code>{props.grab.source}</code>.{" "}
              {props.grab.note ??
                "The API server will briefly restart to load it."}
            </InfoAlert>
          </div>
        )}
        {props.grab?.error && (
          <div class="mb-4">
            <ErrorAlert message={props.grab.error} />
          </div>
        )}

        <form method="POST">
          <div class="field">
            <label class="label" for="url">Source URL</label>
            <input
              class="input"
              id="url"
              name="url"
              type="url"
              value={url}
              placeholder="https://www.irs.gov/charities-non-profits/form-990-series-downloads"
              required
            />
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-3">
            <Button type="submit" name="action" value="discover">
              Discover
            </Button>
            <Button
              type="submit"
              name="action"
              value="grab"
              variant="primary"
              disabled={props.ingestRunning}
            >
              {props.ingestRunning ? "Ingest running…" : "Start ingest"}
            </Button>
            <label class="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="force" value="1" />
              Re-ingest already-grabbed
            </label>
          </div>
        </form>

        {d && !d.error && (
          <div class="mt-5">
            <p class="mb-2 text-sm text-muted">
              <strong class="text-ink">{d.count}</strong>{" "}
              archive{d.count === 1 ? "" : "s"} at <code>{d.source}</code>
              {" · "}
              <strong class="text-ink">{d.new}</strong> new
            </p>
            {d.archives.length === 0
              ? (
                <p class="text-sm text-faint">
                  No <code>.zip</code> archives found at that URL.
                </p>
              )
              : (
                <Table
                  head={
                    <>
                      <th>Archive</th>
                      <th class="text-right">Status</th>
                    </>
                  }
                >
                  {d.archives.map((a) => (
                    <tr key={a.url}>
                      <td class="mono text-xs">{a.filename}</td>
                      <td class="text-right">
                        {a.ingested
                          ? <span class="text-band-strong">ingested</span>
                          : <span class="text-muted">new</span>}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
          </div>
        )}
        {d?.error && (
          <div class="mt-4">
            <ErrorAlert message={d.error} />
          </div>
        )}
      </Card>
    </Section>
  );
}

/** The ledger of grabbed/ingested archives + a live-ingest banner. */
export function IngestedArchives(
  props: { data: IngestedResponse | null; unreachable?: boolean },
) {
  if (props.unreachable) {
    return (
      <Section title="What's been ingested">
        <Card>
          <InfoAlert>
            The API is not responding — a background ingest may be restarting
            it. Refresh in a moment.
          </InfoAlert>
        </Card>
      </Section>
    );
  }
  const data = props.data;
  if (!data) return null;
  const grabbed: GrabbedArchive[] = data.grabbed ?? [];
  const archives: ArchiveSummary[] = data.archives ?? [];

  return (
    <Section title="What's been ingested">
      {data.ingest_running && (
        <div class="mb-4">
          <InfoAlert>
            A background ingest is running
            {data.ingest?.source
              ? (
                <>
                  for <code>{data.ingest.source}</code>
                </>
              )
              : null}. This page refreshes as archives complete.
          </InfoAlert>
        </div>
      )}

      {grabbed.length > 0 && (
        <div class="mb-6">
          <h3 class="section-title mb-2">Grabbed from a URL</h3>
          <Table
            head={
              <>
                <th>Archive</th>
                <th class="text-right">Filings</th>
                <th class="text-right">Size</th>
                <th class="text-right">When</th>
              </>
            }
          >
            {grabbed.map((g) => (
              <tr key={g.source}>
                <td>
                  <div class="mono text-xs text-navy">
                    {g.filename || g.source}
                  </div>
                  {g.url && (
                    <div class="truncate text-xs text-faint">{g.url}</div>
                  )}
                </td>
                <td class="text-right tabular-nums">
                  {number(g.filings_stored)}
                </td>
                <td class="text-right tabular-nums text-muted">
                  {humanSize(g.content_length)}
                </td>
                <td class="text-right text-xs text-muted">
                  {dateOnly(g.ingested_at)}
                </td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <div>
        <h3 class="section-title mb-2">All source archives</h3>
        {archives.length === 0
          ? (
            <Card>
              <p class="text-sm text-muted">
                Nothing ingested yet. Use{" "}
                <strong class="text-ink">Grab from the IRS website</strong>{" "}
                above, or upload a ZIP.
              </p>
            </Card>
          )
          : (
            <Table
              head={
                <>
                  <th>Source ZIP</th>
                  <th class="text-right">Filings</th>
                  <th class="text-right">Years</th>
                  <th class="text-right">Last ingested</th>
                </>
              }
            >
              {archives.map((a) => (
                <tr key={a.zip_filename ?? "—"}>
                  <td class="mono text-xs text-navy">
                    {a.zip_filename ?? "(direct upload)"}
                  </td>
                  <td class="text-right tabular-nums">{number(a.filings)}</td>
                  <td class="text-right tabular-nums text-muted">
                    {a.first_year === a.last_year
                      ? a.first_year ?? "—"
                      : `${a.first_year}–${a.last_year}`}
                  </td>
                  <td class="text-right text-xs text-muted">
                    {dateOnly(a.last_ingested)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </div>
    </Section>
  );
}
