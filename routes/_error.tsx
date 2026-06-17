import { define } from "../utils.ts";
import { HttpError } from "fresh";

export default define.page(function ErrorPage(ctx) {
  const error = ctx.error;
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error
    ? error.message
    : "Something went wrong.";
  return (
    <div class="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <p class="text-6xl font-bold text-red-500">{status}</p>
        <h1 class="mt-2 text-xl font-semibold text-slate-900">
          {status === 500 ? "Server error" : "Request failed"}
        </h1>
        <p class="mt-1 max-w-md text-sm text-slate-500">{message}</p>
        <a href="/" class="btn btn-primary mt-5">Back home</a>
      </div>
    </div>
  );
});
