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
import { dateOnly, titleCase } from "../../lib/format.ts";
import { can } from "../../lib/auth.ts";
import type { ListSummary } from "../../lib/types.ts";

interface Data {
  lists: ListSummary[];
  error?: string;
  msg?: string;
  err?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function only(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

function visibilityVariant(v: string): "gray" | "blue" | "green" | "amber" {
  return v === "public" ? "green" : "gray";
}

function kindVariant(k: string): "gray" | "blue" | "green" | "amber" {
  return k === "smart" ? "amber" : "blue";
}

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;

    let lists: ListSummary[] = [];
    let error: string | undefined;
    try {
      const res = await api.lists.list();
      lists = res.lists ?? [];
    } catch (err) {
      only(err);
      error = err instanceof Error ? err.message : "Failed to load lists.";
    }

    return page<Data>({
      lists,
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

    try {
      if (action === "create") {
        const name = String(form.get("name") ?? "").trim();
        if (!name) {
          return ctx.redirect(
            "/lists?err=" + encodeURIComponent("List name is required."),
          );
        }
        const visibility = String(form.get("visibility") ?? "private").trim();
        const kind = String(form.get("kind") ?? "static").trim();
        const res = await api.lists.create({ name, visibility, kind }) as {
          error?: string;
        };
        if (res && typeof res === "object" && res.error) {
          return ctx.redirect("/lists?err=" + encodeURIComponent(res.error));
        }
        return ctx.redirect("/lists?msg=" + encodeURIComponent("Created"));
      }
      return ctx.redirect(
        "/lists?err=" + encodeURIComponent("Unknown action."),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Request failed.";
      return ctx.redirect("/lists?err=" + encodeURIComponent(msg));
    }
  },
});

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];

const KIND_OPTIONS = [
  { value: "static", label: "Static" },
  { value: "smart", label: "Smart" },
];

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const canWrite = can(state.principal, "list:write");

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="Lists"
        subtitle="Group organizations into curated or smart collections."
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

      {canWrite && (
        <Section title="Create list">
          <Card>
            <form method="POST" class="grid gap-4 md:grid-cols-3 md:items-end">
              <input type="hidden" name="action" value="create" />
              <Field
                label="Name"
                name="name"
                placeholder="e.g. Education funders"
                required
              />
              <div class="field">
                <label class="label" for="visibility">Visibility</label>
                <select class="select" id="visibility" name="visibility">
                  {VISIBILITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div class="field">
                <label class="label" for="kind">Kind</label>
                <select class="select" id="kind" name="kind">
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div class="md:col-span-3">
                <button type="submit" class="btn btn-primary">
                  Create list
                </button>
              </div>
            </form>
          </Card>
        </Section>
      )}

      <Section title={`Lists (${data.lists.length})`}>
        {data.lists.length === 0
          ? (
            <EmptyState
              title="No lists"
              hint={canWrite
                ? "Create your first list above."
                : "No lists are available to view."}
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Name</th>
                  <th>Visibility</th>
                  <th>Kind</th>
                  <th>Created</th>
                </>
              }
            >
              {data.lists.map((l) => (
                <tr>
                  <td>
                    <a
                      href={`/lists/${l.list_id}`}
                      class="link font-medium"
                    >
                      {l.name}
                    </a>
                  </td>
                  <td>
                    <Badge variant={visibilityVariant(l.visibility)}>
                      {titleCase(l.visibility)}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant={kindVariant(l.kind)}>
                      {titleCase(l.kind)}
                    </Badge>
                  </td>
                  <td class="text-slate-500">{dateOnly(l.created_at)}</td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      {!canWrite && (
        <div class="mt-4">
          <InfoAlert>
            Sign in with list permissions to create and manage lists.
          </InfoAlert>
        </div>
      )}
    </Layout>
  );
});
