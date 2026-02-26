<?php

namespace App\Services;

use App\Models\User;

class PrincipalUriService
{
    public function uriForUser(User $user): string
    {
        return 'principals/'.$user->id;
    }

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
