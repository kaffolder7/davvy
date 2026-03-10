<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use App\Services\Contacts\ContactChangeRequestService;
use App\Services\Contacts\ContactService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ContactController extends Controller
{
    public function __construct(
        private readonly ContactService $contactService,
        private readonly ContactChangeRequestService $changeRequestService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $contacts = $this->contactService
            ->contactsFor($user)
            ->map(fn (Contact $contact): array => $this->serializeContact($contact))
            ->all();

        return response()->json([
            'contacts' => $contacts,
            'address_books' => $this->contactService->writableAddressBooksFor($user)->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        [$payload, $addressBookIds] = $this->validatedInput(
            request: $request,
            currentContactId: null,
            ownerId: (int) $request->user()->id,
        );

        $contact = $this->contactService->create(
            actor: $request->user(),
            payload: $payload,
            addressBookIds: $addressBookIds,
        );

        return response()->json($this->serializeContact($contact), 201);
    }

    public function update(Request $request, int $contact): JsonResponse
    {
        $model = Contact::query()->findOrFail($contact);
        [$payload, $addressBookIds] = $this->validatedInput(
            request: $request,
            currentContactId: (int) $model->id,
            ownerId: (int) $model->owner_id,
        );

        $queued = $this->changeRequestService->enqueueWebUpdateIfNeeded(
            actor: $request->user(),
            contact: $model,
            payload: $payload,
            addressBookIds: $addressBookIds,
        );

        if ($queued !== null) {
            return response()->json([
                'queued' => true,
                'message' => 'This change was submitted for owner/admin approval.',
                'group_uuid' => $queued['group_uuid'],
                'request_ids' => $queued['request_ids'],
            ], 202);
        }

        $updated = $this->contactService->update(
            actor: $request->user(),
            contact: $model,
            payload: $payload,
            addressBookIds: $addressBookIds,
        );

        return response()->json($this->serializeContact($updated));
    }

    public function destroy(Request $request, int $contact): JsonResponse
    {
        $model = Contact::query()->findOrFail($contact);

        $queued = $this->changeRequestService->enqueueWebDeleteIfNeeded(
            actor: $request->user(),
            contact: $model,
        );

        if ($queued !== null) {
            return response()->json([
                'queued' => true,
                'message' => 'This delete request was submitted for owner/admin approval.',
                'group_uuid' => $queued['group_uuid'],
                'request_ids' => $queued['request_ids'],
            ], 202);
        }

        $this->contactService->delete($request->user(), $model);

        return response()->json(['ok' => true]);
    }

    /**
     * @return array{0: array<string,mixed>, 1: array<int, int>}
     */
    private function validatedInput(
        Request $request,
        ?int $currentContactId = null,
        ?int $ownerId = null,
    ): array
    {
        $data = $request->validate([
            'prefix' => ['nullable', 'string', 'max:100'],
            'first_name' => ['nullable', 'string', 'max:150'],
            'middle_name' => ['nullable', 'string', 'max:150'],
            'last_name' => ['nullable', 'string', 'max:150'],
            'suffix' => ['nullable', 'string', 'max:100'],
            'nickname' => ['nullable', 'string', 'max:150'],
            'company' => ['nullable', 'string', 'max:255'],
            'job_title' => ['nullable', 'string', 'max:255'],
            'department' => ['nullable', 'string', 'max:255'],
            'pronouns' => ['nullable', 'string', 'max:100'],
            'pronouns_custom' => ['nullable', 'string', 'max:100'],
            'ringtone' => ['nullable', 'string', 'max:255'],
            'text_tone' => ['nullable', 'string', 'max:255'],
            'phonetic_first_name' => ['nullable', 'string', 'max:150'],
            'phonetic_last_name' => ['nullable', 'string', 'max:150'],
            'phonetic_company' => ['nullable', 'string', 'max:255'],
            'maiden_name' => ['nullable', 'string', 'max:150'],
            'verification_code' => ['nullable', 'string', 'max:255'],
            'profile' => ['nullable', 'string', 'max:255'],
            'head_of_household' => ['sometimes', 'boolean'],
            'exclude_milestone_calendars' => ['sometimes', 'boolean'],
            'birthday' => ['nullable', 'array'],
            'birthday.year' => ['nullable', 'integer', 'between:1,9999'],
            'birthday.month' => ['nullable', 'integer', 'between:1,12'],
            'birthday.day' => ['nullable', 'integer', 'between:1,31'],
            'phones' => ['nullable', 'array'],
            'phones.*.label' => ['nullable', 'string', 'max:64'],
            'phones.*.custom_label' => ['nullable', 'string', 'max:100'],
            'phones.*.value' => ['nullable', 'string', 'max:255'],
            'emails' => ['nullable', 'array'],
            'emails.*.label' => ['nullable', 'string', 'max:64'],
            'emails.*.custom_label' => ['nullable', 'string', 'max:100'],
            'emails.*.value' => ['nullable', 'string', 'max:255'],
            'urls' => ['nullable', 'array'],
            'urls.*.label' => ['nullable', 'string', 'max:64'],
            'urls.*.custom_label' => ['nullable', 'string', 'max:100'],
            'urls.*.value' => ['nullable', 'string', 'max:500'],
            'addresses' => ['nullable', 'array'],
            'addresses.*.label' => ['nullable', 'string', 'max:64'],
            'addresses.*.custom_label' => ['nullable', 'string', 'max:100'],
            'addresses.*.street' => ['nullable', 'string', 'max:255'],
            'addresses.*.city' => ['nullable', 'string', 'max:150'],
            'addresses.*.state' => ['nullable', 'string', 'max:150'],
            'addresses.*.postal_code' => ['nullable', 'string', 'max:64'],
            'addresses.*.country' => ['nullable', 'string', 'max:150'],
            'dates' => ['nullable', 'array'],
            'dates.*.label' => ['nullable', 'string', 'max:64'],
            'dates.*.custom_label' => ['nullable', 'string', 'max:100'],
            'dates.*.year' => ['nullable', 'integer', 'between:1,9999'],
            'dates.*.month' => ['nullable', 'integer', 'between:1,12'],
            'dates.*.day' => ['nullable', 'integer', 'between:1,31'],
            'related_names' => ['nullable', 'array'],
            'related_names.*.label' => ['nullable', 'string', 'max:64'],
            'related_names.*.custom_label' => ['nullable', 'string', 'max:100'],
            'related_names.*.value' => ['nullable', 'string', 'max:255'],
            'related_names.*.related_contact_id' => ['nullable', 'integer', 'min:1'],
            'instant_messages' => ['nullable', 'array'],
            'instant_messages.*.label' => ['nullable', 'string', 'max:64'],
            'instant_messages.*.custom_label' => ['nullable', 'string', 'max:100'],
            'instant_messages.*.value' => ['nullable', 'string', 'max:255'],
            'address_book_ids' => ['required', 'array', 'min:1'],
            'address_book_ids.*' => ['integer', 'min:1'],
        ]);

        $relatedContactDisplayNames = $this->resolveRelatedContactDisplayNames(
            request: $request,
            rows: is_array($data['related_names'] ?? null) ? $data['related_names'] : [],
            currentContactId: $currentContactId,
            ownerId: $ownerId,
        );

        $payload = [
            'prefix' => $this->normalizeString($data['prefix'] ?? null),
            'first_name' => $this->normalizeString($data['first_name'] ?? null),
            'middle_name' => $this->normalizeString($data['middle_name'] ?? null),
            'last_name' => $this->normalizeString($data['last_name'] ?? null),
            'suffix' => $this->normalizeString($data['suffix'] ?? null),
            'nickname' => $this->normalizeString($data['nickname'] ?? null),
            'company' => $this->normalizeString($data['company'] ?? null),
            'job_title' => $this->normalizeString($data['job_title'] ?? null),
            'department' => $this->normalizeString($data['department'] ?? null),
            'pronouns' => $this->normalizeString($data['pronouns'] ?? null),
            'pronouns_custom' => $this->normalizeString($data['pronouns_custom'] ?? null),
            'ringtone' => $this->normalizeString($data['ringtone'] ?? null),
            'text_tone' => $this->normalizeString($data['text_tone'] ?? null),
            'phonetic_first_name' => $this->normalizeString($data['phonetic_first_name'] ?? null),
            'phonetic_last_name' => $this->normalizeString($data['phonetic_last_name'] ?? null),
            'phonetic_company' => $this->normalizeString($data['phonetic_company'] ?? null),
            'maiden_name' => $this->normalizeString($data['maiden_name'] ?? null),
            'verification_code' => $this->normalizeString($data['verification_code'] ?? null),
            'profile' => $this->normalizeString($data['profile'] ?? null),
            'head_of_household' => (bool) ($data['head_of_household'] ?? false),
            'exclude_milestone_calendars' => (bool) ($data['exclude_milestone_calendars'] ?? false),
            'birthday' => $this->normalizeDateParts($data['birthday'] ?? []),
            'phones' => $this->normalizeValueRows($data['phones'] ?? []),
            'emails' => $this->normalizeValueRows($data['emails'] ?? []),
            'urls' => $this->normalizeValueRows($data['urls'] ?? []),
            'addresses' => $this->normalizeAddressRows($data['addresses'] ?? []),
            'dates' => $this->normalizeDateRows($data['dates'] ?? []),
            'related_names' => $this->normalizeRelatedNameRows(
                $data['related_names'] ?? [],
                $relatedContactDisplayNames,
            ),
            'instant_messages' => $this->normalizeValueRows($data['instant_messages'] ?? []),
        ];

        if (
            $payload['first_name'] === null
            && $payload['last_name'] === null
            && $payload['company'] === null
        ) {
            throw ValidationException::withMessages([
                'first_name' => ['Enter at least a first name, last name, or company.'],
            ]);
        }

        $addressBookIds = collect($data['address_book_ids'] ?? [])
            ->map(fn (mixed $id): int => (int) $id)
            ->filter(fn (int $id): bool => $id > 0)
            ->unique()
            ->values()
            ->all();

        return [$payload, $addressBookIds];
    }

    private function serializeContact(Contact $contact): array
    {
        $payload = is_array($contact->payload) ? $contact->payload : [];

        $addressBooks = $contact->assignments
            ->filter(fn ($assignment): bool => $assignment->addressBook !== null)
            ->map(fn ($assignment): array => [
                'id' => $assignment->addressBook->id,
                'uri' => $assignment->addressBook->uri,
                'display_name' => $assignment->addressBook->display_name,
                'card_uri' => $assignment->card_uri,
            ])
            ->values();

        return array_merge(
            [
                'id' => $contact->id,
                'uid' => $contact->uid,
                'display_name' => $contact->full_name ?: 'Unnamed Contact',
                'address_book_ids' => $addressBooks->pluck('id')->all(),
                'address_books' => $addressBooks->all(),
            ],
            $payload,
        );
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return array<int, array{label:string, custom_label:?string, value:string}>
     */
    private function normalizeValueRows(array $rows): array
    {
        return collect($rows)
            ->filter(fn (mixed $row): bool => is_array($row))
            ->map(function (array $row): array {
                return [
                    'label' => strtolower($this->normalizeString($row['label'] ?? null) ?? 'other'),
                    'custom_label' => $this->normalizeString($row['custom_label'] ?? null),
                    'value' => $this->normalizeString($row['value'] ?? null) ?? '',
                ];
            })
            ->filter(fn (array $row): bool => $row['value'] !== '')
            ->values()
            ->all();
    }

    /**
     * @param  array<int, mixed>  $rows
     * @param  array<int, string>  $relatedContactDisplayNames
     * @return array<int, array{label:string, custom_label:?string, value:string, related_contact_id:?int}>
     */
    private function normalizeRelatedNameRows(array $rows, array $relatedContactDisplayNames): array
    {
        return collect($rows)
            ->filter(fn (mixed $row): bool => is_array($row))
            ->map(function (array $row) use ($relatedContactDisplayNames): array {
                $relatedContactId = $this->normalizeInt($row['related_contact_id'] ?? null);
                $resolvedName = $relatedContactId !== null
                    ? ($relatedContactDisplayNames[$relatedContactId] ?? null)
                    : null;

                return [
                    'label' => strtolower($this->normalizeString($row['label'] ?? null) ?? 'other'),
                    'custom_label' => $this->normalizeString($row['custom_label'] ?? null),
                    'value' => $resolvedName ?? $this->normalizeString($row['value'] ?? null) ?? '',
                    'related_contact_id' => $resolvedName !== null ? $relatedContactId : null,
                ];
            })
            ->filter(fn (array $row): bool => $row['value'] !== '')
            ->values()
            ->all();
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return array<int, string>
     */
    private function resolveRelatedContactDisplayNames(
        Request $request,
        array $rows,
        ?int $currentContactId,
        ?int $ownerId,
    ): array {
        $requestedByIndex = collect($rows)
            ->map(fn (mixed $row): mixed => is_array($row) ? $row : null)
            ->filter(fn (mixed $row): bool => is_array($row))
            ->map(function (array $row, int $index): array {
                return [
                    'index' => $index,
                    'related_contact_id' => $this->normalizeInt($row['related_contact_id'] ?? null),
                ];
            })
            ->filter(fn (array $entry): bool => $entry['related_contact_id'] !== null)
            ->values();

        if ($requestedByIndex->isEmpty()) {
            return [];
        }

        foreach ($requestedByIndex as $entry) {
            $relatedContactId = (int) $entry['related_contact_id'];
            if ($currentContactId !== null && $relatedContactId === $currentContactId) {
                throw ValidationException::withMessages([
                    'related_names.'.$entry['index'].'.related_contact_id' => [
                        'A contact cannot reference itself as a related name.',
                    ],
                ]);
            }
        }

        $writableContactsById = $this->contactService
            ->contactsFor($request->user())
            ->keyBy('id');

        $displayNames = [];
        foreach ($requestedByIndex as $entry) {
            $index = (int) $entry['index'];
            $relatedContactId = (int) $entry['related_contact_id'];
            /** @var Contact|null $contact */
            $contact = $writableContactsById->get($relatedContactId);

            if ($contact === null) {
                throw ValidationException::withMessages([
                    'related_names.'.$index.'.related_contact_id' => [
                        'Select a valid contact from your contacts list.',
                    ],
                ]);
            }

            if ($ownerId !== null && (int) $contact->owner_id !== $ownerId) {
                throw ValidationException::withMessages([
                    'related_names.'.$index.'.related_contact_id' => [
                        'Related contacts must belong to the same contact owner.',
                    ],
                ]);
            }

            $displayNames[$relatedContactId] = $contact->full_name ?: 'Unnamed Contact';
        }

        return $displayNames;
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return array<int, array{label:string, custom_label:?string, street:?string, city:?string, state:?string, postal_code:?string, country:?string}>
     */
    private function normalizeAddressRows(array $rows): array
    {
        return collect($rows)
            ->filter(fn (mixed $row): bool => is_array($row))
            ->map(function (array $row): array {
                return [
                    'label' => strtolower($this->normalizeString($row['label'] ?? null) ?? 'other'),
                    'custom_label' => $this->normalizeString($row['custom_label'] ?? null),
                    'street' => $this->normalizeString($row['street'] ?? null),
                    'city' => $this->normalizeString($row['city'] ?? null),
                    'state' => $this->normalizeString($row['state'] ?? null),
                    'postal_code' => $this->normalizeString($row['postal_code'] ?? null),
                    'country' => $this->normalizeString($row['country'] ?? null),
                ];
            })
            ->filter(function (array $row): bool {
                return $row['street'] !== null
                    || $row['city'] !== null
                    || $row['state'] !== null
                    || $row['postal_code'] !== null
                    || $row['country'] !== null;
            })
            ->values()
            ->all();
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return array<int, array{label:string, custom_label:?string, year:?int, month:?int, day:?int}>
     */
    private function normalizeDateRows(array $rows): array
    {
        return collect($rows)
            ->filter(fn (mixed $row): bool => is_array($row))
            ->map(function (array $row): array {
                $parts = $this->normalizeDateParts($row);

                return [
                    'label' => strtolower($this->normalizeString($row['label'] ?? null) ?? 'other'),
                    'custom_label' => $this->normalizeString($row['custom_label'] ?? null),
                    'year' => $parts['year'],
                    'month' => $parts['month'],
                    'day' => $parts['day'],
                ];
            })
            ->filter(fn (array $row): bool => $row['month'] !== null && $row['day'] !== null)
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $parts
     * @return array{year:?int, month:?int, day:?int}
     */
    private function normalizeDateParts(array $parts): array
    {
        return [
            'year' => $this->normalizeInt($parts['year'] ?? null),
            'month' => $this->normalizeInt($parts['month'] ?? null),
            'day' => $this->normalizeInt($parts['day'] ?? null),
        ];
    }

    private function normalizeString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    private function normalizeInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value)) {
            return $value;
        }

        if (is_string($value) && preg_match('/^-?\d+$/', $value) === 1) {
            return (int) $value;
        }

        return null;
    }
}
