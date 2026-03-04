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

FROM php:8.4-fpm-alpine AS runtime
WORKDIR /var/www/html

RUN apk add --no-cache bash libpq-dev zip unzip icu-dev oniguruma-dev nginx \
    && docker-php-ext-install pdo pdo_pgsql intl mbstring

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY . .
COPY --from=vendor /app/vendor ./vendor
COPY --from=frontend /app/public/build ./public/build

RUN addgroup -g 1000 app && adduser -D -G app -u 1000 app \
    && mkdir -p \
        storage/framework/{cache,sessions,views,testing} \
        storage/logs \
        bootstrap/cache \
        /tmp/nginx/{client_temp,proxy_temp,fastcgi_temp,uwsgi_temp,scgi_temp} \
        /run/nginx \
        /var/lib/nginx/logs \
        /var/log/nginx \
    && sed -i "s|^user = .*|; user = app|" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s|^group = .*|; group = app|" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s|^listen = .*|listen = 127.0.0.1:9000|" /usr/local/etc/php-fpm.d/www.conf \
    && sed -i "s|^;clear_env = no|clear_env = no|" /usr/local/etc/php-fpm.d/www.conf \
    && rm -f /var/www/html/bootstrap/cache/*.php \
    && chmod +x /var/www/html/docker/entrypoint.sh \
    && chown -R app:app \
        /var/www/html/storage \
        /var/www/html/bootstrap/cache \
        /tmp/nginx \
        /run/nginx \
        /var/lib/nginx \
        /var/log/nginx

USER app
ENV APP_ENV=production
ENV APP_DEBUG=false
ENV RUN_DB_MIGRATIONS=true
ENV RUN_DB_SEED=false
ENV PORT=8080

EXPOSE 8080

CMD ["sh", "/var/www/html/docker/entrypoint.sh"]
