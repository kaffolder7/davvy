<?php

namespace App\Enums;

enum SharePermission: string
{
    case ReadOnly = 'read_only';
    case Editor = 'editor';
    case Admin = 'admin';

    /**
     * @return bool
     */
    public function canWrite(): bool
    {
        return $this === self::Editor || $this === self::Admin;
    }

    /**
     * @return bool
     */
    public function canDelete(): bool
    {
        return $this === self::Admin;
    }
}
