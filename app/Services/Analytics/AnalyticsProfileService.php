<?php

namespace App\Services\Analytics;

use App\Models\User;

class AnalyticsProfileService
{
    /**
     * Return a stable, non-reversible profile identifier for the user.
     *
     * @param  User  $user
     * @return string
     */
    public function profileIdForUser(User $user): string
    {
        return $this->profileIdForUserId((string) $user->getAuthIdentifier());
    }

    /**
     * Return a stable, non-reversible profile identifier for a user ID.
     *
     * @param  string  $userId
     * @return string
     */
    public function profileIdForUserId(string $userId): string
    {
        $key = (string) config('app.key', '');
        if ($key === '') {
            $key = 'davvy-openpanel';
        }

        return hash_hmac('sha256', 'user:'.$userId, $key);
    }
}
