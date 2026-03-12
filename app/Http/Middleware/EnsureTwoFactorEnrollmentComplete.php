<?php

namespace App\Http\Middleware;

use App\Services\Security\TwoFactorSettingsService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTwoFactorEnrollmentComplete
{
    public function __construct(
        private readonly TwoFactorSettingsService $twoFactorSettings,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || ! $this->twoFactorSettings->isSetupRequired($user)) {
            return $next($request);
        }

        abort(423, 'Two-factor authentication setup is required before accessing this resource.');
    }
}
