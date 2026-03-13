<?php

namespace App\Http\Controllers;

use App\Services\Analytics\AnalyticsService;
use Illuminate\Http\JsonResponse;

class AnalyticsSettingsController extends Controller
{
    /**
     * Create a new analytics settings controller.
     */
    public function __construct(private readonly AnalyticsService $analytics) {}

    /**
     * Returns analytics bootstrap configuration for browser clients.
     */
    public function show(): JsonResponse
    {
        return response()->json($this->analytics->browserConfig());
    }
}
