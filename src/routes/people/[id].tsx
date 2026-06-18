import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/templates.tsx";
import {
  Avatar,
  Badge,
  Button,
  LinkButton,
  TextArea,
} from "../../components/atoms.tsx";
import {
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  Flash,
  OrgIdentity,
  Section,
  Table,
} from "../../components/molecules.tsx";
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
      <div class="mb-7">
        <a href="/people" class="link mono text-xs">← PEOPLE DIRECTORY</a>
        <div class="mt-2 flex items-center gap-4">
          <Avatar label={p.full_name} size={52} shape="circle" />
          <div>
            <h1 class="font-display text-[30px] font-bold tracking-[-0.025em] text-navy">
              {p.full_name}
            </h1>
            {p.title && <p class="mt-0.5 text-muted">{p.title}</p>}
          </div>
        </div>
      </div>

      <Flash msg={data.msg} err={data.err} />

      <Section title="Contact">
        <Card>
          <dl class="grid gap-5 sm:grid-cols-2">
            <div>
              <dt class="section-title">Email</dt>
              <dd class="mt-1.5 text-sm text-ink">
                {p.email
                  ? <a href={`mailto:${p.email}`} class="link">{p.email}</a>
                  : "—"}
              </dd>
            </div>
            <div>
              <dt class="section-title">Phone</dt>
              <dd class="mt-1.5 text-sm text-ink">{p.phone ?? "—"}</dd>
            </div>
            <div>
              <dt class="section-title">Title</dt>
              <dd class="mt-1.5 text-sm text-ink">{p.title ?? "—"}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="section-title">Notes</dt>
              <dd class="mt-1.5 whitespace-pre-wrap text-sm text-ink">
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
                <TextArea
                  id="notes"
                  name="notes"
                  rows={3}
                  value={p.notes ?? ""}
                />
              </div>
              <div class="md:col-span-2 flex items-center gap-2">
                <Button type="submit" variant="primary">Save changes</Button>
              </div>
            </form>
          </Card>
          <div class="mt-3">
            <form method="POST">
              <input type="hidden" name="action" value="delete" />
              <Button type="submit" variant="danger" size="sm">
                Delete person
              </Button>
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
                    <OrgIdentity
                      ein={m.org_ein}
                      name={m.org_name ?? formatEin(m.org_ein)}
                      location={formatEin(m.org_ein)}
                      size={34}
                    />
                  </td>
                  <td class="text-muted">{m.role_title ?? "—"}</td>
                  <td>
                    {m.is_primary
                      ? <Badge variant="green">Primary</Badge>
                      : <span class="text-faint">—</span>}
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
                        <Button type="submit" variant="secondary" size="sm">
                          Remove
                        </Button>
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
                <label class="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" name="is_primary" value="1" />
                  Primary affiliation
                </label>
              </div>
              <div class="md:col-span-3">
                <Button type="submit" variant="primary">Add membership</Button>
              </div>
            </form>
          </Card>
        </Section>
      )}
    </Layout>
  );
});
