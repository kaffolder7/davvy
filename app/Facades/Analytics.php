<?php

namespace App\Facades;

use Illuminate\Support\Facades\Facade;

class Analytics extends Facade
{
    /**
     * Returns the registered facade accessor key.
     */
    protected static function getFacadeAccessor(): string
    {
        return 'analytics';
    }
}
