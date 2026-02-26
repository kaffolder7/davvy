<?php

namespace App\Providers;

use App\Services\DavRequestContext;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(DavRequestContext::class);
    }

    public function boot(): void
    {
        //
    }
}
