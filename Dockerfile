# syntax=docker/dockerfile:1.7

FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --prefer-dist --no-interaction --ignore-platform-reqs

FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY resources ./resources
COPY vite.config.js tailwind.config.js postcss.config.js ./
RUN npm run build

FROM php:8.4-cli-alpine AS runtime
WORKDIR /var/www/html

RUN apk add --no-cache bash libpq-dev zip unzip icu-dev oniguruma-dev \
    && docker-php-ext-install pdo pdo_pgsql intl mbstring

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY . .
COPY --from=vendor /app/vendor ./vendor
COPY --from=frontend /app/public/build ./public/build

RUN addgroup -g 1000 app && adduser -D -G app -u 1000 app \
    && mkdir -p storage/framework/{cache,sessions,views,testing} storage/logs bootstrap/cache \
    && chmod +x /var/www/html/docker/entrypoint.sh \
    && chown -R app:app /var/www/html/storage /var/www/html/bootstrap/cache

USER app
ENV APP_ENV=production
ENV APP_DEBUG=false
ENV RUN_DB_SEED=false
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "/var/www/html/docker/entrypoint.sh"]
