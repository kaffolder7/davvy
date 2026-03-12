<?php

namespace App\Services;

use App\Models\User;

class DavRequestContext
{
    private ?User $authenticatedUser = null;

    /**
     * Sets authenticated user.
     *
     * @param  User  $user
     * @return void
     */
    public function setAuthenticatedUser(User $user): void
    {
        $this->authenticatedUser = $user;
    }

    /**
     * Returns authenticated user.
     *
     * @return User|null
     */
    public function getAuthenticatedUser(): ?User
    {
        return $this->authenticatedUser;
    }

    /**
     * Clears the value.
     *
     * @return void
     */
    public function clear(): void
    {
        $this->authenticatedUser = null;
    }
}
