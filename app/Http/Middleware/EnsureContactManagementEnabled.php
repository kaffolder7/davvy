<?php

namespace App\Http\Middleware;

use App\Services\RegistrationSettingsService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureContactManagementEnabled
{
    public function __construct(private readonly RegistrationSettingsService $settings) {}

    /**
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->settings->isContactManagementEnabled()) {
            abort(403, 'Contact management is currently disabled by admins.');
        }

        return $next($request);
    }
}
