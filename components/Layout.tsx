import type { ComponentChildren } from "preact";
import type { Principal } from "../lib/types.ts";
import { Nav } from "./Nav.tsx";

/**
 * Standard page shell: navy top nav + centered content container.
 * `bleed` renders children full-width (no container) for pages with their own
 * full-bleed sections, e.g. the org-profile navy hero.
 */
export function Layout(
  props: {
    principal: Principal | null;
    path: string;
    children: ComponentChildren;
    wide?: boolean;
    bleed?: boolean;
  },
) {
  return (
    <div class="min-h-screen">
      <Nav principal={props.principal} path={props.path} />
      {props.bleed ? props.children : (
        <main
          class={`mx-auto px-9 py-9 ${
            props.wide ? "max-w-[1340px]" : "max-w-[1180px]"
          }`}
        >
          {props.children}
        </main>
      )}
    </div>
  );
}
