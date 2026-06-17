{ lib, stdenvNoCC, deno, makeWrapper }:

# Packages the Fresh frontend as a source bundle plus an `openreturn-ui`
# launcher. Deno apps don't vendor cleanly into a fixed-output derivation
# across Deno versions (Vite needs a real node_modules and Deno's caches carry
# timestamps), so the build (deno task build) runs once at first launch into a
# writable work directory and is cached there afterwards. The NixOS module
# wires this into a systemd service with a persistent DENO_DIR.

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "openreturn-ui";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ./.;
    filter = path: _type:
      let base = baseNameOf path;
      in !(builtins.elem base [ "node_modules" "_fresh" ".git" ".direnv" "result" "tests" "cov" ]);
  };

  nativeBuildInputs = [ makeWrapper ];
  dontConfigure = true;
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    appdir=$out/share/openreturn-ui
    mkdir -p "$appdir"
    cp -R . "$appdir/"
    rm -rf "$appdir/node_modules" "$appdir/_fresh"

    # Launcher: sync the app into a writable work dir, build once, then serve.
    #   OPENRETURN_UI_DIR  work dir (default: $PWD/.openreturn-ui)
    #   OPENRETURN_UI_PORT / OPENRETURN_UI_HOST  bind (default 8000 / 0.0.0.0)
    #   DENO_DIR           deno cache (set by the module to a persistent path)
    mkdir -p $out/bin
    cat > $out/bin/openreturn-ui <<EOF
    #!${stdenvNoCC.shell}
    set -euo pipefail
    APP_SRC="$appdir"
    WORK="\''${OPENRETURN_UI_DIR:-\$PWD/.openreturn-ui}"
    PORT="\''${OPENRETURN_UI_PORT:-8000}"
    HOST="\''${OPENRETURN_UI_HOST:-0.0.0.0}"
    mkdir -p "\$WORK"
    # Copy as writable (store files are read-only) so restarts can re-sync;
    # node_modules/_fresh in \$WORK are not in APP_SRC and survive the copy.
    cp -RfL --no-preserve=mode "\$APP_SRC/." "\$WORK/"
    chmod -R u+w "\$WORK"
    cd "\$WORK"
    if [ ! -d node_modules ]; then ${deno}/bin/deno install --quiet; fi
    if [ ! -f _fresh/server.js ] || [ "\''${OPENRETURN_UI_REBUILD:-0}" = "1" ]; then
      ${deno}/bin/deno task build
    fi
    exec ${deno}/bin/deno serve -A --port "\$PORT" --host "\$HOST" _fresh/server.js
    EOF
    chmod +x $out/bin/openreturn-ui

    runHook postInstall
  '';

  passthru = {
    inherit deno;
    appSubdir = "share/openreturn-ui";
  };

  meta = {
    description = "Web frontend for the OpenReturn 990 API (Deno + Fresh)";
    mainProgram = "openreturn-ui";
    platforms = [ "x86_64-linux" ];
  };
})
