{ config, lib, pkgs, ... }:
let
  cfg = config.services.openreturn-ui;
  stateName = lib.removePrefix "/var/lib/" cfg.dataDir;

  # Rebuild marker: when the package store path changes (a deploy), drop the
  # previous build so the service rebuilds against the new source.
  preStart = pkgs.writeShellScript "openreturn-ui-prestart" ''
    set -euo pipefail
    stamp="${cfg.dataDir}/.package"
    want="${cfg.package}"
    if [ ! -f "$stamp" ] || [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
      rm -rf "${cfg.dataDir}/app/_fresh" "${cfg.dataDir}/app/node_modules"
      printf '%s' "$want" > "$stamp"
    fi
  '';
in {
  options.services.openreturn-ui = {
    enable = lib.mkEnableOption "OpenReturn web frontend (Deno + Fresh)";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./build.nix {};
      defaultText = lib.literalExpression "pkgs.callPackage ./build.nix {}";
      description = "The openreturn-ui package to serve.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "0.0.0.0";
      description = "Bind address for the frontend HTTP server.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8000;
      description = "Bind port for the frontend HTTP server.";
    };

    apiUrl = lib.mkOption {
      type = lib.types.str;
      default = "http://localhost:8080";
      example = "https://api.openreturn.example.org";
      description = ''
        Base URL of the OpenReturn API backend. The frontend calls it
        server-to-server, so this is reachable from the host, not the browser.
      '';
    };

    cookieSecure = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = ''
        Set the Secure flag on the session cookies. Keep true when the frontend
        is served over HTTPS (the normal production case). Set false only for a
        plain-HTTP deployment, or the session cookie will be rejected.
      '';
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Open the firewall for the configured port.";
    };

    dataDir = lib.mkOption {
      type = lib.types.str;
      default = "/var/lib/openreturn-ui";
      description = ''
        Writable state directory. Holds the working copy of the app, its
        node_modules, the built ./_fresh output, and the Deno cache (DENO_DIR).
        The first start builds the app here (needs network); later starts reuse
        the cache.
      '';
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "openreturn-ui";
      description = "User account under which the frontend runs.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "openreturn-ui";
      description = "Group under which the frontend runs.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Optional EnvironmentFile (agenix/sops-nix/systemd credential) for extra
        secrets or overrides, loaded into the service environment.
      '';
    };
  };

  config = lib.mkIf cfg.enable {
    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];

    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      description = "OpenReturn frontend service user";
    };
    users.groups.${cfg.group} = {};

    # Clear any prior failed state so a config change always restarts cleanly.
    system.activationScripts.openreturn-ui-reset-failed =
      lib.stringAfter [ "users" ] ''
        systemctl reset-failed openreturn-ui.service 2>/dev/null || true
      '';

    systemd.services.openreturn-ui = {
      description = "OpenReturn web frontend (Deno + Fresh)";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      restartTriggers = [ cfg.package cfg.host (toString cfg.port) cfg.apiUrl ];

      environment = {
        OPENRETURN_API_URL = cfg.apiUrl;
        COOKIE_SECURE = lib.boolToString cfg.cookieSecure;
        OPENRETURN_UI_DIR = "${cfg.dataDir}/app";
        OPENRETURN_UI_HOST = cfg.host;
        OPENRETURN_UI_PORT = toString cfg.port;
        DENO_DIR = "${cfg.dataDir}/deno";
        HOME = cfg.dataDir;
      };

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        StateDirectory = stateName;
        StateDirectoryMode = "0750";

        ExecStartPre = "${preStart}";
        ExecStart = "${cfg.package}/bin/openreturn-ui";

        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;

        Restart = "on-failure";
        RestartSec = "5s";
        # First build can take a while (npm/jsr fetch); don't trip the watchdog.
        TimeoutStartSec = "600s";

        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ cfg.dataDir ];
        NoNewPrivileges = true;
      } // lib.optionalAttrs (cfg.port < 1024) {
        AmbientCapabilities = "CAP_NET_BIND_SERVICE";
        CapabilityBoundingSet = "CAP_NET_BIND_SERVICE";
      };
    };
  };
}
