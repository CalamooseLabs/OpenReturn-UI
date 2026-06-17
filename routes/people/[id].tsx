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
import { formatEin, normalizeEin } from "../../lib/format.ts";
import { can } from "../../lib/auth.ts";
import type { Person } from "../../lib/types.ts";

interface Data {
  id: string;
  person?: Person;
  notFound?: boolean;
  error?: string;
  msg?: string;
  err?: string;
}

export const handler = define.handlers({
  async GET(ctx) {
    const id = ctx.params.id;
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;

    let person: Person | undefined;
    let notFound = false;
    let error: string | undefined;

    try {
      const res = await api.people.detail(id) as Person & { error?: string };
      if (res && typeof res === "object" && res.error) {
        notFound = true;
      } else {
        person = res;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      if (err instanceof ApiError && err.status === 404) {
        notFound = true;
      } else {
        error = err instanceof Error ? err.message : "Failed to load person.";
      }
    }

    return page<Data>({
      id,
      person,
      notFound,
      error,
      msg: sp.get("msg") ?? undefined,
      err: sp.get("err") ?? undefined,
    });
  },

  async POST(ctx) {
    if (!ctx.state.principal) return ctx.redirect("/login");
    const api = ctx.state.api;
    const id = ctx.params.id;
    const personId = parseInt(id, 10);
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const here = `/people/${id}`;

    const ok = (msg: string) =>
      ctx.redirect(`${here}?msg=${encodeURIComponent(msg)}`);
    const fail = (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Request failed.";
      return ctx.redirect(`${here}?err=${encodeURIComponent(msg)}`);
    };

    try {
      switch (action) {
        case "edit": {
          const fullName = String(form.get("full_name") ?? "").trim();
          if (!fullName) {
            return fail(new Error("Full name is required."));
          }
          await api.people.edit({
            person_id: personId,
            full_name: fullName,
            title: String(form.get("title") ?? "").trim(),
            email: String(form.get("email") ?? "").trim(),
            phone: String(form.get("phone") ?? "").trim(),
            notes: String(form.get("notes") ?? "").trim(),
          });
          return ok("Saved.");
        }
        case "delete": {
          await api.people.remove(personId);
          return ctx.redirect("/people?msg=" + encodeURIComponent("Deleted."));
        }
        case "add-membership": {
          const ein = normalizeEin(String(form.get("ein") ?? ""));
          if (!ein) {
            return fail(new Error("An EIN is required."));
          }
          await api.people.addMembership({
            person_id: personId,
            ein,
            role_title: String(form.get("role_title") ?? "").trim(),
            is_primary: form.get("is_primary") === "1",
          });
          return ok("Membership added.");
        }
        case "remove-membership": {
          const ein = normalizeEin(String(form.get("ein") ?? ""));
          await api.people.removeMembership(personId, ein);
          return ok("Membership removed.");
        }
        default:
          return fail(new Error("Unknown action."));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      return fail(err);
    }
  },
});

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const canWrite = can(state.principal, "person:write");

  if (data.notFound) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <EmptyState
          title="Person not found"
          hint="No contact matched that id."
        >
          <LinkButton href="/people" variant="primary">
            Back to people
          </LinkButton>
        </EmptyState>
      </Layout>
    );
  }
  if (!data.person) {
    return (
      <Layout principal={state.principal} path={ctx.url.pathname}>
        <ErrorAlert message={data.error ?? "Failed to load person."} />
      </Layout>
    );
  }

  const p = data.person;
  const memberships = p.memberships ?? [];

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <div class="mb-6">
        <a href="/people" class="link text-sm">← People</a>
        <h1 class="mt-1 text-2xl font-bold text-slate-900">{p.full_name}</h1>
        {p.title && <p class="mt-1 text-sm text-slate-500">{p.title}</p>}
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

      <Section title="Contact">
        <Card>
          <dl class="grid gap-4 sm:grid-cols-2">
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </dt>
              <dd class="mt-1 text-sm text-slate-800">
                {p.email
                  ? <a href={`mailto:${p.email}`} class="link">{p.email}</a>
                  : "—"}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">
                Phone
              </dt>
              <dd class="mt-1 text-sm text-slate-800">{p.phone ?? "—"}</dd>
            </div>
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">
                Title
              </dt>
              <dd class="mt-1 text-sm text-slate-800">{p.title ?? "—"}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-xs font-medium uppercase tracking-wide text-slate-500">
                Notes
              </dt>
              <dd class="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {p.notes ?? "—"}
              </dd>
            </div>
          </dl>
        </Card>
      </Section>

      {canWrite && (
        <Section title="Edit person">
          <Card>
            <form method="POST" class="grid gap-4 md:grid-cols-2 md:items-end">
              <input type="hidden" name="action" value="edit" />
              <Field
                label="Full name"
                name="full_name"
                value={p.full_name}
                required
              />
              <Field label="Title" name="title" value={p.title ?? ""} />
              <Field
                label="Email"
                name="email"
                type="email"
                value={p.email ?? ""}
              />
              <Field label="Phone" name="phone" value={p.phone ?? ""} />
              <div class="md:col-span-2">
                <label class="label" for="notes">Notes</label>
                <textarea id="notes" name="notes" rows={3} class="input">
                  {p.notes ?? ""}
                </textarea>
              </div>
              <div class="md:col-span-2 flex items-center gap-2">
                <button type="submit" class="btn btn-primary">
                  Save changes
                </button>
              </div>
            </form>
          </Card>
          <div class="mt-3">
            <form method="POST">
              <input type="hidden" name="action" value="delete" />
              <button
                type="submit"
                class="btn btn-sm btn-secondary text-red-700"
              >
                Delete person
              </button>
            </form>
          </div>
        </Section>
      )}

      <Section title="Memberships">
        {memberships.length === 0
          ? (
            <EmptyState
              title="No memberships"
              hint={canWrite
                ? "Link this person to an organization below."
                : "This person is not linked to any organization."}
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Organization</th>
                  <th>Role</th>
                  <th>Primary</th>
                  {canWrite && <th></th>}
                </>
              }
            >
              {memberships.map((m) => (
                <tr>
                  <td>
                    <a href={`/orgs/${m.org_ein}`} class="link font-medium">
                      {m.org_name ?? formatEin(m.org_ein)}
                    </a>
                    <div class="text-xs text-slate-400">
                      {formatEin(m.org_ein)}
                    </div>
                  </td>
                  <td class="text-slate-600">{m.role_title ?? "—"}</td>
                  <td>
                    {m.is_primary
                      ? <Badge variant="green">Primary</Badge>
                      : <span class="text-slate-400">—</span>}
                  </td>
                  {canWrite && (
                    <td class="whitespace-nowrap">
                      <form method="POST" class="inline">
                        <input
                          type="hidden"
                          name="action"
                          value="remove-membership"
                        />
                        <input type="hidden" name="ein" value={m.org_ein} />
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

      {canWrite && (
        <Section title="Add membership">
          <Card>
            <form method="POST" class="grid gap-4 md:grid-cols-3 md:items-end">
              <input type="hidden" name="action" value="add-membership" />
              <Field
                label="Organization EIN"
                name="ein"
                placeholder="12-3456789"
                required
              />
              <Field
                label="Role title"
                name="role_title"
                placeholder="Board Chair"
              />
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" name="is_primary" value="1" />
                  Primary affiliation
                </label>
              </div>
              <div class="md:col-span-3">
                <button type="submit" class="btn btn-primary">
                  Add membership
                </button>
              </div>
            </form>
          </Card>
        </Section>
      )}
    </Layout>
  );
});
