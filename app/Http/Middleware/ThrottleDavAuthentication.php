<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ThrottleDavAuthentication
{
    /**
     * Handles the incoming request.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $throttleKey = $this->throttleKey($request);
        $maxAttempts = max(1, (int) config('dav.auth_throttle.max_attempts', 20));
        $decaySeconds = max(1, (int) config('dav.auth_throttle.decay_seconds', 60));

        if (RateLimiter::tooManyAttempts($throttleKey, $maxAttempts)) {
            $retryAfterSeconds = max(1, RateLimiter::availableIn($throttleKey));

            return response(
                content: 'Too many DAV authentication attempts. Please try again later.',
                status: 429,
                headers: [
                    'Retry-After' => (string) $retryAfterSeconds,
                    'Content-Type' => 'text/plain; charset=utf-8',
                ],
            );
        }

        $response = $next($request);

        if ($response->getStatusCode() === 401) {
            RateLimiter::hit($throttleKey, $decaySeconds);
        } elseif ($this->hasBasicAuthorizationHeader($request)) {
            // Successful or non-auth DAV responses with Basic credentials
            // indicate credentials are not currently being brute-forced.
            RateLimiter::clear($throttleKey);
        }

        return $response;
    }

    /**
     * Returns throttle key.
     *
     * @param  Request  $request
     * @return string
     */
    private function throttleKey(Request $request): string
    {
        $username = $this->basicUsername($request);
        $ip = $request->ip() ?? 'unknown-ip';

        return 'dav-auth:'.sha1($username.'|'.$ip);
    }

    /**
     * Returns basic username.
     *
     * @param  Request  $request
     * @return string
     */
    private function basicUsername(Request $request): string
    {
        $header = trim((string) $request->header('Authorization', ''));
        if (! Str::startsWith(Str::lower($header), 'basic ')) {
            return 'anonymous';
        }

        $encodedCredentials = trim(substr($header, 6));
        $decodedCredentials = base64_decode($encodedCredentials, true);
        if (! is_string($decodedCredentials) || $decodedCredentials === '') {
            return 'anonymous';
        }

        $separator = strpos($decodedCredentials, ':');
        $username = $separator === false
            ? $decodedCredentials
            : substr($decodedCredentials, 0, $separator);

        $normalized = trim(Str::lower($username));

        return $normalized !== '' ? $normalized : 'anonymous';
    }

    /**
     * Checks whether it has basic authorization header.
     *
     * @param  Request  $request
     * @return bool
     */
    private function hasBasicAuthorizationHeader(Request $request): bool
    {
        $header = trim((string) $request->header('Authorization', ''));

        return Str::startsWith(Str::lower($header), 'basic ');
    }
}
