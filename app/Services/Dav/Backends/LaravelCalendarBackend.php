<?php

namespace App\Services\Dav\Backends;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\Calendar;
use App\Models\CalendarObject;
use App\Models\ResourceShare;
use App\Services\Dav\DavSyncService;
use App\Services\Dav\IcsValidator;
use App\Services\DavRequestContext;
use App\Services\PrincipalUriService;
use App\Services\ResourceAccessService;
use Illuminate\Support\Str;
use Sabre\CalDAV\Backend\AbstractBackend;
use Sabre\DAV\Exception\BadRequest;
use Sabre\DAV\Exception\Conflict;
use Sabre\DAV\Exception\Forbidden;
use Sabre\DAV\Exception\InvalidSyncToken;
use Sabre\DAV\Exception\NotFound;
use Sabre\DAV\PropPatch;

class LaravelCalendarBackend extends AbstractBackend
{
    public function __construct(
        private readonly PrincipalUriService $principalUriService,
        private readonly ResourceAccessService $accessService,
        private readonly DavRequestContext $davContext,
        private readonly IcsValidator $icsValidator,
        private readonly DavSyncService $syncService,
    ) {}

    public function getCalendarsForUser($principalUri): array
    {
        $owner = $this->principalUriService->userFromPrincipalUri($principalUri);

        if (! $owner) {
            return [];
        }

        $own = Calendar::query()
            ->where('owner_id', $owner->id)
            ->get()
            ->map(fn (Calendar $calendar): array => $this->transformCalendar($calendar, SharePermission::Admin, $principalUri))
            ->all();

        $shared = ResourceShare::query()
            ->with('calendar')
            ->where('resource_type', ShareResourceType::Calendar)
            ->where('shared_with_id', $owner->id)
            ->get()
            ->filter(fn (ResourceShare $share): bool => $share->calendar !== null)
            ->map(function (ResourceShare $share) use ($principalUri): array {
                return $this->transformCalendar($share->calendar, $share->permission, $principalUri);
            })
            ->all();

        return [...$own, ...$shared];
    }

    public function createCalendar($principalUri, $calendarUri, array $properties): void
    {
        $user = $this->principalUriService->userFromPrincipalUri($principalUri);

        if (! $user) {
            throw new NotFound('Principal does not exist.');
        }

        $calendar = Calendar::query()->create([
            'owner_id' => $user->id,
            'uri' => Str::slug((string) $calendarUri),
            'display_name' => (string) ($properties['{DAV:}displayname'] ?? 'Calendar'),
            'description' => $properties['{urn:ietf:params:xml:ns:caldav}calendar-description'] ?? null,
            'color' => $properties['{http://apple.com/ns/ical/}calendar-color'] ?? null,
            'timezone' => $properties['{urn:ietf:params:xml:ns:caldav}calendar-timezone'] ?? null,
            'is_default' => false,
            'is_sharable' => false,
        ]);

        $this->syncService->ensureResource(ShareResourceType::Calendar, $calendar->id);
    }

    public function updateCalendar($calendarId, PropPatch $propPatch): void
    {
        $calendar = Calendar::query()->find($calendarId);

        if (! $calendar) {
            throw new NotFound('Calendar not found.');
        }

        $this->assertWritableCalendar($calendar);

        $propPatch->handle([
            '{DAV:}displayname',
            '{urn:ietf:params:xml:ns:caldav}calendar-description',
            '{http://apple.com/ns/ical/}calendar-color',
            '{urn:ietf:params:xml:ns:caldav}calendar-timezone',
        ], function (array $mutations) use ($calendar): bool {
            if (array_key_exists('{DAV:}displayname', $mutations)) {
                $calendar->display_name = (string) $mutations['{DAV:}displayname'];
            }

            if (array_key_exists('{urn:ietf:params:xml:ns:caldav}calendar-description', $mutations)) {
                $calendar->description = $mutations['{urn:ietf:params:xml:ns:caldav}calendar-description'];
            }

            if (array_key_exists('{http://apple.com/ns/ical/}calendar-color', $mutations)) {
                $calendar->color = $mutations['{http://apple.com/ns/ical/}calendar-color'];
            }

            if (array_key_exists('{urn:ietf:params:xml:ns:caldav}calendar-timezone', $mutations)) {
                $calendar->timezone = $mutations['{urn:ietf:params:xml:ns:caldav}calendar-timezone'];
            }

            $calendar->save();

            return true;
        });
    }

    public function deleteCalendar($calendarId): void
    {
        $calendar = Calendar::query()->find($calendarId);

        if (! $calendar) {
            return;
        }

        $this->assertWritableCalendar($calendar);

        $calendar->delete();
    }

    public function getCalendarObjects($calendarId): array
    {
        $calendar = $this->loadReadableCalendar($calendarId);

        return CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->orderBy('id')
            ->get()
            ->map(fn (CalendarObject $object): array => $this->transformCalendarObject($object, withData: false))
            ->all();
    }

    public function getCalendarObject($calendarId, $objectUri): ?array
    {
        $calendar = $this->loadReadableCalendar($calendarId);

        $object = CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->where('uri', $objectUri)
            ->first();

        if (! $object) {
            return null;
        }

        return $this->transformCalendarObject($object, withData: true);
    }

    public function getMultipleCalendarObjects($calendarId, array $uris): array
    {
        $calendar = $this->loadReadableCalendar($calendarId);

        return CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->whereIn('uri', $uris)
            ->get()
            ->map(fn (CalendarObject $object): array => $this->transformCalendarObject($object, withData: true))
            ->all();
    }

    public function createCalendarObject($calendarId, $objectUri, $calendarData): string
    {
        $calendar = Calendar::query()->find($calendarId);

        if (! $calendar) {
            throw new NotFound('Calendar not found.');
        }

        $this->assertWritableCalendar($calendar);

        $existing = CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->where('uri', $objectUri)
            ->exists();

        if ($existing) {
            throw new BadRequest('Calendar object already exists for the requested URI.');
        }

        $normalized = $this->icsValidator->validateAndNormalize((string) $calendarData);
        $resourceUid = $normalized['uid'] ?? $this->fallbackUidForLegacyPayload((string) $objectUri);

        if ($this->uidConflictExists($calendar->id, $resourceUid)) {
            throw new Conflict('A calendar object with the same UID already exists in this calendar.');
        }

        $etag = md5($normalized['data']);

        CalendarObject::query()->create([
            'calendar_id' => $calendar->id,
            'uri' => $objectUri,
            'uid' => $resourceUid,
            'etag' => $etag,
            'size' => strlen($normalized['data']),
            'component_type' => $normalized['component_type'],
            'first_occurred_at' => $normalized['first_occurred_at'],
            'last_occurred_at' => $normalized['last_occurred_at'],
            'data' => $normalized['data'],
        ]);

        $this->syncService->recordAdded(ShareResourceType::Calendar, $calendar->id, (string) $objectUri);

        return '"'.$etag.'"';
    }

    public function updateCalendarObject($calendarId, $objectUri, $calendarData): string
    {
        $calendar = Calendar::query()->find($calendarId);

        if (! $calendar) {
            throw new NotFound('Calendar not found.');
        }

        $this->assertWritableCalendar($calendar);

        $object = CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->where('uri', $objectUri)
            ->first();

        if (! $object) {
            throw new NotFound('Calendar object not found.');
        }

        $normalized = $this->icsValidator->validateAndNormalize((string) $calendarData);
        $resourceUid = $normalized['uid'] ?? $this->fallbackUidForLegacyPayload((string) $objectUri);

        if ($this->uidConflictExists($calendar->id, $resourceUid, exceptObjectId: $object->id)) {
            throw new Conflict('A calendar object with the same UID already exists in this calendar.');
        }

        $etag = md5($normalized['data']);

        $object->update([
            'uid' => $resourceUid,
            'etag' => $etag,
            'size' => strlen($normalized['data']),
            'component_type' => $normalized['component_type'],
            'first_occurred_at' => $normalized['first_occurred_at'],
            'last_occurred_at' => $normalized['last_occurred_at'],
            'data' => $normalized['data'],
        ]);

        $this->syncService->recordModified(ShareResourceType::Calendar, $calendar->id, (string) $objectUri);

        return '"'.$etag.'"';
    }

    public function deleteCalendarObject($calendarId, $objectUri): void
    {
        $calendar = Calendar::query()->find($calendarId);

        if (! $calendar) {
            return;
        }

        $this->assertWritableCalendar($calendar);

        $object = CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->where('uri', $objectUri)
            ->first();

        if (! $object) {
            return;
        }

        $object->delete();

        $this->syncService->recordDeleted(ShareResourceType::Calendar, $calendar->id, (string) $objectUri);
    }

    public function calendarQuery($calendarId, array $filters): array
    {
        $calendar = $this->loadReadableCalendar($calendarId);

        return CalendarObject::query()
            ->where('calendar_id', $calendar->id)
            ->pluck('uri')
            ->all();
    }

    public function getChangesForCalendar($calendarId, $syncToken, $syncLevel, $limit = null): array
    {
        $calendar = $this->loadReadableCalendar($calendarId);

        return $this->syncService->getChangesSince(
            resourceType: ShareResourceType::Calendar,
            resourceId: $calendar->id,
            syncToken: $this->parseSyncToken($syncToken),
            limit: $limit !== null ? (int) $limit : null,
        );
    }

    private function transformCalendar(Calendar $calendar, SharePermission $permission, string $principalUri): array
    {
        return [
            'id' => $calendar->id,
            'uri' => $calendar->uri,
            'principaluri' => $principalUri,
            '{DAV:}displayname' => $calendar->display_name,
            '{urn:ietf:params:xml:ns:caldav}calendar-description' => $calendar->description,
            '{http://apple.com/ns/ical/}calendar-color' => $calendar->color,
            '{urn:ietf:params:xml:ns:caldav}calendar-timezone' => $calendar->timezone,
            '{http://sabredav.org/ns}read-only' => ! $permission->canWrite(),
        ];
    }

    private function transformCalendarObject(CalendarObject $object, bool $withData): array
    {
        $data = [
            'id' => $object->id,
            'uri' => $object->uri,
            'lastmodified' => $object->updated_at?->timestamp ?? time(),
            'etag' => '"'.$object->etag.'"',
            'size' => $object->size,
        ];

        if ($withData) {
            $data['calendardata'] = $object->data;
        }

        return $data;
    }

    private function loadReadableCalendar(int $calendarId): Calendar
    {
        $calendar = Calendar::query()->find($calendarId);

        if (! $calendar) {
            throw new NotFound('Calendar not found.');
        }

        $user = $this->davContext->getAuthenticatedUser();

        if (! $user || ! $this->accessService->userCanReadCalendar($user, $calendar)) {
            throw new Forbidden('Read access denied for calendar.');
        }

        return $calendar;
    }

    private function assertWritableCalendar(Calendar $calendar): void
    {
        $user = $this->davContext->getAuthenticatedUser();

        if (! $user || ! $this->accessService->userCanWriteCalendar($user, $calendar)) {
            throw new Forbidden('Write access denied for calendar.');
        }
    }

    private function parseSyncToken(mixed $syncToken): int
    {
        if (is_int($syncToken) && $syncToken >= 0) {
            return $syncToken;
        }

        if (is_string($syncToken)) {
            $token = trim($syncToken);

            if (preg_match('/^\d+$/', $token) === 1) {
                return (int) $token;
            }
        }

        throw new InvalidSyncToken('Sync token format is invalid.');
    }

    private function uidConflictExists(int $calendarId, string $uid, ?int $exceptObjectId = null): bool
    {
        $query = CalendarObject::query()
            ->where('calendar_id', $calendarId)
            ->where('uid', $uid);

        if ($exceptObjectId !== null) {
            $query->where('id', '!=', $exceptObjectId);
        }

        return $query->exists();
    }

    private function fallbackUidForLegacyPayload(string $objectUri): string
    {
        return 'legacy-calendar-'.sha1($objectUri);
    }
}
