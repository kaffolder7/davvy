#!/bin/sh
set -eu

APP_ENV_VALUE="${APP_ENV:-production}"
RUN_DB_MIGRATIONS_VALUE="${RUN_DB_MIGRATIONS:-true}"
RUN_DB_SEED_VALUE="${RUN_DB_SEED:-false}"

# Ensure config reflects current runtime environment.
php artisan config:clear --no-interaction >/dev/null 2>&1 || true

if [ -z "${APP_KEY:-}" ] && [ "${APP_ENV_VALUE}" != "production" ]; then
  php artisan key:generate --force --no-interaction
fi

php artisan app:preflight --no-interaction

if [ "${RUN_DB_MIGRATIONS_VALUE}" = "true" ] || [ "${RUN_DB_SEED_VALUE}" = "true" ]; then
  if [ "${DB_CONNECTION:-}" = "pgsql" ]; then
    BOOTSTRAP_LOCK_KEY="$(printf '%s' "${APP_NAME:-davvy}:${DB_DATABASE:-davvy}:database-bootstrap" | cksum | awk '{print $1}')"
    php -r '
      $lockKey = (int) ($argv[1] ?? 0);
      $runMigrations = ($argv[2] ?? "true") === "true";
      $runSeed = ($argv[3] ?? "false") === "true";

      if ($lockKey <= 0) {
          fwrite(STDERR, "Invalid advisory lock key.\n");
          exit(1);
      }

      $host = getenv("DB_HOST") ?: "127.0.0.1";
      $port = getenv("DB_PORT") ?: "5432";
      $database = getenv("DB_DATABASE") ?: "";
      $username = getenv("DB_USERNAME") ?: "";
      $password = getenv("DB_PASSWORD") ?: "";

      $pdo = new PDO(
          "pgsql:host={$host};port={$port};dbname={$database}",
          $username,
          $password,
          [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
      );

      $hasLock = (bool) $pdo->query("SELECT pg_try_advisory_lock(".$lockKey.")")->fetchColumn();
      $shouldRunSeed = $hasLock;
      if (! $hasLock) {
          fwrite(STDOUT, "Another replica is bootstrapping the database. Waiting for lock.\n");
          $pdo->query("SELECT pg_advisory_lock(".$lockKey.")");
          $hasLock = true;
          $shouldRunSeed = false;
      }

      $exitCode = 0;

      try {
          if ($runMigrations) {
              passthru("php artisan migrate --force --no-interaction", $exitCode);
              if ($exitCode !== 0) {
                  exit($exitCode);
              }
          }

          if ($runSeed && $shouldRunSeed) {
              passthru("php artisan db:seed --force --no-interaction", $exitCode);
              if ($exitCode !== 0) {
                  exit($exitCode);
              }
          }
      } finally {
          $pdo->query("SELECT pg_advisory_unlock(".$lockKey.")");
      }

      exit($exitCode);
    ' "${BOOTSTRAP_LOCK_KEY}" "${RUN_DB_MIGRATIONS_VALUE}" "${RUN_DB_SEED_VALUE}"
  else
    if [ "${RUN_DB_MIGRATIONS_VALUE}" = "true" ]; then
      php artisan migrate --force --no-interaction
    fi

    if [ "${RUN_DB_SEED_VALUE}" = "true" ]; then
      php artisan db:seed --force --no-interaction
    fi
  fi
fi

php artisan config:cache --no-interaction
php artisan route:cache --no-interaction
php artisan view:cache --no-interaction

exec php -S "0.0.0.0:${PORT:-8080}" -t public
