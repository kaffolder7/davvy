<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('app:about', function (): void {
    $this->comment('Davvy MVP - Laravel + SabreDAV');
});
