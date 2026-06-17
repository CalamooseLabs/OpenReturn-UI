{
  description = "Web frontend for the OpenReturn 990 API (Deno + Fresh).";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs = {nixpkgs, ...} @ inputs: let
    system = "x86_64-linux";
    pkgs = import nixpkgs {
      system = system;
      config.allowUnfree = true;
    };
    openreturn-ui = pkgs.callPackage ./build.nix {};
  in {
    devShells.${system}.default = import ./shell.nix {
      inherit pkgs;
    };

    packages.${system}.default = openreturn-ui;

    apps.${system}.default = {
      type = "app";
      program = "${openreturn-ui}/bin/openreturn-ui";
    };

    nixosModules.default = import ./module.nix;
  };
}
