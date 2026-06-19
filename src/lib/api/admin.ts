import { ApiResource } from "./client.ts";
import type { ModelSummary, Permission, Role, UserAccount } from "../types.ts";

/** /admin* — user / role / permission administration and model creation. */
export class AdminApi extends ApiResource {
  // Models
  listModels() {
    return this.get<{ models: ModelSummary[] }>("/admin/models");
  }
  createModel(body: {
    definition: unknown;
    dry_run?: boolean;
    skip_existing?: boolean;
  }) {
    return this.post<Record<string, unknown>>("/admin/models", body);
  }
  /** Full editable {model, factor} definition for a model (load-for-edit). */
  modelDefinition(version: string) {
    return this.get<{ version: string; definition: unknown; error?: string }>(
      "/admin/models/definition",
      { version },
    );
  }
  /** Update an existing model's definition in place (edit). */
  updateModel(body: { definition: unknown; dry_run?: boolean }) {
    return this.post<Record<string, unknown>>("/admin/models/update", body);
  }
  /** Archive (retire) or un-archive a model (reversible; excludes it from scoring). */
  archiveModel(version: string, archived: boolean) {
    return this.post<Record<string, unknown>>("/admin/models/archive", {
      version,
      archived,
    });
  }
  /** Hard-delete a model (blocked if depended on, or if it has stored scores). */
  deleteModel(version: string) {
    return this.post<Record<string, unknown>>("/admin/models/delete", {
      version,
    });
  }

  // Users
  listUsers() {
    return this.get<{ users: UserAccount[] }>("/admin/users");
  }
  createUser(body: { username: string; password?: string; roles?: string[] }) {
    return this.post<Record<string, unknown>>("/admin/users", body);
  }
  activateUser(username: string) {
    return this.post("/admin/users/activate", { username });
  }
  deactivateUser(username: string) {
    return this.post("/admin/users/deactivate", { username });
  }
  assignRole(username: string, role: string) {
    return this.post("/admin/users/assign-role", { username, role });
  }
  revokeRole(username: string, role: string) {
    return this.post("/admin/users/revoke-role", { username, role });
  }
  resetPassword(username: string) {
    return this.post<Record<string, unknown>>("/admin/users/reset-password", {
      username,
    });
  }

  // Roles
  listRoles() {
    return this.get<{ roles: Role[] }>("/admin/roles");
  }
  createRole(body: { code: string; name: string; description?: string }) {
    return this.post("/admin/roles", body);
  }
  deleteRole(code: string) {
    return this.post("/admin/roles/delete", { code });
  }
  grant(role: string, permission: string) {
    return this.post("/admin/roles/grant", { role, permission });
  }
  revoke(role: string, permission: string) {
    return this.post("/admin/roles/revoke", { role, permission });
  }

  // Permissions
  listPermissions() {
    return this.get<{ permissions: Permission[] }>("/admin/permissions");
  }
  createPermission(body: { code: string; description?: string }) {
    return this.post("/admin/permissions", body);
  }
}
