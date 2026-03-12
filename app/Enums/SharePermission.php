<?php

namespace App\Enums;

enum SharePermission: string
{
    case ReadOnly = 'read_only';
    case Editor = 'editor';
    case Admin = 'admin';

    /**
     * Checks whether it can write.
     */
    public function canWrite(): bool
    {
        return $this === self::Editor || $this === self::Admin;
    }

    /**
     * Checks whether it can delete.
     */
    public function canDelete(): bool
    {
        return $this === self::Admin;
    }
}
