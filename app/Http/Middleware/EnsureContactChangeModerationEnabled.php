<?php

namespace App\Http\Middleware;

use App\Services\RegistrationSettingsService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureContactChangeModerationEnabled
{
    public function __construct(private readonly RegistrationSettingsService $settings) {}

    /**
     * Handles the incoming request.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (! $this->settings->isContactChangeModerationEnabled()) {
            abort(403, 'Review queue is currently disabled by admins.');
        }

        return $next($request);
    }
}
