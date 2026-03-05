# syntax=docker/dockerfile:1.7

FROM composer:2 AS vendor-prod
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --prefer-dist --no-interaction --ignore-platform-reqs

FROM composer:2 AS vendor-dev
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-scripts --prefer-dist --no-interaction --ignore-platform-reqs

FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY resources ./resources
COPY vite.config.js tailwind.config.js postcss.config.js ./
RUN npm run build

FROM php:8.4-fpm-alpine AS runtime-base
WORKDIR /var/www/html

RUN set -eux; \
    apk add --no-cache nginx icu-libs libpq oniguruma libzip; \
    apk add --no-cache --virtual .build-deps $PHPIZE_DEPS icu-dev libpq-dev oniguruma-dev libzip-dev; \
    docker-php-ext-install -j"$(nproc)" pdo pdo_pgsql intl mbstring zip; \
    apk del --no-network .build-deps

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY artisan composer.json composer.lock phpunit.xml .env.example ./
COPY app ./app
COPY bootstrap ./bootstrap
COPY config ./config
COPY database ./database
COPY docker ./docker
COPY docker/php/conf.d/zz-davvy-production.ini /usr/local/etc/php/conf.d/zz-davvy-production.ini
COPY docker/php-fpm/zz-davvy-pool.conf /usr/local/etc/php-fpm.d/zz-davvy-pool.conf
COPY public ./public
COPY resources ./resources
COPY routes ./routes
COPY storage ./storage
COPY --from=vendor-prod /app/vendor ./vendor

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

FROM runtime-base AS ci-test
USER root
COPY tests ./tests
COPY --from=vendor-dev /app/vendor ./vendor
RUN cp .env.example .env \
    && chown app:app .env
USER app
ENV APP_ENV=testing
ENV APP_DEBUG=true
ENV APP_KEY=base64:MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=
ENV DB_CONNECTION=sqlite
ENV DB_DATABASE=:memory:
ENV CACHE_STORE=array
ENV SESSION_DRIVER=array
ENV QUEUE_CONNECTION=sync
ENV MAIL_MAILER=array
ENV RUN_DB_MIGRATIONS=false
ENV RUN_DB_SEED=false
CMD ["php", "artisan", "test"]

FROM runtime-base AS runtime
COPY --from=frontend /app/public/build ./public/build

CMD ["sh", "/var/www/html/docker/entrypoint.sh"]
