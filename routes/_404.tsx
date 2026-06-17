import { define } from "../utils.ts";
import { page } from "fresh";

// Render the not-found page with a proper 404 status.
export const handler = define.handlers(() => page(undefined, { status: 404 }));

export default define.page(function NotFound() {
  return (
    <div class="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p class="text-6xl font-bold text-brand-600">404</p>
        <h1 class="mt-2 text-xl font-semibold text-slate-900">
          Page not found
        </h1>
        <p class="mt-1 text-sm text-slate-500">
          The page you’re looking for doesn’t exist.
        </p>
        <a href="/" class="btn btn-primary mt-5">Back home</a>
      </div>
    </div>
  );
});
