<?php

namespace App\Services\Dav\Backends;

use App\Models\User;
use App\Services\DavRequestContext;
use App\Services\PrincipalUriService;
use App\Services\Security\AppPasswordService;
use App\Services\Security\TwoFactorSettingsService;
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
        private readonly AppPasswordService $appPasswords,
        private readonly TwoFactorSettingsService $twoFactorSettings,
    ) {}

    /**
     * Performs the check operation.
     *
     * @param  RequestInterface  $request
     * @param  ResponseInterface  $response
     * @return array
     */
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

    /**
     * @param  mixed  $username
     * @param  mixed  $password
     * @return bool
     */
    protected function validateUserPass($username, $password): bool
    {
        return $this->resolveUser((string) $username, (string) $password) !== null;
    }

    /**
     * @param  string  $username
     * @param  string  $password
     * @return User|null
     */
    private function resolveUser(string $username, string $password): ?User
    {
        $normalizedUsername = Str::lower(trim($username));
        $user = User::query()->where('email', $normalizedUsername)->first();

        if (! $user || ! $user->is_approved) {
            return null;
        }

        if ($this->appPasswords->verifyAndTouch($user, $password)) {
            $this->context->setAuthenticatedUser($user);

            return $user;
        }

        if ($this->shouldRequireAppPassword($user)) {
            return null;
        }

        if (! Hash::check($password, $user->password)) {
            return null;
        }

        $this->context->setAuthenticatedUser($user);

        return $user;
    }

    /**
     * @param  User  $user
     * @return bool
     */
    private function shouldRequireAppPassword(User $user): bool
    {
        return $user->hasTwoFactorEnabled() || $this->twoFactorSettings->isSetupRequired($user);
    }
}
