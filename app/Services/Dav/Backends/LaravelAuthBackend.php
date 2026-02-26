<?php

namespace App\Services\Dav\Backends;

use App\Models\User;
use App\Services\DavRequestContext;
use Illuminate\Support\Facades\Hash;
use Sabre\DAV\Auth\Backend\AbstractBasic;

class LaravelAuthBackend extends AbstractBasic
{
    public function __construct(private readonly DavRequestContext $context)
    {
    }

    protected function validateUserPass($username, $password): bool
    {
        $user = User::query()->where('email', $username)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            return false;
        }

        $this->context->setAuthenticatedUser($user);

        return true;
    }
}
