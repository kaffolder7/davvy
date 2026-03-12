<?php

namespace App\Services\Dav;

use App\Enums\ShareResourceType;
use Illuminate\Support\Facades\DB;
use Sabre\DAV\Exception\InvalidSyncToken;

class DavSyncService
{
    private const INITIAL_SYNC_TOKEN = 1;

    /**
     * Returns current token.
     *
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @return int
     */
    public function currentToken(ShareResourceType $resourceType, int $resourceId): int
    {
        $this->initializeState($resourceType, $resourceId);

        $state = DB::table('dav_resource_sync_states')
            ->where('resource_type', $resourceType->value)
            ->where('resource_id', $resourceId)
            ->first();

        return $this->normalizePersistedToken(
            resourceType: $resourceType,
            resourceId: $resourceId,
            syncToken: (int) ($state->sync_token ?? 0),
        );
    }

    /**
     * Ensures resource.
     *
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @return void
     */
    public function ensureResource(ShareResourceType $resourceType, int $resourceId): void
    {
        $this->initializeState($resourceType, $resourceId);
    }

    /**
     * Records added.
     *
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @param  string  $uri
     * @return void
     */
    public function recordAdded(ShareResourceType $resourceType, int $resourceId, string $uri): void
    {
        $this->recordChange($resourceType, $resourceId, $uri, 'added');
    }

    /**
     * Records modified.
     *
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @param  string  $uri
     * @return void
     */
    public function recordModified(ShareResourceType $resourceType, int $resourceId, string $uri): void
    {
        $this->recordChange($resourceType, $resourceId, $uri, 'modified');
    }

    /**
     * Records deleted.
     *
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @param  string  $uri
     * @return void
     */
    public function recordDeleted(ShareResourceType $resourceType, int $resourceId, string $uri): void
    {
        $this->recordChange($resourceType, $resourceId, $uri, 'deleted');
    }

    /**
     * Returns changes since.
     *
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @param  int  $syncToken
     * @param  int|null  $limit
     * @return array
     */
    public function getChangesSince(
        ShareResourceType $resourceType,
        int $resourceId,
        int $syncToken,
        ?int $limit = null,
    ): array {
        if ($syncToken < 0) {
            throw new InvalidSyncToken('Sync token must be non-negative.');
        }

        $this->initializeState($resourceType, $resourceId);
        $state = DB::table('dav_resource_sync_states')
            ->where('resource_type', $resourceType->value)
            ->where('resource_id', $resourceId)
            ->first();

        $currentToken = $this->normalizePersistedToken(
            resourceType: $resourceType,
            resourceId: $resourceId,
            syncToken: (int) ($state->sync_token ?? 0),
        );

        if ($syncToken > $currentToken) {
            throw new InvalidSyncToken('Sync token is no longer valid for this resource.');
        }

        $query = DB::table('dav_resource_sync_changes')
            ->where('resource_type', $resourceType->value)
            ->where('resource_id', $resourceId)
            ->where('sync_token', '>', $syncToken)
            ->orderBy('sync_token');

        if ($limit !== null) {
            $query->limit($limit);
        }

        $rows = $query->get();
        $resolvedToken = (int) ($rows->max('sync_token') ?? $currentToken);

        return [
            'syncToken' => (string) max($resolvedToken, self::INITIAL_SYNC_TOKEN),
            'added' => $rows->where('operation', 'added')->pluck('uri')->unique()->values()->all(),
            'modified' => $rows->where('operation', 'modified')->pluck('uri')->unique()->values()->all(),
            'deleted' => $rows->where('operation', 'deleted')->pluck('uri')->unique()->values()->all(),
        ];
    }

    /**
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @param  string  $uri
     * @param  string  $operation
     * @return void
     */
    private function recordChange(ShareResourceType $resourceType, int $resourceId, string $uri, string $operation): void
    {
        DB::transaction(function () use ($resourceType, $resourceId, $uri, $operation): void {
            $state = DB::table('dav_resource_sync_states')
                ->where('resource_type', $resourceType->value)
                ->where('resource_id', $resourceId)
                ->lockForUpdate()
                ->first();

            if (! $state) {
                $this->initializeState($resourceType, $resourceId);

                $state = DB::table('dav_resource_sync_states')
                    ->where('resource_type', $resourceType->value)
                    ->where('resource_id', $resourceId)
                    ->lockForUpdate()
                    ->first();
            }

            $currentToken = $this->normalizePersistedToken(
                resourceType: $resourceType,
                resourceId: $resourceId,
                syncToken: (int) ($state->sync_token ?? 0),
            );

            $nextToken = $currentToken + 1;

            DB::table('dav_resource_sync_states')
                ->where('resource_type', $resourceType->value)
                ->where('resource_id', $resourceId)
                ->update([
                    'sync_token' => $nextToken,
                    'updated_at' => now(),
                ]);

            DB::table('dav_resource_sync_changes')->insert([
                'resource_type' => $resourceType->value,
                'resource_id' => $resourceId,
                'sync_token' => $nextToken,
                'operation' => $operation,
                'uri' => $uri,
                'created_at' => now(),
            ]);
        });
    }

    /**
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @return void
     */
    private function initializeState(ShareResourceType $resourceType, int $resourceId): void
    {
        DB::table('dav_resource_sync_states')->insertOrIgnore([
            'resource_type' => $resourceType->value,
            'resource_id' => $resourceId,
            'sync_token' => self::INITIAL_SYNC_TOKEN,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * @param  ShareResourceType  $resourceType
     * @param  int  $resourceId
     * @param  int  $syncToken
     * @return int
     */
    private function normalizePersistedToken(
        ShareResourceType $resourceType,
        int $resourceId,
        int $syncToken,
    ): int {
        if ($syncToken >= self::INITIAL_SYNC_TOKEN) {
            return $syncToken;
        }

        DB::table('dav_resource_sync_states')
            ->where('resource_type', $resourceType->value)
            ->where('resource_id', $resourceId)
            ->where('sync_token', '<', self::INITIAL_SYNC_TOKEN)
            ->update([
                'sync_token' => self::INITIAL_SYNC_TOKEN,
                'updated_at' => now(),
            ]);

        return self::INITIAL_SYNC_TOKEN;
    }
}
