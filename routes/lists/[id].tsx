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
  LinkButton,
  Section,
  Table,
} from "../../components/ui.tsx";
import { formatEin, normalizeEin, titleCase } from "../../lib/format.ts";
import { can } from "../../lib/auth.ts";
import type { ListDetail } from "../../lib/types.ts";

interface Data {
  id: string;
  list?: ListDetail;
  notFound?: boolean;
  error?: string;
  msg?: string;
  err?: string;
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
    const id = ctx.params.id;
    const sp = ctx.url.searchParams;

    let list: ListDetail | undefined;
    try {
      list = await api.lists.detail(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      if (err instanceof ApiError && err.status === 404) {
        return page<Data>({ id, notFound: true });
      }
      return page<Data>({
        id,
        error: err instanceof Error ? err.message : "Failed to load list.",
      });
    }
    // A 2xx body may carry a soft { error }.
    if (list && (list as unknown as { error?: string }).error) {
      return page<Data>({ id, notFound: true });
    }

    return page<Data>({
      id,
      list,
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    });
  },

  async POST(ctx) {
    if (!ctx.state.principal) return ctx.redirect("/login");
    const api = ctx.state.api;
    const id = ctx.params.id;
    const listId = parseInt(id, 10);
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const self = `/lists/${encodeURIComponent(id)}`;

    if (!Number.isInteger(listId)) {
      return ctx.redirect(self + "?err=" + encodeURIComponent("Invalid list."));
    }

    try {
      switch (action) {
        case "edit": {
          const name = String(form.get("name") ?? "").trim();
          const visibility = String(form.get("visibility") ?? "").trim();
          const body: Record<string, unknown> = { list_id: listId };
          if (name) body.name = name;
          if (visibility) body.visibility = visibility;
          const res = await api.lists.edit(body) as { error?: string };
          if (res && typeof res === "object" && res.error) {
            return ctx.redirect(self + "?err=" + encodeURIComponent(res.error));
          }
          return ctx.redirect(self + "?msg=" + encodeURIComponent("Saved"));
        }
        case "delete": {
          await api.lists.remove(listId);
          return ctx.redirect("/lists?msg=" + encodeURIComponent("Deleted"));
        }
        case "add-member": {
          const ein = normalizeEin(String(form.get("ein") ?? ""));
          if (!ein) {
            return ctx.redirect(
              self + "?err=" + encodeURIComponent("An EIN is required."),
            );
          }
          const res = await api.lists.addMember(listId, ein) as {
            error?: string;
          };
          if (res && typeof res === "object" && res.error) {
            return ctx.redirect(self + "?err=" + encodeURIComponent(res.error));
          }
          return ctx.redirect(self + "?msg=" + encodeURIComponent("Added"));
        }
        case "remove-member": {
          const ein = normalizeEin(String(form.get("ein") ?? ""));
          await api.lists.removeMember(listId, ein);
          return ctx.redirect(self + "?msg=" + encodeURIComponent("Removed"));
        }
        default:
          return ctx.redirect(
            self + "?err=" + encodeURIComponent("Unknown action."),
          );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Request failed.";
      return ctx.redirect(self + "?err=" + encodeURIComponent(msg));
    }
  },
});

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
];

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const canWrite = can(state.principal, "list:write");

  if (data.notFound) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <EmptyState
          title="List not found"
          hint={`No list with id ${data.id}.`}
        >
          <LinkButton href="/lists" variant="primary">
            Back to lists
          </LinkButton>
        </EmptyState>
      </Layout>
    );
  }
  if (!data.list) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <ErrorAlert message={data.error ?? "Failed to load list."} />
      </Layout>
    );
  }

  const list = data.list;
  const orgs = list.organizations ?? [];

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      {/* Header */}
      <div class="mb-6">
        <a href="/lists" class="link text-sm">← Lists</a>
        <h1 class="mt-1 text-2xl font-bold text-slate-900">{list.name}</h1>
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={visibilityVariant(list.visibility)}>
            {titleCase(list.visibility)}
          </Badge>
          <Badge variant={kindVariant(list.kind)}>
            {titleCase(list.kind)}
          </Badge>
        </div>
      </div>

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

      {canWrite && (
        <Section title="Settings">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="md:col-span-2">
              <Card>
                <form
                  method="POST"
                  class="grid gap-4 sm:grid-cols-2 sm:items-end"
                >
                  <input type="hidden" name="action" value="edit" />
                  <Field
                    label="Name"
                    name="name"
                    value={list.name}
                  />
                  <div class="field">
                    <label class="label" for="visibility">Visibility</label>
                    <select class="select" id="visibility" name="visibility">
                      {VISIBILITY_OPTIONS.map((o) => (
                        <option
                          value={o.value}
                          selected={o.value === list.visibility}
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div class="sm:col-span-2">
                    <button type="submit" class="btn btn-primary">
                      Save changes
                    </button>
                  </div>
                </form>
              </Card>
            </div>
            <Card>
              <div class="section-title mb-2">Danger zone</div>
              <p class="mb-3 text-sm text-slate-500">
                Deleting a list cannot be undone. Member organizations are not
                affected.
              </p>
              <form method="POST">
                <input type="hidden" name="action" value="delete" />
                <button type="submit" class="btn btn-secondary">
                  Delete list
                </button>
              </form>
            </Card>
          </div>
        </Section>
      )}

      <Section title={`Members (${orgs.length})`}>
        {canWrite && (
          <Card class="mb-4">
            <form
              method="POST"
              class="grid gap-4 sm:grid-cols-3 sm:items-end"
            >
              <input type="hidden" name="action" value="add-member" />
              <div class="sm:col-span-2">
                <Field
                  label="Add organization (EIN)"
                  name="ein"
                  placeholder="12-3456789"
                  required
                />
              </div>
              <div>
                <button type="submit" class="btn btn-primary">
                  Add organization
                </button>
              </div>
            </form>
          </Card>
        )}

        {orgs.length === 0
          ? (
            <EmptyState
              title="No organizations"
              hint={canWrite
                ? "Add an organization by EIN above."
                : "This list has no organizations."}
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Organization</th>
                  <th>EIN</th>
                  {canWrite && <th></th>}
                </>
              }
            >
              {orgs.map((o) => (
                <tr>
                  <td>
                    <a href={`/orgs/${o.ein}`} class="link font-medium">
                      {o.name}
                    </a>
                  </td>
                  <td class="tabular-nums text-slate-500">
                    {formatEin(o.ein)}
                  </td>
                  {canWrite && (
                    <td class="whitespace-nowrap text-right">
                      <form method="POST" class="inline">
                        <input
                          type="hidden"
                          name="action"
                          value="remove-member"
                        />
                        <input type="hidden" name="ein" value={o.ein} />
                        <button
                          type="submit"
                          class="btn btn-sm btn-secondary"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </Table>
          )}
      </Section>
    </Layout>
  );
});
