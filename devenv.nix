{ pkgs, config, ... }:

let
  dbName = "intramsgrado_db";
in
{
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };

  # Picked up by server/db.js (dotenv does not override already-set variables).
  # devenv's postgres service exports PGHOST/PGPORT; production uses DATABASE_URL (Neon).
  env = {
    PORT = "3010";
    JWT_SECRET = "devenv-local-secret";
    PGUSER = "postgres";
    PGDATABASE = dbName;
    CLIENT_ORIGIN = "http://localhost:5174";
  };

  # Local Postgres; data lives in .devenv/state/postgres.
  services.postgres = {
    enable = true;
    listen_addresses = "127.0.0.1";
    port = 5432;
    initialDatabases = [{ name = dbName; }];
    initialScript = "CREATE ROLE postgres SUPERUSER LOGIN;";
  };

  # npm install for server (repo root) + client; runs on shell entry when node_modules is missing.
  tasks."intrams:install" = {
    exec = ''
      cd "$DEVENV_ROOT" && npm install
      cd "$DEVENV_ROOT/client" && npm install
    '';
    status = ''test -d "$DEVENV_ROOT/node_modules" && test -d "$DEVENV_ROOT/client/node_modules"'';
    before = [ "devenv:enterShell" ];
  };

  # Idempotent schema/seed; runs after Postgres is ready, before the API starts.
  tasks."intrams:db-init" = {
    exec = ''cd "$DEVENV_ROOT" && npm run db:init'';
    after = [ "devenv:processes:postgres" ];
  };

  # setup.bat equivalent: install deps, build frontend, init DB. Needs Postgres up.
  scripts.setup.exec = ''
    set -e
    devenv tasks run intrams:install
    cd "$DEVENV_ROOT/client" && npm run build
    devenv tasks run intrams:db-init
  '';

  # start-server.bat equivalent: serve the built client + API on :3010. Needs Postgres up.
  scripts.start-server.exec = ''
    cd "$DEVENV_ROOT" && npm start
  '';

  # start-dev.bat equivalent: `devenv up` runs postgres -> db-init -> api, plus web.
  processes = {
    api = {
      exec = "npm run dev";
      after = [ "intrams:db-init" ];
    };
    web = {
      exec = "npm run dev";
      cwd = "./client";
    };
  };

  enterShell = ''
    echo "intrams devenv"
    echo "  devenv up     postgres + DB init + API (:3010, --watch) + Vite (:5174)"
    echo "  setup         install deps, build client, init DB (Postgres must be up)"
    echo "  start-server  production-style: built client + API on :3010 (Postgres must be up)"
  '';
}
