<?php

namespace App\Providers;

use App\Services\DavRequestContext;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Registers the application services.
     */
    public function register(): void
    {
        $this->app->singleton(DavRequestContext::class);
    }

    /**
     * Bootstraps the application services.
     */
    public function boot(): void
    {
        RateLimiter::for('auth-login', function (Request $request): Limit {
            $email = Str::lower((string) $request->input('email', ''));

            return Limit::perMinute(10)->by($email.'|'.$request->ip());
        });

        RateLimiter::for('auth-register', function (Request $request): Limit {
            return Limit::perMinute(5)->by($request->ip());
        });

        RateLimiter::for('auth-onboarding', function (Request $request): Limit {
            $tokenFragment = substr((string) $request->input('token', ''), 0, 24);

            return Limit::perMinute(20)->by($request->ip().'|'.$tokenFragment);
        });

        RateLimiter::for('auth-password', function (Request $request): Limit {
            $userKey = (string) ($request->user()?->id ?? 'guest');

            return Limit::perMinute(10)->by($userKey.'|'.$request->ip());
        });

        RateLimiter::for('auth-login-2fa', function (Request $request): Limit {
            return Limit::perMinute(15)->by($request->ip().'|'.$request->session()->getId());
        });

        RateLimiter::for('auth-2fa-action', function (Request $request): Limit {
            $userKey = (string) ($request->user()?->id ?? 'guest');

            return Limit::perMinute(30)->by($userKey.'|'.$request->ip());
        });
    }
}
