<?php

namespace App\Services\Dav;

use App\Enums\ShareResourceType;
use Illuminate\Support\Facades\DB;
use Sabre\DAV\Exception\InvalidSyncToken;

class DavSyncService
{
    public function currentToken(ShareResourceType $resourceType, int $resourceId): int
    {
        $this->initializeState($resourceType, $resourceId);

        $state = DB::table('dav_resource_sync_states')
            ->where('resource_type', $resourceType->value)
            ->where('resource_id', $resourceId)
            ->first();

        return (int) ($state->sync_token ?? 0);
    }

    public function ensureResource(ShareResourceType $resourceType, int $resourceId): void
    {
        $this->initializeState($resourceType, $resourceId);
    }

    public function recordAdded(ShareResourceType $resourceType, int $resourceId, string $uri): void
    {
        $this->recordChange($resourceType, $resourceId, $uri, 'added');
    }

    public function recordModified(ShareResourceType $resourceType, int $resourceId, string $uri): void
    {
        $this->recordChange($resourceType, $resourceId, $uri, 'modified');
    }

    public function recordDeleted(ShareResourceType $resourceType, int $resourceId, string $uri): void
    {
        $this->recordChange($resourceType, $resourceId, $uri, 'deleted');
    }

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

        $currentToken = (int) ($state->sync_token ?? 0);

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
        $resolvedToken = (int) ($rows->max('sync_token') ?? $syncToken);

        return [
            'syncToken' => (string) max($resolvedToken, 0),
            'added' => $rows->where('operation', 'added')->pluck('uri')->unique()->values()->all(),
            'modified' => $rows->where('operation', 'modified')->pluck('uri')->unique()->values()->all(),
            'deleted' => $rows->where('operation', 'deleted')->pluck('uri')->unique()->values()->all(),
        ];
    }

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

            $nextToken = (int) $state->sync_token + 1;

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

    private function initializeState(ShareResourceType $resourceType, int $resourceId): void
    {
        DB::table('dav_resource_sync_states')->insertOrIgnore([
            'resource_type' => $resourceType->value,
            'resource_id' => $resourceId,
            'sync_token' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
