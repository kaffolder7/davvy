<?php

namespace App\Http\Controllers;

use App\Services\Analytics\OpenPanelSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

class AnalyticsProxyController extends Controller
{
    private const OP1_SCRIPT_SOURCE_URL = 'https://openpanel.dev/op1.js';

    private const OP1_SCRIPT_CACHE_KEY = 'analytics:openpanel:op1-script';

    private const OP1_SCRIPT_CACHE_TTL_SECONDS = 21600;

    private const BLOCKED_PROPERTY_TOKENS = [
        'email',
        'name',
        'phone',
        'address',
        'password',
        'token',
        'secret',
    ];

    private const ALLOWED_EVENT_TYPES = [
        'track',
        'identify',
    ];

    /**
     * Create a new analytics proxy controller instance.
     *
     * @return void
     */
    public function __construct(
        private readonly OpenPanelSettings $settings,
    ) {}

    /**
     * Proxy and cache the OpenPanel browser script on the app domain.
     */
    public function script(): Response
    {
        if (! $this->settings->clientTrackingEnabled()) {
            abort(404);
        }

        $script = Cache::get(self::OP1_SCRIPT_CACHE_KEY);
        if (! is_string($script) || trim($script) === '') {
            $script = $this->fetchBrowserScript();
            if ($script === null) {
                return response('', 503, [
                    'Content-Type' => 'text/plain; charset=utf-8',
                    'Cache-Control' => 'no-store',
                ]);
            }

            Cache::put(
                self::OP1_SCRIPT_CACHE_KEY,
                $script,
                now()->addSeconds(self::OP1_SCRIPT_CACHE_TTL_SECONDS),
            );
        }

        return response($script, 200, [
            'Content-Type' => 'application/javascript; charset=utf-8',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    /**
     * Proxy browser analytics events to OpenPanel with server credentials.
     */
    public function track(Request $request): JsonResponse
    {
        if (! $this->settings->serverTrackingEnabled()) {
            return response()->json(['ok' => true, 'disabled' => true], 202);
        }

        $type = trim((string) $request->input('type', ''));
        $payload = $request->input('payload');

        if ($type === '' || ! is_array($payload)) {
            return response()->json(['ok' => true], 202);
        }

        if (! in_array($type, self::ALLOWED_EVENT_TYPES, true)) {
            return response()->json(['ok' => true], 202);
        }

        $normalizedPayload = $this->sanitizePayload($type, $payload);

        if ($type === 'track' && ($normalizedPayload['name'] ?? '') === '') {
            return response()->json(['ok' => true], 202);
        }

        try {
            $response = Http::asJson()
                ->timeout(2)
                ->connectTimeout(1)
                ->withHeaders($this->forwardHeaders($request))
                ->post(
                    $this->settings->apiUrl().'/track',
                    [
                        'type' => $type,
                        'payload' => $normalizedPayload,
                    ],
                );
        } catch (Throwable $throwable) {
            report($throwable);

            return response()->json(['ok' => false], 202);
        }

        $body = $response->json();

        if (is_array($body)) {
            return response()->json($body, $response->status());
        }

        if ($response->body() === '') {
            return response()->json([], $response->status());
        }

        return response()->json([
            'ok' => $response->successful(),
        ], $response->status());
    }

    /**
     * Fetch the browser script from the upstream OpenPanel CDN.
     */
    private function fetchBrowserScript(): ?string
    {
        try {
            $response = Http::timeout(3)->get(self::OP1_SCRIPT_SOURCE_URL);
        } catch (Throwable $throwable) {
            report($throwable);

            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $body = $response->body();

        return trim($body) === '' ? null : $body;
    }

    /**
     * Build forwarded browser headers for upstream tracking ingestion.
     *
     * @return array<string, string>
     */
    private function forwardHeaders(Request $request): array
    {
        $headers = [
            'openpanel-client-id' => $this->settings->clientId(),
            'openpanel-sdk-name' => trim((string) $request->header('openpanel-sdk-name', 'web')),
            'openpanel-sdk-version' => trim((string) $request->header('openpanel-sdk-version', '1.2.0')),
            'User-Agent' => trim((string) $request->userAgent()),
            'Origin' => trim((string) $request->header('Origin', '')),
            'Referer' => trim((string) $request->header('Referer', '')),
        ];

        return array_filter(
            $headers,
            static fn (string $value): bool => $value !== '',
        );
    }

    /**
     * Sanitize browser event payload fields before upstream transport.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function sanitizePayload(string $type, array $payload): array
    {
        $sanitized = $payload;

        if ($type === 'track') {
            $sanitized['name'] = trim((string) ($payload['name'] ?? ''));
        }

        if ($type === 'identify') {
            $sanitized['profileId'] = trim((string) ($payload['profileId'] ?? ''));
        }

        if (isset($payload['properties']) && is_array($payload['properties'])) {
            $sanitized['properties'] = $this->sanitizeProperties($payload['properties']);
        }

        return $sanitized;
    }

    /**
     * Sanitize event properties and drop suspected PII fields.
     *
     * @param  array<string, mixed>  $properties
     * @return array<string, bool|int|float|string>
     */
    private function sanitizeProperties(array $properties): array
    {
        $sanitized = [];

        foreach ($properties as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            $normalizedKey = trim($key);
            if ($normalizedKey === '' || $this->hasBlockedToken($normalizedKey)) {
                continue;
            }

            if (is_bool($value) || is_int($value) || is_float($value)) {
                $sanitized[$normalizedKey] = $value;

                continue;
            }

            if (is_string($value)) {
                $normalizedValue = trim($value);
                if ($normalizedValue === '' || $this->looksLikeEmail($normalizedValue)) {
                    continue;
                }

                $sanitized[$normalizedKey] = mb_substr($normalizedValue, 0, 160);
            }
        }

        return $sanitized;
    }

    /**
     * Determine whether a key likely contains sensitive tokens.
     */
    private function hasBlockedToken(string $value): bool
    {
        $normalized = mb_strtolower($value);

        foreach (self::BLOCKED_PROPERTY_TOKENS as $token) {
            if (str_contains($normalized, $token)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Determine whether a value appears to be an email address.
     */
    private function looksLikeEmail(string $value): bool
    {
        return (bool) preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $value);
    }
}
