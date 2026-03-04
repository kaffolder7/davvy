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

PORT_VALUE="${PORT:-8080}"

case "${PORT_VALUE}" in
  ''|*[!0-9]*)
    echo "Invalid PORT value: ${PORT_VALUE}" >&2
    exit 1
    ;;
esac

NGINX_CONFIG_FILE="/tmp/davvy-nginx.conf"
sed "s/__PORT__/${PORT_VALUE}/g" /var/www/html/docker/nginx/nginx.conf.template > "${NGINX_CONFIG_FILE}"

php-fpm -t
nginx -t -c "${NGINX_CONFIG_FILE}" -g 'error_log /dev/stderr notice;'

php-fpm -F &
php_fpm_pid=$!

nginx -c "${NGINX_CONFIG_FILE}" -g 'daemon off; error_log /dev/stderr warn;' &
nginx_pid=$!

shutdown() {
  kill -TERM "${php_fpm_pid}" "${nginx_pid}" 2>/dev/null || true
}

trap 'shutdown' INT TERM

while kill -0 "${php_fpm_pid}" 2>/dev/null && kill -0 "${nginx_pid}" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "${php_fpm_pid}" 2>/dev/null; then
  if wait "${php_fpm_pid}"; then
    exit_code=0
  else
    exit_code=$?
  fi
else
  if wait "${nginx_pid}"; then
    exit_code=0
  else
    exit_code=$?
  fi
fi

shutdown
wait "${php_fpm_pid}" 2>/dev/null || true
wait "${nginx_pid}" 2>/dev/null || true

exit "${exit_code}"
