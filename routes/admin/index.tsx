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
import { dateOnly } from "../../lib/format.ts";
import { isAdmin } from "../../lib/auth.ts";
import type { Role, UserAccount } from "../../lib/types.ts";

interface Data {
  users: UserAccount[];
  roles: Role[];
  apiError?: string;
}

/** Re-throw a 401 so the middleware redirects to /login; swallow the rest. */
function bubble401(reason: unknown) {
  if (reason instanceof ApiError && reason.status === 401) throw reason;
}

function redirectOk(ctx: { redirect: (p: string) => Response }, msg: string) {
  return ctx.redirect(`/admin?msg=${encodeURIComponent(msg)}`);
}

function redirectErr(ctx: { redirect: (p: string) => Response }, err: unknown) {
  const msg = err instanceof Error ? err.message : "Request failed.";
  return ctx.redirect(`/admin?err=${encodeURIComponent(msg)}`);
}

/** Pull a temp/generated password out of a mutation response, if present. */
function tempPassword(res: unknown): string | null {
  if (res && typeof res === "object") {
    const r = res as Record<string, unknown>;
    for (const k of ["password", "temp_password", "temporary_password"]) {
      if (typeof r[k] === "string" && r[k]) return r[k] as string;
    }
  }
  return null;
}

export const handler = define.handlers({
  async GET(ctx) {
    if (!isAdmin(ctx.state.principal)) {
      return page<Data>({ users: [], roles: [] });
    }
    const api = ctx.state.api;
    const results = await Promise.allSettled([
      api.admin.listUsers(),
      api.admin.listRoles(),
    ]);
    for (const r of results) if (r.status === "rejected") bubble401(r.reason);

    const users = results[0].status === "fulfilled"
      ? results[0].value.users ?? []
      : [];
    const roles = results[1].status === "fulfilled"
      ? results[1].value.roles ?? []
      : [];
    const apiError = results.every((r) => r.status === "rejected")
      ? "Could not reach the OpenReturn API."
      : undefined;

    return page<Data>({ users, roles, apiError });
  },

  async POST(ctx) {
    if (!isAdmin(ctx.state.principal)) return ctx.redirect("/login");
    const api = ctx.state.api;
    const form = await ctx.req.formData();
    const action = String(form.get("action") ?? "");
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "").trim();
    const role = String(form.get("role") ?? "").trim();

    try {
      switch (action) {
        case "create": {
          if (!username) {
            return redirectErr(ctx, new Error("Username is required."));
          }
          const body: {
            username: string;
            password?: string;
            roles?: string[];
          } = { username };
          if (password) body.password = password;
          if (role) body.roles = [role];
          const res = await api.admin.createUser(body);
          const pw = tempPassword(res);
          return redirectOk(
            ctx,
            pw
              ? `Created user "${username}". Temp password: ${pw}`
              : `Created user "${username}".`,
          );
        }
        case "activate":
          await api.admin.activateUser(username);
          return redirectOk(ctx, `Activated "${username}".`);
        case "deactivate":
          await api.admin.deactivateUser(username);
          return redirectOk(ctx, `Deactivated "${username}".`);
        case "assign-role":
          if (!role) {
            return redirectErr(ctx, new Error("Pick a role to assign."));
          }
          await api.admin.assignRole(username, role);
          return redirectOk(ctx, `Assigned "${role}" to "${username}".`);
        case "revoke-role":
          if (!role) {
            return redirectErr(ctx, new Error("Pick a role to revoke."));
          }
          await api.admin.revokeRole(username, role);
          return redirectOk(ctx, `Revoked "${role}" from "${username}".`);
        case "reset-password": {
          const res = await api.admin.resetPassword(username);
          const pw = tempPassword(res);
          return redirectOk(
            ctx,
            pw
              ? `Reset password for "${username}". Temp password: ${pw}`
              : `Reset password for "${username}".`,
          );
        }
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
            permission to manage users.
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

  return (
    <Layout principal={state.principal} path={url.pathname} wide>
      <SubNav path="/admin" />
      <PageHeader
        eyebrow="Administration"
        title="Users"
        subtitle="Create accounts, manage roles, and reset passwords."
      />

      <Flash msg={msg} err={err} />
      {data.apiError && (
        <div class="mb-4">
          <ErrorAlert message={data.apiError} />
        </div>
      )}

      <Section title="Create user">
        <Card>
          <form method="POST" class="grid gap-4 md:grid-cols-3 md:items-end">
            <input type="hidden" name="action" value="create" />
            <Field
              label="Username"
              name="username"
              placeholder="jdoe"
              required
            />
            <Field
              label="Password"
              name="password"
              type="password"
              placeholder="auto-generate if blank"
            />
            <div class="field">
              <label class="label" for="role">Role</label>
              <select class="select" id="role" name="role">
                <option value="">No role</option>
                {roleOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div class="md:col-span-3">
              <Button type="submit" variant="primary">Create user</Button>
            </div>
          </form>
        </Card>
      </Section>

      <Section title={`Accounts (${data.users.length})`}>
        {data.users.length === 0
          ? (
            <EmptyState
              title="No users"
              hint="Create the first account above."
            />
          )
          : (
            <Table
              head={
                <>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Roles</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </>
              }
            >
              {data.users.map((u) => (
                <tr>
                  <td class="font-medium text-navy">
                    {u.username}
                    <div class="mono text-xs text-faint">
                      since {dateOnly(u.created_at)}
                    </div>
                  </td>
                  <td>
                    <Badge variant={u.is_active ? "green" : "red"}>
                      {u.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {u.roles.length === 0
                        ? <span class="text-faint">—</span>
                        : u.roles.map((r) => (
                          <form method="POST" class="inline-flex items-center">
                            <input
                              type="hidden"
                              name="action"
                              value="revoke-role"
                            />
                            <input
                              type="hidden"
                              name="username"
                              value={u.username}
                            />
                            <input type="hidden" name="role" value={r} />
                            <button
                              type="submit"
                              class="badge badge-blue hover:opacity-80"
                              title={`Revoke ${r}`}
                            >
                              {r} ✕
                            </button>
                          </form>
                        ))}
                    </div>
                  </td>
                  <td class="text-muted">
                    {u.last_login_at ? dateOnly(u.last_login_at) : "—"}
                  </td>
                  <td>
                    <div class="flex flex-wrap items-center gap-2">
                      <form method="POST" class="inline">
                        <input
                          type="hidden"
                          name="action"
                          value={u.is_active ? "deactivate" : "activate"}
                        />
                        <input
                          type="hidden"
                          name="username"
                          value={u.username}
                        />
                        <Button type="submit" size="sm">
                          {u.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                      <form method="POST" class="inline">
                        <input
                          type="hidden"
                          name="action"
                          value="reset-password"
                        />
                        <input
                          type="hidden"
                          name="username"
                          value={u.username}
                        />
                        <Button type="submit" size="sm">
                          Reset password
                        </Button>
                      </form>
                      <form
                        method="POST"
                        class="inline-flex items-center gap-1"
                      >
                        <input
                          type="hidden"
                          name="action"
                          value="assign-role"
                        />
                        <input
                          type="hidden"
                          name="username"
                          value={u.username}
                        />
                        <select class="select w-auto py-1 text-xs" name="role">
                          <option value="">Add role…</option>
                          {roleOptions.map((code) => (
                            <option key={code} value={code}>{code}</option>
                          ))}
                        </select>
                        <Button type="submit" size="sm">
                          Assign
                        </Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Section>
    </Layout>
  );
});
