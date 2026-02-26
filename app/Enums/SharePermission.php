<?php

namespace App\Enums;

enum SharePermission: string
{
    case ReadOnly = 'read_only';
    case Admin = 'admin';

    public function canWrite(): bool
    {
        return $this === self::Admin;
    }
}
