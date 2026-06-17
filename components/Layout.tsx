import type { ComponentChildren } from "preact";
import type { Principal } from "../lib/types.ts";
import { Nav } from "./Nav.tsx";

/** Standard page shell: top nav + centered content container. */
export function Layout(
  props: {
    principal: Principal | null;
    path: string;
    children: ComponentChildren;
    wide?: boolean;
  },
) {
  return (
    <div class="min-h-screen">
      <Nav principal={props.principal} path={props.path} />
      <main
        class={`mx-auto px-4 py-8 ${props.wide ? "max-w-7xl" : "max-w-6xl"}`}
      >
        {props.children}
      </main>
    </div>
  );
}
