{
  perSystem =
    { lib, pkgs, ... }:
    let
      nodeMajor = lib.trim (builtins.readFile ../.nvmrc);
      nodejs = pkgs."nodejs_${nodeMajor}";
      pnpm = pkgs.pnpm_11.override { nodejs-slim = pkgs."nodejs-slim_${nodeMajor}"; };
      manifest = lib.importJSON ../package.json;
    in
    {
      packages.default = pkgs.stdenv.mkDerivation (finalAttrs: {
        pname = manifest.name;
        inherit (manifest) version;

        src = lib.fileset.toSource {
          root = ../.;
          fileset = lib.fileset.difference (lib.fileset.gitTracked ../.) (
            lib.fileset.unions [
              ../flake.nix
              ../flake.lock
              ../nix
            ]
          );
        };

        nativeBuildInputs = [
          nodejs
          pnpm
          pkgs.pnpmConfigHook
          pkgs.pnpmBuildHook
        ];

        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit (finalAttrs) pname version src;
          inherit pnpm;
          fetcherVersion = 4;
          hash = "sha256-b/3SMZajNej5LWWqc0zNfuHVBIT+KQOzsWnFTOVAddw=";
        };

        doCheck = true;
        checkPhase = ''
          runHook preCheck
          pnpm test
          runHook postCheck
        '';

        installPhase = ''
          runHook preInstall
          install -Dm644 dist/index.js $out/kontainer-storyblok-plugin.js
          runHook postInstall
        '';
      });
    };
}
