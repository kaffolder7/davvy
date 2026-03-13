<?php

namespace App\Services\Analytics;

use App\Jobs\CaptureAnalyticsEvent;
use App\Models\User;

class AnalyticsService
{
    /**
     * Create a new analytics service instance.
     */
    public function __construct(
        private readonly AnalyticsSettings $settings,
        private readonly AnalyticsIdentityService $identity,
        private readonly AnalyticsPayloadSanitizer $sanitizer,
        private readonly PostHogClient $posthog,
    ) {}

    /**
     * Queues an analytics event when analytics is enabled.
     *
     * @param  array<string, mixed>  $properties
     */
    public function capture(string $event, array $properties = [], User|string|int|null $actor = null): void
    {
        $payload = $this->buildPayload($event, $properties, $actor);
        if ($payload === null) {
            return;
        }

        $job = CaptureAnalyticsEvent::dispatch($payload);
        $queueName = $this->settings->queueName();
        if ($queueName !== null) {
            $job->onQueue($queueName);
        }
    }

    /**
     * Sends a prepared payload to PostHog.
     *
     * @param  array{event:string,distinct_id:string,properties:array<string, bool|float|int|string>,timestamp:string|null}  $payload
     */
    public function sendPayload(array $payload): void
    {
        if (! $this->settings->enabled()) {
            return;
        }

        $this->posthog->capture($payload);
    }

    /**
     * Returns browser analytics bootstrap configuration.
     *
     * @return array{enabled:bool,provider?:string,api_key?:string,host?:string,distinct_id?:string}
     */
    public function browserConfig(): array
    {
        if (! $this->settings->enabled()) {
            return [
                'enabled' => false,
            ];
        }

        return [
            'enabled' => true,
            'provider' => 'posthog',
            'api_key' => $this->settings->posthogProjectApiKey(),
            'host' => $this->settings->posthogHost(),
            'distinct_id' => $this->identity->installationDistinctId(),
        ];
    }

    /**
     * Returns whether analytics captures are currently enabled.
     */
    public function enabled(): bool
    {
        return $this->settings->enabled();
    }

    /**
     * @param  array<string, mixed>  $properties
     * @return array{event:string,distinct_id:string,properties:array<string, bool|float|int|string>,timestamp:string|null}|null
     */
    private function buildPayload(string $event, array $properties, User|string|int|null $actor): ?array
    {
        if (! $this->settings->enabled()) {
            return null;
        }

        $eventName = trim($event);
        if ($eventName === '') {
            return null;
        }

        $sanitizedProperties = $this->sanitizer->sanitize(array_merge([
            'source' => 'davvy',
            'environment' => (string) config('app.env', 'production'),
        ], $properties));

        return [
            'event' => $eventName,
            'distinct_id' => $this->identity->distinctIdFor($actor),
            'properties' => $sanitizedProperties,
            'timestamp' => now()->toIso8601String(),
        ];
    }
}
