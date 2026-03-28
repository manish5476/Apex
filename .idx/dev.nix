# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"

  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.tree
  ];

  # Sets environment variables in the workspace
  env = {};

  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      # "vscodevim.vim"
    ];

    # Enable previews
    previews = {
      enable = true;
      previews = {
        # web = {
        #   command = ["npm" "run" "dev"];
        #   manager = "web";
        #   env = {
        #     PORT = "$PORT";
        #   };
        # };
      };
    };

    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        # Create the .vscode folder and add the auto-update import settings
        setup-editor-settings = ''
          mkdir -p .vscode
          echo '{
            "javascript.updateImportsOnFileMove.enabled": "always",
            "typescript.updateImportsOnFileMove.enabled": "always"
          }' > .vscode/settings.json
        '';
      };

      # Runs when the workspace is (re)started
      onStart = {
        # watch-backend = "npm run watch-backend";
      };
    };
  };
}