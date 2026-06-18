import { defineConfig } from "vite";
import { fresh } from "@fresh/plugin-vite";
import tailwindcss from "@tailwindcss/vite";

// The app code lives under src/ (config/build files stay at the repo root, like
// the OpenReturn backend). The Vite root stays the repo root so the build output
// (_fresh/) and deno.json resolve from here; the Fresh plugin is pointed at src/.
export default defineConfig({
  plugins: [
    fresh({
      serverEntry: "src/main.ts",
      clientEntry: "src/client.ts",
      routeDir: "src/routes",
      islandsDir: "src/islands",
      staticDir: "src/static",
    }),
    tailwindcss(),
  ],
});
