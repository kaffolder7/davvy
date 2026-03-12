<?php

namespace App\Services;

use App\Models\User;

class PrincipalUriService
{
    /**
     * Returns URI for user.
     *
     * @param  User  $user
     * @return string
     */
    public function uriForUser(User $user): string
    {
        return 'principals/'.$user->id;
    }

    /**
     * Returns user from principal URI.
     *
     * @param  string  $principalUri
     * @return User|null
     */
    public function userFromPrincipalUri(string $principalUri): ?User
    {
        if (! str_starts_with($principalUri, 'principals/')) {
            return null;
        }

        $id = (int) str_replace('principals/', '', $principalUri);

        if ($id < 1) {
            return null;
        }

        return User::query()->find($id);
    }
}
