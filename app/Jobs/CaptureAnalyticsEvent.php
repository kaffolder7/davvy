<?php

namespace App\Jobs;

use App\Services\Analytics\AnalyticsService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class CaptureAnalyticsEvent implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /**
     * @param  array{event:string,distinct_id:string,properties:array<string, bool|float|int|string>,timestamp:string|null}  $payload
     */
    public function __construct(public array $payload) {}

    /**
     * Returns the retry backoff timing in seconds.
     *
     * @return array<int, int>
     */
    public function backoff(): array
    {
        return [5, 30, 120];
    }

    /**
     * Executes the queued analytics capture job.
     */
    public function handle(AnalyticsService $analytics): void
    {
        $analytics->sendPayload($this->payload);
    }
}
