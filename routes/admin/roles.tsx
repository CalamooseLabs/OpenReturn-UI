import { define } from "../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../lib/api/mod.ts";
import { Layout } from "../../components/templates.tsx";
import { Badge, Button, LinkButton } from "../../components/atoms.tsx";
import {
  Card,
  EmptyState,
  ErrorAlert,
  Field,
  Flash,
  PageHeader,
  Section,
  Table,
} from "../../components/molecules.tsx";
import { isAdmin } from "../../lib/auth.ts";
import type { Permission, Role } from "../../lib/types.ts";

const BUILTIN_ROLES = new Set(["admin", "editor", "viewer", "service"]);

interface Data {
  roles: Role[];
  permissions: Permission[];
  apiError?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

function redirectOk(ctx: { redirect: (p: string) => Response }, msg: string) {
  return ctx.redirect(`/admin/roles?msg=${encodeURIComponent(msg)}`);
}

function redirectErr(ctx: { redirect: (p: string) => Response }, err: unknown) {
  const msg = err instanceof Error ? err.message : "Request failed.";
  return ctx.redirect(`/admin/roles?err=${encodeURIComponent(msg)}`);
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!isAdmin(ctx.state.principal)) {
      return page<Data>({ roles: [], permissions: [] });
    }
    const api = ctx.state.api;
    const results = await Promise.allSettled([
      api.admin.listRoles(),
      api.admin.listPermissions(),
    ]);
    for (const r of results) if (r.status === "rejected") bubble401(r.reason);

    const roles = results[0].status === "fulfilled"
      ? results[0].value.roles ?? []
      : [];
    const permissions = results[1].status === "fulfilled"
      ? results[1].value.permissions ?? []
      : [];
    const apiError = results.every((r) => r.status === "rejected")
      ? "Could not reach the OpenReturn API."
      : undefined;

    return page<Data>({ roles, permissions, apiError });
  },

  async POST(ctx) {
    if (!isAdmin(ctx.state.principal)) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const code = String(form.get("code") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const role = String(form.get("role") ?? "").trim();
    const permission = String(form.get("permission") ?? "").trim();

    try {
      switch (action) {
        case "create-role":
          if (!code) {
            return redirectErr(ctx, new Error("Role code is required."));
          }
          await api.admin.createRole({ code, name: name || code, description });
          return redirectOk(ctx, `Created role "${code}".`);
        case "delete-role":
          await api.admin.deleteRole(code);
          return redirectOk(ctx, `Deleted role "${code}".`);
        case "grant":
          if (!role || !permission) {
            return redirectErr(ctx, new Error("Pick a role and a permission."));
          }
          await api.admin.grant(role, permission);
          return redirectOk(ctx, `Granted "${permission}" to "${role}".`);
        case "revoke":
          if (!role || !permission) {
            return redirectErr(ctx, new Error("Pick a role and a permission."));
          }
          await api.admin.revoke(role, permission);
          return redirectOk(ctx, `Revoked "${permission}" from "${role}".`);
        case "create-permission":
          if (!code) {
            return redirectErr(ctx, new Error("Permission code is required."));
          }
          await api.admin.createPermission({ code, description });
          return redirectOk(ctx, `Created permission "${code}".`);
        default:
          return redirectErr(ctx, new Error("Unknown action."));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      return redirectErr(ctx, err);
    }
  },
});

function SubNav(props: { path: string }) {
  const tab = (href: string, label: string) => (
    <a
      href={href}
      class={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        props.path === href
          ? "bg-navy text-white"
          : "border border-line bg-white text-muted hover:border-navy/40 hover:text-navy"
      }`}
    >
      {label}
    </a>
  );
  return (
    <div class="mb-6 flex gap-2">
      {tab("/admin", "Users")}
      {tab("/admin/roles", "Roles & permissions")}
    </div>
  );
}

export default define.page<typeof handler>((ctx) => {
  const { data, state, url } = ctx;

  if (!isAdmin(state.principal)) {
    return (
      <Layout principal={state.principal} path={url.pathname}>
        <Card>
          <h1 class="font-display text-xl font-bold tracking-[-0.01em] text-navy">
            Administrator access required
          </h1>
          <p class="mt-2 text-sm text-muted">
            You need the <code class="text-ink">user:admin</code>{" "}
            permission to manage roles and permissions.
          </p>
          <div class="mt-4">
            <LinkButton href="/" variant="primary">Back home</LinkButton>
          </div>
        </Card>
      </Layout>
    );
  }

  const msg = url.searchParams.get("msg");
  const err = url.searchParams.get("err");
  const roleOptions = data.roles.map((r) => r.code);
  const permOptions = data.permissions.map((p) => p.code);

  return (
    <Layout principal={state.principal} path={url.pathname} wide>
      <SubNav path="/admin/roles" />
      <PageHeader
        eyebrow="Administration"
        title="Roles & permissions"
        subtitle="Define roles, grant permissions, and manage the permission vocabulary."
      />

      <Flash msg={msg} err={err} />
      {data.apiError && (
        <div class="mb-4">
          <ErrorAlert message={data.apiError} />
        </div>
      )}

      <Section title="Create role">
        <Card>
          <form method="POST" class="grid gap-4 md:grid-cols-3 md:items-end">
            <input type="hidden" name="action" value="create-role" />
            <Field label="Code" name="code" placeholder="analyst" required />
            <Field label="Name" name="name" placeholder="Analyst" />
            <Field
              label="Description"
              name="description"
              placeholder="What this role can do"
            />
            <div class="md:col-span-3">
              <Button type="submit" variant="primary">Create role</Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title="Grant or revoke a permission">
        <Card>
          <form method="POST" class="grid gap-4 md:grid-cols-3 md:items-end">
            <div class="field">
              <label class="label" for="role">Role</label>
              <select class="select" id="role" name="role">
                <option value="">Select role…</option>
                {roleOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div class="field">
              <label class="label" for="permission">Permission</label>
              <select class="select" id="permission" name="permission">
                <option value="">Select permission…</option>
                {permOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div class="flex gap-2">
              <Button
                type="submit"
                name="action"
                value="grant"
                variant="primary"
              >
                Grant
              </Button>
              <Button type="submit" name="action" value="revoke">
                Revoke
              </Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title={`Roles (${data.roles.length})`}>
        {data.roles.length === 0
          ? <EmptyState title="No roles" hint="Create the first role above." />
          : (
            <Table
              head={
                <>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Permissions</th>
                  <th>Actions</th>
                </>
              }
            >
              {data.roles.map((r) => (
                <tr>
                  <td class="mono font-semibold text-navy">{r.code}</td>
                  <td class="text-ink">{r.name}</td>
                  <td class="text-muted">{r.description || "—"}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {r.permissions.length === 0
                        ? <span class="text-faint">—</span>
                        : r.permissions.map((p) => (
                          <Badge key={p} variant="gray">{p}</Badge>
                        ))}
                    </div>
                  </td>
                  <td>
                    {BUILTIN_ROLES.has(r.code)
                      ? <span class="mono text-xs text-faint">built-in</span>
                      : (
                        <form method="POST" class="inline">
                          <input
                            type="hidden"
                            name="action"
                            value="delete-role"
                          />
                          <input type="hidden" name="code" value={r.code} />
                          <Button type="submit" size="sm" variant="danger">
                            Delete
                          </Button>
                        </form>
                      )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Section>

      <Section title="Create permission">
        <Card>
          <form method="POST" class="grid gap-4 md:grid-cols-3 md:items-end">
            <input type="hidden" name="action" value="create-permission" />
            <Field label="Code" name="code" placeholder="org:read" required />
            <Field
              label="Description"
              name="description"
              placeholder="What this permission allows"
            />
            <div class="md:col-span-3">
              <Button type="submit" variant="primary">
                Create permission
              </Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title={`Permissions (${data.permissions.length})`}>
        {data.permissions.length === 0
          ? (
            <EmptyState
              title="No permissions"
              hint="Create the first permission above."
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Code</th>
                  <th>Description</th>
                </>
              }
            >
              {data.permissions.map((p) => (
                <tr>
                  <td class="mono font-semibold text-navy">{p.code}</td>
                  <td class="text-muted">{p.description || "—"}</td>
                </tr>
              ))}
            </Table>
          )}
      </Section>
    </Layout>
  );
});
