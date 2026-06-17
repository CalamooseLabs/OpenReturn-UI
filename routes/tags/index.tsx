import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/Layout.tsx";
import {
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  InfoAlert,
  PageHeader,
  Section,
  Table,
} from "../../components/ui.tsx";
import { formatEin, normalizeEin } from "../../lib/format.ts";
import { can } from "../../lib/auth.ts";
import type { TagInfo } from "../../lib/types.ts";

interface Data {
  tags: TagInfo[];
  selectedTag?: string;
  taggedEins: string[];
  taggedError?: string;
  error?: string;
  msg?: string;
  err?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const selectedTag = sp.get("tag")?.trim() || undefined;

    let tags: TagInfo[] = [];
    let error: string | undefined;
    try {
      const res = await api.tags.list();
      tags = res.tags ?? [];
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      error = err instanceof Error ? err.message : "Failed to load tags.";
    }

    let taggedEins: string[] = [];
    let taggedError: string | undefined;
    if (selectedTag) {
      try {
        const res = await api.tags.organizations(selectedTag);
        taggedEins = res.eins ?? [];
      } catch (err) {
        only(err);
        taggedError = err instanceof Error
          ? err.message
          : "Failed to load tagged organizations.";
      }
    }

    return page<Data>({
      tags,
      selectedTag,
      taggedEins,
      taggedError,
      error,
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    });
  },

  async POST(ctx) {
    if (!ctx.state.principal) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const ein = normalizeEin(String(form.get("ein") ?? ""));
    const tag = String(form.get("tag") ?? "").trim();

    const back = (extra: string) =>
      ctx.redirect(
        `/tags?${tag ? `tag=${encodeURIComponent(tag)}&` : ""}${extra}`,
      );

    if (!ein || !tag) {
      return back("err=" + encodeURIComponent("EIN and tag are required."));
    }

    try {
      if (action === "apply") {
        await api.tags.apply(ein, tag);
        return back(
          "msg=" +
            encodeURIComponent(`Tagged ${formatEin(ein)} with "${tag}".`),
        );
      } else if (action === "remove") {
        await api.tags.remove(ein, tag);
        return back(
          "msg=" +
            encodeURIComponent(`Removed "${tag}" from ${formatEin(ein)}.`),
        );
      }
      return back("err=" + encodeURIComponent("Unknown action."));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Request failed.";
      return back("err=" + encodeURIComponent(msg));
    }
  },
});

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const canWrite = can(state.principal, "tag:write");

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Tags"
        subtitle="Browse organization tags, see what's tagged, and apply or remove tags."
      />

      {data.msg && (
        <div class="mb-4">
          <InfoAlert>{data.msg}</InfoAlert>
        </div>
      )}
      {data.err && (
        <div class="mb-4">
          <ErrorAlert message={data.err} />
        </div>
      )}
      {data.error && (
        <div class="mb-4">
          <ErrorAlert message={data.error} />
        </div>
      )}

      {/* All tags */}
      <Section title={`All tags (${data.tags.length})`}>
        {data.tags.length === 0
          ? (
            <EmptyState
              title="No tags yet"
              hint={canWrite
                ? "Apply a tag to an organization below to get started."
                : "No organizations have been tagged."}
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Tag</th>
                  <th>Organizations</th>
                </>
              }
            >
              {data.tags.map((t) => (
                <tr>
                  <td>
                    <a
                      href={`/tags?tag=${encodeURIComponent(t.name)}`}
                      class={`link font-medium ${
                        t.name === data.selectedTag ? "font-bold" : ""
                      }`}
                    >
                      {t.name}
                    </a>
                  </td>
                  <td>
                    <Badge variant="blue">{t.org_count}</Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {/* Organizations for the selected tag */}
      {data.selectedTag && (
        <Section
          title={`Organizations tagged "${data.selectedTag}"`}
          actions={<a href="/tags" class="link text-sm">Clear selection</a>}
        >
          {data.taggedError
            ? <ErrorAlert message={data.taggedError} />
            : data.taggedEins.length === 0
            ? (
              <EmptyState
                title="No organizations"
                hint={`Nothing is tagged "${data.selectedTag}" yet.`}
              />
            )
            : (
              <Table
                head={
                  <>
                    <th>Organization (EIN)</th>
                    <th></th>
                  </>
                }
              >
                {data.taggedEins.map((ein) => (
                  <tr>
                    <td>
                      <a
                        href={`/orgs/${ein}`}
                        class="link font-medium tabular-nums"
                      >
                        {formatEin(ein)}
                      </a>
                    </td>
                    <td class="text-right">
                      {canWrite && (
                        <form method="POST" class="inline">
                          <input type="hidden" name="action" value="remove" />
                          <input type="hidden" name="ein" value={ein} />
                          <input
                            type="hidden"
                            name="tag"
                            value={data.selectedTag}
                          />
                          <button
                            type="submit"
                            class="btn btn-sm btn-secondary"
                            title={`Remove "${data.selectedTag}"`}
                          >
                            Remove
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
        </Section>
      )}

      {/* Apply a tag */}
      {canWrite
        ? (
          <Section title="Apply a tag">
            <Card>
              <form
                method="POST"
                class="grid gap-4 md:grid-cols-3 md:items-end"
              >
                <input type="hidden" name="action" value="apply" />
                <Field
                  label="EIN"
                  name="ein"
                  placeholder="12-3456789"
                  required
                />
                <Field
                  label="Tag"
                  name="tag"
                  value={data.selectedTag ?? ""}
                  placeholder="e.g. portfolio"
                  required
                />
                <div>
                  <button type="submit" class="btn btn-primary">
                    Apply tag
                  </button>
                </div>
              </form>
            </Card>
          </Section>
        )
        : (
          <div class="mt-4">
            <InfoAlert>
              Sign in with the <code>tag:write</code>{" "}
              permission to apply or remove tags.
            </InfoAlert>
          </div>
        )}
    </Layout>
  );
});
