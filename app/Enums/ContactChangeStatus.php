<?php

namespace App\Enums;

enum ContactChangeStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Denied = 'denied';
    case ManualMergeNeeded = 'manual_merge_needed';
    case Applied = 'applied';

    /**
     * @return bool
     */
    public function isTerminal(): bool
    {
        return $this === self::Denied || $this === self::Applied;
    }
}
