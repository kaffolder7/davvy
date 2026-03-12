<?php

namespace App\Services;

use App\Models\User;

class DavRequestContext
{
    private ?User $authenticatedUser = null;

    /**
     * Sets authenticated user.
     */
    public function setAuthenticatedUser(User $user): void
    {
        $this->authenticatedUser = $user;
    }

    /**
     * Returns authenticated user.
     */
    public function getAuthenticatedUser(): ?User
    {
        return $this->authenticatedUser;
    }

    /**
     * Clears the value.
     */
    public function clear(): void
    {
        $this->authenticatedUser = null;
    }
}
