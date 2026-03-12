<?php

namespace App\Services;

use App\Models\User;

class DavRequestContext
{
    private ?User $authenticatedUser = null;

    /**
     * @param  User  $user
     * @return void
     */
    public function setAuthenticatedUser(User $user): void
    {
        $this->authenticatedUser = $user;
    }

    /**
     * @return User|null
     */
    public function getAuthenticatedUser(): ?User
    {
        return $this->authenticatedUser;
    }

    /**
     * @return void
     */
    public function clear(): void
    {
        $this->authenticatedUser = null;
    }
}
