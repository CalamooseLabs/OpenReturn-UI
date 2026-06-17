import type { Principal } from "../lib/types.ts";
import { can, displayName, isAdmin, isLoggedIn } from "../lib/auth.ts";

const LINKS = [
  { href: "/", label: "Home", exact: true },
  { href: "/search", label: "Search" },
  { href: "/reports", label: "Reports" },
  { href: "/models", label: "Models" },
  { href: "/compare", label: "Compare" },
];

const DATA_LINKS = [
  { href: "/lists", label: "Lists" },
  { href: "/people", label: "People" },
  { href: "/tags", label: "Tags" },
  { href: "/financials", label: "Financials" },
];

function active(path: string, href: string, exact?: boolean): boolean {
  if (exact) return path === href;
  return path === href || path.startsWith(href + "/");
}

export function Nav(props: { principal: Principal | null; path: string }) {
  const dataLinks = [...DATA_LINKS];
  if (can(props.principal, "upload:write")) {
    dataLinks.push({ href: "/upload", label: "Upload" });
  }
  const dataActive = dataLinks.some((l) => active(props.path, l.href));

  return (
    <header class="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav class="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4">
        <a
          href="/"
          class="mr-4 flex items-center gap-2 font-bold text-slate-900"
        >
          <span class="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm text-white">
            OR
          </span>
          <span class="hidden sm:inline">OpenReturn</span>
        </a>
        <div class="flex items-center gap-0.5">
          {LINKS.map((l) => (
            <a
              href={l.href}
              class={`nav-link ${
                active(props.path, l.href, l.exact) ? "nav-link-active" : ""
              }`}
            >
              {l.label}
            </a>
          ))}
          {isLoggedIn(props.principal) && (
            <details class="relative">
              <summary
                class={`nav-link cursor-pointer ${
                  dataActive ? "nav-link-active" : ""
                }`}
              >
                Data ▾
              </summary>
              <div class="absolute left-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {dataLinks.map((l) => (
                  <a
                    href={l.href}
                    class={`block px-3 py-2 text-sm hover:bg-slate-100 ${
                      active(props.path, l.href)
                        ? "font-medium text-brand-700"
                        : "text-slate-700"
                    }`}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </details>
          )}
          {isAdmin(props.principal) && (
            <a
              href="/admin"
              class={`nav-link ${
                active(props.path, "/admin") ? "nav-link-active" : ""
              }`}
            >
              Admin
            </a>
          )}
        </div>
        <div class="ml-auto flex items-center gap-2">
          {isLoggedIn(props.principal)
            ? (
              <>
                <span class="hidden text-sm text-slate-500 sm:inline">
                  {displayName(props.principal)}
                </span>
                <form method="POST" action="/logout">
                  <button type="submit" class="btn btn-sm btn-secondary">
                    Sign out
                  </button>
                </form>
              </>
            )
            : <a href="/login" class="btn btn-sm btn-primary">Sign in</a>}
        </div>
      </nav>
    </header>
  );
}
