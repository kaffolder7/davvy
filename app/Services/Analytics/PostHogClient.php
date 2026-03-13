<?php

namespace App\Services\Analytics;

use PostHog\PostHog;
use Throwable;

class PostHogClient
{
    private bool $initialized = false;

    /**
     * Create a new PostHog client wrapper.
     */
    public function __construct(private readonly AnalyticsSettings $settings) {}

    /**
     * Sends a capture payload to PostHog.
     *
     * @param  array{event:string,distinct_id:string,properties:array<string, bool|float|int|string>,timestamp:string|null}  $payload
     */
    public function capture(array $payload): void
    {
        if (! $this->settings->enabled()) {
            return;
        }

        try {
            $this->initialize();

            PostHog::capture([
                'event' => $payload['event'],
                'distinctId' => $payload['distinct_id'],
                'properties' => array_merge([
                    '$lib' => 'davvy-laravel',
                ], $payload['properties']),
                'timestamp' => $payload['timestamp'] ?? null,
            ]);
            PostHog::flush();
        } catch (Throwable $throwable) {
            report($throwable);
        }
    }

    /**
     * Initializes the PostHog SDK once per process.
     */
    private function initialize(): void
    {
        if ($this->initialized) {
            return;
        }

        PostHog::init(
            $this->settings->posthogProjectApiKey(),
            [
                'host' => $this->settings->posthogHost(),
            ],
        );

        $this->initialized = true;
    }
}
