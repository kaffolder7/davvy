<?php

use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\EnsureContactManagementEnabled;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $trustedProxies = env('TRUSTED_PROXIES');

        if ($trustedProxies !== null && $trustedProxies !== '') {
            $middleware->trustProxies(
                at: $trustedProxies === '*'
                    ? '*'
                    : array_map('trim', explode(',', $trustedProxies))
            );
        }

        $middleware->validateCsrfTokens(except: [
            'api/*',
            'dav',
            'dav/*',
            '.well-known/caldav',
            '.well-known/carddav',
        ]);

        $middleware->alias([
            'admin' => EnsureAdmin::class,
            'contact-management' => EnsureContactManagementEnabled::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })
    ->create();
