import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/templates.tsx";
import { Button } from "../../components/atoms.tsx";
import {
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  Flash,
  InfoAlert,
  OrgIdentity,
  PageHeader,
  Section,
  Table,
} from "../../components/molecules.tsx";
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
    let taggedEins: string[] = [];
    let taggedError: string | undefined;

    // The tag list and the selected tag's members share no input, so fetch them
    // together when a tag is selected (one round-trip phase instead of two).
    const [tagsR, taggedR] = await Promise.allSettled([
      api.tags.list(),
      selectedTag
        ? api.tags.organizations(selectedTag)
        : Promise.resolve({ eins: [] as string[] }),
    ]);

    if (tagsR.status === "fulfilled") {
      tags = tagsR.value.tags ?? [];
    } else {
      const err = tagsR.reason;
      if (err instanceof ApiError && err.status === 401) throw err;
      error = err instanceof Error ? err.message : "Failed to load tags.";
    }

    if (selectedTag) {
      if (taggedR.status === "fulfilled") {
        taggedEins = taggedR.value.eins ?? [];
      } else {
        only(taggedR.reason);
        taggedError = taggedR.reason instanceof Error
          ? taggedR.reason.message
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
        eyebrow="TAG LIBRARY"
        subtitle="Browse organization tags, see what's tagged, and apply or remove tags."
      />

      <Flash msg={data.msg} err={data.err ?? data.error} />

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
            <div class="flex flex-wrap gap-2">
              {data.tags.map((t) => {
                const active = t.name === data.selectedTag;
                return (
                  <a
                    href={`/tags?tag=${encodeURIComponent(t.name)}`}
                    class={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      active
                        ? "border-navy bg-navy text-white"
                        : "border-line bg-white text-muted hover:border-navy/40 hover:text-navy"
                    }`}
                  >
                    <span class="font-semibold">{t.name}</span>
                    <span
                      class={`mono rounded-full px-1.5 text-[11px] ${
                        active ? "bg-white/20" : "bg-brand-50 text-navy"
                      }`}
                    >
                      {t.org_count}
                    </span>
                  </a>
                );
              })}
            </div>
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
                    <th>Organization</th>
                    <th></th>
                  </>
                }
              >
                {data.taggedEins.map((ein) => (
                  <tr>
                    <td>
                      <OrgIdentity
                        ein={ein}
                        name={formatEin(ein)}
                        size={34}
                      />
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
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            title={`Remove "${data.selectedTag}"`}
                          >
                            Remove
                          </Button>
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
                  <Button type="submit" variant="primary">Apply tag</Button>
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
