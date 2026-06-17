{ pkgs }:
let
  # Convenience wrappers around the deno tasks (see deno.json).
  dev = pkgs.writeShellScriptBin "dev" ''
    # Start the Fresh dev server (Vite, hot reload) on http://localhost:8000.
    # Point it at the API with OPENRETURN_API_URL (default http://localhost:8080).
    exec deno task dev "''${@}"
  '';
  build = pkgs.writeShellScriptBin "build" ''
    exec deno task build "''${@}"
  '';
  serve = pkgs.writeShellScriptBin "serve" ''
    # Run the production build (deno task build must have run first).
    exec deno task start "''${@}"
  '';
  check = pkgs.writeShellScriptBin "check" ''
    exec deno task check "''${@}"
  '';
  test = pkgs.writeShellScriptBin "test" ''
    exec deno task test "''${@}"
  '';
in
  pkgs.mkShell {
    packages = [
      pkgs.deno
      pkgs.claude-code
      dev
      build
      serve
      check
      test
    ];

    # The frontend talks to the OpenReturn API; override per shell as needed.
    OPENRETURN_API_URL = "http://localhost:8080";

    shellHook = ''
      echo "OpenReturn-UI dev shell — deno $(deno --version | head -n1 | cut -d' ' -f2)"
      echo "  dev    → deno task dev    (Fresh dev server, http://localhost:8000)"
      echo "  build  → deno task build  (production build into ./_fresh)"
      echo "  serve  → deno task start  (serve the production build)"
      echo "  check  → deno fmt+lint+type-check"
      echo "  API    → OPENRETURN_API_URL=$OPENRETURN_API_URL"
    '';
  }
