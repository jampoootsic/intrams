{ pkgs, config, ... }:

let
  dbName = "intramsgrado_db";
  dbUser = "intrams";
  dbPassword = "intrams";
in
{
  languages.javascript = {
    enable = true;
    npm.enable = true;
  };

  # Picked up by server/db.js, server/db/init.js and index.js (dotenv does not
  # override already-set variables). Replaces the XAMPP-based .env from .env.example.
  env = {
    PORT = "3010";
    JWT_SECRET = "devenv-local-secret";
    DB_HOST = "127.0.0.1";
    DB_PORT = "3306";
    DB_USER = dbUser;
    DB_PASSWORD = dbPassword;
    DB_NAME = dbName;
    CLIENT_ORIGIN = "http://localhost:5174";
  };

  # MariaDB (devenv default) replaces XAMPP. Data lives in .devenv/state/mysql.
  services.mysql = {
    enable = true;
    initialDatabases = [{ name = dbName; }];
    ensureUsers = [{
      name = dbUser;
      password = dbPassword;
      ensurePermissions = { "${dbName}.*" = "ALL PRIVILEGES"; };
    }];
    settings.mysqld = {
      port = 3306;
      bind-address = "127.0.0.1";
    };
  };

  # npm install for server + client; runs on shell entry when node_modules is missing.
  tasks."intrams:install" = {
    exec = ''
      cd "$DEVENV_ROOT/server" && npm install
      cd "$DEVENV_ROOT/client" && npm install
    '';
    status = ''test -d "$DEVENV_ROOT/server/node_modules" && test -d "$DEVENV_ROOT/client/node_modules"'';
    before = [ "devenv:enterShell" ];
  };

  # setup.bat equivalent: install deps, build frontend, init DB. Needs MySQL up.
  scripts.setup.exec = ''
    set -e
    devenv tasks run intrams:install
    cd "$DEVENV_ROOT/client" && npm run build
    devenv tasks run intrams:db-init
  '';

  # start-server.bat equivalent: serve the built client + API on :3010. Needs MySQL up.
  scripts.start-server.exec = ''
    cd "$DEVENV_ROOT/server" && node index.js
  '';

  # Idempotent schema/seed; runs after MySQL is ready, before the API starts.
  tasks."intrams:db-init" = {
    exec = ''cd "$DEVENV_ROOT/server" && node db/init.js'';
    after = [ "devenv:processes:mysql" ];
  };

  # start-dev.bat equivalent: `devenv up` runs mysql -> db-init -> api, plus web.
  processes = {
    api = {
      exec = "node --watch index.js";
      cwd = "./server";
      after = [ "intrams:db-init" ];
    };
    web = {
      exec = "npm run dev";
      cwd = "./client";
    };
  };

  enterShell = ''
    echo "intrams devenv"
    echo "  devenv up     mysql + DB init + API (:3010, --watch) + Vite (:5174)"
    echo "  setup         install deps, build client, init DB (MySQL must be up)"
    echo "  start-server  production: built client + API on :3010 (MySQL must be up)"
  '';
}
