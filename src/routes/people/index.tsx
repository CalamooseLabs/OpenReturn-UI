import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/templates.tsx";
import { Avatar, Button, TextArea } from "../../components/atoms.tsx";
import {
  Card,
  EmptyState,
  Field,
  Flash,
  PageHeader,
  Pagination,
  Section,
  Table,
} from "../../components/molecules.tsx";
import { can } from "../../lib/auth.ts";
import type { Person } from "../../lib/types.ts";

const LIMIT = 25;

interface Data {
  search: string;
  people: Person[];
  total: number;
  offset: number;
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
    const search = sp.get("search")?.trim() ?? "";
    const offset = Math.max(0, parseInt(sp.get("offset") ?? "0") || 0);

    let people: Person[] = [];
    let total = 0;
    let error: string | undefined;

    try {
      const res = await api.people.list({
        search: search || undefined,
        limit: LIMIT,
        offset,
      });
      people = res.people ?? [];
      total = res.total ?? people.length;
    } catch (err) {
      only(err);
      error = err instanceof Error ? err.message : "Failed to load people.";
    }

    return page<Data>({
      search,
      people,
      total,
      offset,
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
        const fullName = String(form.get("full_name") ?? "").trim();
        if (!fullName) {
          return ctx.redirect(
            "/people?err=" + encodeURIComponent("Full name is required."),
          );
        }
        const body: Record<string, unknown> = { full_name: fullName };
        const title = String(form.get("title") ?? "").trim();
        const email = String(form.get("email") ?? "").trim();
        const phone = String(form.get("phone") ?? "").trim();
        const notes = String(form.get("notes") ?? "").trim();
        if (title) body.title = title;
        if (email) body.email = email;
        if (phone) body.phone = phone;
        if (notes) body.notes = notes;

        const res = await api.people.create(body) as { error?: string };
        if (res && typeof res === "object" && res.error) {
          return ctx.redirect("/people?err=" + encodeURIComponent(res.error));
        }
        return ctx.redirect(
          "/people?msg=" + encodeURIComponent(`Created "${fullName}".`),
        );
      }
      return ctx.redirect(
        "/people?err=" + encodeURIComponent("Unknown action."),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Request failed.";
      return ctx.redirect("/people?err=" + encodeURIComponent(msg));
    }
  },
});

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const canWrite = can(state.principal, "person:write");

  const makeHref = (offset: number) => {
    const sp = new URLSearchParams();
    if (data.search) sp.set("search", data.search);
    sp.set("offset", String(offset));
    return `/people?${sp.toString()}`;
  };

  return (
    <Layout principal={state.principal} path={ctx.url.pathname} wide>
      <PageHeader
        title="People"
        eyebrow="PEOPLE DIRECTORY"
        subtitle="Track contacts and their organization memberships."
      />

      <Flash msg={data.msg} err={data.err ?? data.error} />

      <form method="GET" class="card card-pad mb-6">
        <div class="flex flex-wrap items-end gap-4">
          <div class="grow">
            <label class="label" for="search">Search</label>
            <input
              class="input"
              id="search"
              name="search"
              value={data.search}
              placeholder="Name, email, or title…"
            />
          </div>
          <div class="flex gap-2">
            <Button type="submit" variant="primary">Search</Button>
            <a href="/people" class="btn btn-secondary">Clear</a>
          </div>
        </div>
      </form>

      {canWrite && (
        <Section title="Add person">
          <Card>
            <form method="POST" class="grid gap-4 md:grid-cols-2 md:items-end">
              <input type="hidden" name="action" value="create" />
              <Field
                label="Full name"
                name="full_name"
                placeholder="Jane Doe"
                required
              />
              <Field
                label="Title"
                name="title"
                placeholder="Executive Director"
              />
              <Field
                label="Email"
                name="email"
                type="email"
                placeholder="jane@example.org"
              />
              <Field label="Phone" name="phone" placeholder="555-123-4567" />
              <div class="md:col-span-2">
                <label class="label" for="notes">Notes</label>
                <TextArea
                  id="notes"
                  name="notes"
                  rows={3}
                  placeholder="Optional notes…"
                />
              </div>
              <div class="md:col-span-2">
                <Button type="submit" variant="primary">Add person</Button>
              </div>
            </form>
          </Card>
        </Section>
      )}

      <Section title={`Contacts (${data.total})`}>
        {data.people.length === 0
          ? (
            <EmptyState
              title="No people found"
              hint={data.search
                ? "Try a different search."
                : canWrite
                ? "Add the first contact above."
                : "No contacts have been recorded yet."}
            />
          )
          : (
            <>
              <Table
                head={
                  <>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Email</th>
                    <th>Phone</th>
                  </>
                }
              >
                {data.people.map((p) => (
                  <tr>
                    <td>
                      <a
                        href={`/people/${p.person_id}`}
                        class="flex items-center gap-3"
                      >
                        <Avatar label={p.full_name} size={34} shape="circle" />
                        <span class="font-bold text-navy">{p.full_name}</span>
                      </a>
                    </td>
                    <td class="text-muted">{p.title ?? "—"}</td>
                    <td class="text-muted">
                      {p.email
                        ? (
                          <a href={`mailto:${p.email}`} class="link">
                            {p.email}
                          </a>
                        )
                        : "—"}
                    </td>
                    <td class="text-muted">{p.phone ?? "—"}</td>
                  </tr>
                ))}
              </Table>
              <Pagination
                total={data.total}
                limit={LIMIT}
                offset={data.offset}
                makeHref={makeHref}
              />
            </>
          )}
      </Section>
    </Layout>
  );
});
