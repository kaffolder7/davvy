<?php

namespace App\Services;

use App\Models\User;

class DavRequestContext
{
    private ?User $authenticatedUser = null;

    public function setAuthenticatedUser(User $user): void
    {
        $this->authenticatedUser = $user;
    }

    public function getAuthenticatedUser(): ?User
    {
        return $this->authenticatedUser;
    }

    public function clear(): void
    {
        $this->authenticatedUser = null;
    }
}
