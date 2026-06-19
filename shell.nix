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
  # Sign + apply the staged commit message in GIT_COMMIT_MSG (the user signs with a
  # security token). Mirrors the OpenReturn backend's gcommit so the UI repo is
  # self-contained rather than relying on the command being ambiently on PATH.
  gcommit = pkgs.writeShellScriptBin "gcommit" ''
    msg_file="GIT_COMMIT_MSG"

    if [[ ! -f "$msg_file" ]] || [[ ! -s "$msg_file" ]]; then
      echo "Error: $msg_file is missing or empty. Nothing to commit." >&2
      exit 1
    fi

    echo ""
    echo "=== Commit message (from $msg_file) ==="
    cat "$msg_file"
    echo "========================================"
    echo ""
    read -r -p "Commit with this message? [y/N] " gc_confirm
    if [[ "$gc_confirm" != "y" && "$gc_confirm" != "Y" ]]; then
      echo "Aborted — $msg_file left unchanged."
      exit 0
    fi

    git commit -F "$msg_file"
    gc_exit=$?
    if [[ $gc_exit -ne 0 ]]; then
      echo "Commit failed (exit $gc_exit). $msg_file left unchanged." >&2
      exit $gc_exit
    fi

    echo ""
    read -r -p "Tag this commit? [y/N] " gc_do_tag
    if [[ "$gc_do_tag" == "y" || "$gc_do_tag" == "Y" ]]; then
      read -r -p "Tag name (e.g. v1.2.0): " gc_tag_name
      if [[ -z "$gc_tag_name" ]]; then
        echo "No tag name given — skipping tag."
      else
        read -r -p "Tag annotation (leave blank to reuse commit message): " gc_tag_msg
        if [[ -z "$gc_tag_msg" ]]; then
          git tag -s "$gc_tag_name" -F "$msg_file"
        else
          git tag -s "$gc_tag_name" -m "$gc_tag_msg"
        fi
      fi
    fi

    # Clear the scratchpad so it is not accidentally reused
    > "$msg_file"
    echo ""
    echo "$msg_file cleared. Ready for the next commit."
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
      gcommit
    ];

    # The frontend talks to the OpenReturn API; override per shell as needed.
    OPENRETURN_API_URL = "http://localhost:8080";

    shellHook = ''
      echo "OpenReturn-UI dev shell — deno $(deno --version | head -n1 | cut -d' ' -f2)"
      echo "  dev    → deno task dev    (Fresh dev server, http://localhost:8000)"
      echo "  build  → deno task build  (production build into ./_fresh)"
      echo "  serve  → deno task start  (serve the production build)"
      echo "  check  → deno fmt+lint+type-check"
      echo "  gcommit→ sign + apply GIT_COMMIT_MSG"
      echo "  API    → OPENRETURN_API_URL=$OPENRETURN_API_URL"
    '';
  }
