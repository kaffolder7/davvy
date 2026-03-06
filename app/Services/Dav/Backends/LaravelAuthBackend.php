<?php

namespace App\Services\Dav\Backends;

use App\Models\User;
use App\Services\DavRequestContext;
use App\Services\PrincipalUriService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Sabre\DAV\Auth\Backend\AbstractBasic;
use Sabre\HTTP\Auth\Basic;
use Sabre\HTTP\RequestInterface;
use Sabre\HTTP\ResponseInterface;

class LaravelAuthBackend extends AbstractBasic
{
    public function __construct(
        private readonly DavRequestContext $context,
        private readonly PrincipalUriService $principalUriService,
    ) {}

    public function check(RequestInterface $request, ResponseInterface $response): array
    {
        $auth = new Basic($this->realm, $request, $response);
        $userpass = $auth->getCredentials();

        if (! $userpass) {
            return [false, "No 'Authorization: Basic' header found. Either the client didn't send one, or the server is misconfigured"];
        }

        $user = $this->resolveUser($userpass[0], $userpass[1]);

        if (! $user) {
            return [false, 'Username or password was incorrect'];
        }

        return [true, $this->principalUriService->uriForUser($user)];
    }

    protected function validateUserPass($username, $password): bool
    {
        return $this->resolveUser((string) $username, (string) $password) !== null;
    }

    private function resolveUser(string $username, string $password): ?User
    {
        $normalizedUsername = Str::lower(trim($username));
        $user = User::query()->where('email', $normalizedUsername)->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            return null;
        }

        $this->context->setAuthenticatedUser($user);

        return $user;
    }
}
