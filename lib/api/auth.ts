import { ApiResource } from "./client.ts";
import type { LoginResponse, Principal } from "../types.ts";

/** /auth* — session login / identity / logout. */
export class AuthApi extends ApiResource {
  login(username: string, password: string) {
    return this.post<LoginResponse>("/auth/login", { username, password });
  }
  /**
   * The current principal. NOTE: against a backend without `--auth` this
   * returns HTTP 200 `{error:"not authenticated"}` (it does NOT throw) — callers
   * must check for a real `permissions` array. See routes/login.tsx.
   */
  me() {
    return this.get<Principal>("/auth/me");
  }
  logout() {
    return this.post("/auth/logout");
  }
}
