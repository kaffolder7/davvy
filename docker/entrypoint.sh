#!/bin/sh
set -eu

APP_ENV_VALUE="${APP_ENV:-production}"

# Ensure config reflects current runtime environment.
php artisan config:clear --no-interaction >/dev/null 2>&1 || true

if [ -z "${APP_KEY:-}" ] && [ "${APP_ENV_VALUE}" != "production" ]; then
  php artisan key:generate --force --no-interaction
fi

php artisan app:preflight --no-interaction

php artisan migrate --force --no-interaction

if [ "${RUN_DB_SEED:-false}" = "true" ]; then
  php artisan db:seed --force --no-interaction
fi

php artisan config:cache --no-interaction
php artisan route:cache --no-interaction
php artisan view:cache --no-interaction

exec php -S "0.0.0.0:${PORT:-8080}" -t public
