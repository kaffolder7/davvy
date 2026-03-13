<?php

namespace App\Services\Dav\Backends;

use App\Models\User;
use App\Services\DavRequestContext;
use App\Services\PrincipalUriService;
use Sabre\DAV\PropPatch;
use Sabre\DAVACL\PrincipalBackend\AbstractBackend;

class LaravelPrincipalBackend extends AbstractBackend
{
    public function __construct(
        private readonly DavRequestContext $davContext,
        private readonly PrincipalUriService $principalUriService,
    ) {}

    /**
     * Returns principals matching a DAV prefix.
     *
     * @param  mixed  $prefixPath
     */
    public function getPrincipalsByPrefix($prefixPath): array
    {
        if ($prefixPath !== 'principals') {
            return [];
        }

        return User::query()
            ->orderBy('id')
            ->get()
            ->map(fn (User $user): array => $this->transformUser($user))
            ->all();
    }

    /**
     * Returns a principal record for a DAV path.
     *
     * @param  mixed  $path
     */
    public function getPrincipalByPath($path): ?array
    {
        $user = $this->principalUriService->userFromPrincipalUri($path);

        if (! $user) {
            return null;
        }

        return $this->transformUser($user);
    }

    /**
     * Updates mutable principal properties.
     *
     * @param  mixed  $path
     */
    public function updatePrincipal($path, PropPatch $propPatch): void
    {
        $user = $this->principalUriService->userFromPrincipalUri($path);

        if (! $user) {
            return;
        }

        $propPatch->handle(
            ['{DAV:}displayname', '{http://sabredav.org/ns}email-address'],
            function (array $mutations) use ($user): bool {
                if (array_key_exists('{DAV:}displayname', $mutations)) {
                    $user->name = (string) $mutations['{DAV:}displayname'];
                }

                if (array_key_exists('{http://sabredav.org/ns}email-address', $mutations)) {
                    $user->email = (string) $mutations['{http://sabredav.org/ns}email-address'];
                }

                $user->save();

                return true;
            }
        );
    }

    /**
     * Searches principals by property criteria.
     *
     * @param  mixed  $prefixPath
     * @param  mixed  $test
     */
    public function searchPrincipals($prefixPath, array $searchProperties, $test = 'allof'): array
    {
        if ($prefixPath !== 'principals') {
            return [];
        }

        $authenticatedUser = $this->davContext->getAuthenticatedUser();
        if (! $authenticatedUser) {
            return [];
        }

        $supportedProperties = [];
        if (array_key_exists('{DAV:}displayname', $searchProperties)) {
            $supportedProperties[] = [
                'column' => 'name',
                'value' => (string) $searchProperties['{DAV:}displayname'],
            ];
        }

        if (array_key_exists('{http://sabredav.org/ns}email-address', $searchProperties)) {
            $supportedProperties[] = [
                'column' => 'email',
                'value' => (string) $searchProperties['{http://sabredav.org/ns}email-address'],
            ];
        }

        if ($supportedProperties === []) {
            return [];
        }

        $query = User::query()->whereKey($authenticatedUser->id);
        if ($test === 'anyof') {
            $query->where(function ($builder) use ($supportedProperties): void {
                foreach ($supportedProperties as $index => $search) {
                    $method = $index === 0 ? 'where' : 'orWhere';
                    $builder->{$method}(
                        (string) $search['column'],
                        'like',
                        '%'.(string) $search['value'].'%',
                    );
                }
            });
        } else {
            foreach ($supportedProperties as $search) {
                $query->where(
                    (string) $search['column'],
                    'like',
                    '%'.(string) $search['value'].'%',
                );
            }
        }

        return $query->pluck('id')
            ->map(fn (int $id): string => 'principals/'.$id)
            ->all();
    }

    /**
     * Returns group members for a principal.
     *
     * @param  mixed  $principal
     */
    public function getGroupMemberSet($principal): array
    {
        return [];
    }

    /**
     * Returns groups containing the principal.
     *
     * @param  mixed  $principal
     */
    public function getGroupMembership($principal): array
    {
        return [];
    }

    /**
     * Updates group membership for a principal.
     *
     * @param  mixed  $principal
     */
    public function setGroupMemberSet($principal, array $members): void
    {
        // No groups in MVP.
    }

    /**
     * Returns transform user.
     */
    private function transformUser(User $user): array
    {
        return [
            'uri' => $this->principalUriService->uriForUser($user),
            '{DAV:}displayname' => $user->name,
            '{http://sabredav.org/ns}email-address' => $user->email,
        ];
    }
}
