<?php

namespace App\Services\Contacts;

use App\Models\Contact;
use Illuminate\Support\Arr;
use Sabre\VObject\Component\VCard;
use Sabre\VObject\ParseException;
use Sabre\VObject\Reader;

class ContactVCardService
{
    private const PHONE_TYPE_MAP = [
        'mobile' => ['CELL'],
        'iphone' => ['IPHONE'],
        'apple_watch' => ['APPLEWATCH'],
        'home' => ['HOME'],
        'work' => ['WORK'],
        'main' => ['PREF', 'VOICE'],
        'home_fax' => ['HOME', 'FAX'],
        'work_fax' => ['WORK', 'FAX'],
        'other_fax' => ['FAX'],
        'pager' => ['PAGER'],
        'other' => ['VOICE'],
    ];

    private const SIMPLE_LABEL_TYPE_MAP = [
        'home' => ['HOME'],
        'work' => ['WORK'],
        'school' => ['SCHOOL'],
        'other' => ['OTHER'],
        'homepage' => ['HOME'],
    ];

    private const RELATED_LABELS = [
        'spouse',
        'partner',
        'parent',
        'child',
        'sibling',
        'assistant',
        'friend',
    ];
    private const RELATED_CONTACT_ID_PARAMETER = 'X-DAVVY-RELATED-CONTACT-ID';

    public function displayName(array $payload): string
    {
        $namePieces = [
            $this->cleanString($payload['prefix'] ?? null),
            $this->cleanString($payload['first_name'] ?? null),
            $this->cleanString($payload['middle_name'] ?? null),
            $this->cleanString($payload['last_name'] ?? null),
            $this->cleanString($payload['suffix'] ?? null),
        ];

        $name = trim(implode(' ', array_filter($namePieces, fn (?string $value): bool => $value !== null)));
        if ($name !== '') {
            return $name;
        }

        $fallbacks = [
            $this->cleanString($payload['nickname'] ?? null),
            $this->cleanString($payload['company'] ?? null),
            $this->firstRowValue($payload['emails'] ?? []),
            $this->firstRowValue($payload['phones'] ?? []),
        ];

        foreach ($fallbacks as $fallback) {
            if ($fallback !== null && $fallback !== '') {
                return $fallback;
            }
        }

        return 'Unnamed Contact';
    }

    public function build(Contact $contact): string
    {
        $payload = $contact->payload ?? [];
        $fullName = $this->displayName($payload);

        $vCard = new VCard;
        $this->setSingletonProperty($vCard, 'VERSION', '4.0');
        $this->setSingletonProperty($vCard, 'UID', $contact->uid);
        $this->setSingletonProperty($vCard, 'FN', $fullName);
        $this->setSingletonProperty(
            $vCard,
            'N',
            [
                $this->cleanString($payload['last_name'] ?? null) ?? '',
                $this->cleanString($payload['first_name'] ?? null) ?? '',
                $this->cleanString($payload['middle_name'] ?? null) ?? '',
                $this->cleanString($payload['prefix'] ?? null) ?? '',
                $this->cleanString($payload['suffix'] ?? null) ?? '',
            ],
        );

        $this->addSimpleProperty($vCard, 'NICKNAME', $payload['nickname'] ?? null);
        $this->addSimpleProperty($vCard, 'TITLE', $payload['job_title'] ?? null);

        $company = $this->cleanString($payload['company'] ?? null);
        $department = $this->cleanString($payload['department'] ?? null);
        if ($company !== null || $department !== null) {
            $vCard->add('ORG', [
                $company ?? '',
                $department ?? '',
            ]);
        }

        foreach ($this->rows($payload['phones'] ?? []) as $row) {
            $value = $this->cleanString($row['value'] ?? null);
            if ($value === null) {
                continue;
            }

            $property = $vCard->add('TEL', $value);
            $types = $this->phoneTypesForLabel($row['label'] ?? null);
            if ($types !== []) {
                $property['TYPE'] = implode(',', $types);
            }

            $customLabel = $this->cleanString($row['custom_label'] ?? null);
            if ($customLabel !== null) {
                $property['X-ABLabel'] = $customLabel;
            }
        }

        foreach ($this->rows($payload['emails'] ?? []) as $row) {
            $value = $this->cleanString($row['value'] ?? null);
            if ($value === null) {
                continue;
            }

            $property = $vCard->add('EMAIL', $value);
            $types = $this->typesForSimpleLabel($row['label'] ?? null);
            if ($types !== []) {
                $property['TYPE'] = implode(',', $types);
            }

            $customLabel = $this->cleanString($row['custom_label'] ?? null);
            if ($customLabel !== null) {
                $property['X-ABLabel'] = $customLabel;
            }
        }

        foreach ($this->rows($payload['urls'] ?? []) as $row) {
            $value = $this->cleanString($row['value'] ?? null);
            if ($value === null) {
                continue;
            }

            $property = $vCard->add('URL', $value);
            $types = $this->typesForSimpleLabel($row['label'] ?? null);
            if ($types !== []) {
                $property['TYPE'] = implode(',', $types);
            }

            $customLabel = $this->cleanString($row['custom_label'] ?? null);
            if ($customLabel !== null) {
                $property['X-ABLabel'] = $customLabel;
            }
        }

        foreach ($this->rows($payload['addresses'] ?? []) as $row) {
            $street = $this->cleanString($row['street'] ?? null);
            $city = $this->cleanString($row['city'] ?? null);
            $region = $this->cleanString($row['state'] ?? null);
            $postalCode = $this->cleanString($row['postal_code'] ?? null);
            $country = $this->cleanString($row['country'] ?? null);

            if ($street === null && $city === null && $region === null && $postalCode === null && $country === null) {
                continue;
            }

            $property = $vCard->add('ADR', [
                '',
                '',
                $street ?? '',
                $city ?? '',
                $region ?? '',
                $postalCode ?? '',
                $country ?? '',
            ]);

            $types = $this->typesForSimpleLabel($row['label'] ?? null);
            if ($types !== []) {
                $property['TYPE'] = implode(',', $types);
            }

            $customLabel = $this->cleanString($row['custom_label'] ?? null);
            if ($customLabel !== null) {
                $property['X-ABLabel'] = $customLabel;
            }
        }

        $birthday = $this->dateString($payload['birthday'] ?? []);
        if ($birthday !== null) {
            $vCard->add('BDAY', $birthday);
        }

        $addedAnniversary = false;
        foreach ($this->rows($payload['dates'] ?? []) as $row) {
            $value = $this->dateString($row);
            if ($value === null) {
                continue;
            }

            $label = strtolower((string) ($row['label'] ?? 'other'));
            if ($label === 'anniversary' && ! $addedAnniversary) {
                $vCard->add('ANNIVERSARY', $value);
                $addedAnniversary = true;

                continue;
            }

            $property = $vCard->add('X-ABDATE', $value);
            $property['X-ABLabel'] = $this->customLabelOrLabel($row);
        }

        foreach ($this->rows($payload['related_names'] ?? []) as $row) {
            $value = $this->cleanString($row['value'] ?? null);
            if ($value === null) {
                continue;
            }

            $property = $vCard->add('RELATED', $value);
            $types = $this->typesForSimpleLabel($row['label'] ?? null);
            if ($types !== []) {
                $property['TYPE'] = implode(',', $types);
            }

            $relatedContactId = $this->toInteger($row['related_contact_id'] ?? null);
            if ($relatedContactId !== null && $relatedContactId > 0) {
                $property[self::RELATED_CONTACT_ID_PARAMETER] = (string) $relatedContactId;
            }

            $customLabel = $this->cleanString($row['custom_label'] ?? null);
            if ($customLabel !== null) {
                $property['X-ABLabel'] = $customLabel;
            }
        }

        foreach ($this->rows($payload['instant_messages'] ?? []) as $row) {
            $value = $this->cleanString($row['value'] ?? null);
            if ($value === null) {
                continue;
            }

            $property = $vCard->add('IMPP', $value);
            $types = $this->typesForSimpleLabel($row['label'] ?? null);
            if ($types !== []) {
                $property['TYPE'] = implode(',', $types);
            }

            $customLabel = $this->cleanString($row['custom_label'] ?? null);
            if ($customLabel !== null) {
                $property['X-ABLabel'] = $customLabel;
            }
        }

        $pronouns = $this->cleanString($payload['pronouns_custom'] ?? null)
            ?? $this->cleanString($payload['pronouns'] ?? null);

        $this->addSimpleProperty($vCard, 'X-PHONETIC-FIRST-NAME', $payload['phonetic_first_name'] ?? null);
        $this->addSimpleProperty($vCard, 'X-PHONETIC-LAST-NAME', $payload['phonetic_last_name'] ?? null);
        $this->addSimpleProperty($vCard, 'X-PHONETIC-COMPANY', $payload['phonetic_company'] ?? null);
        $this->addSimpleProperty($vCard, 'X-MAIDEN-NAME', $payload['maiden_name'] ?? null);
        $this->addSimpleProperty($vCard, 'X-DAVVY-PRONOUNS', $pronouns);
        $this->addSimpleProperty($vCard, 'X-DAVVY-RINGTONE', $payload['ringtone'] ?? null);
        $this->addSimpleProperty($vCard, 'X-DAVVY-TEXT-TONE', $payload['text_tone'] ?? null);
        $this->addSimpleProperty($vCard, 'X-DAVVY-VERIFICATION-CODE', $payload['verification_code'] ?? null);
        $this->addSimpleProperty($vCard, 'X-DAVVY-PROFILE', $payload['profile'] ?? null);
        $this->addSimpleProperty(
            $vCard,
            'X-DAVVY-HEAD-OF-HOUSEHOLD',
            ! empty($payload['head_of_household']) ? '1' : null,
        );
        $this->addSimpleProperty(
            $vCard,
            'X-DAVVY-EXCLUDE-MILESTONES',
            ! empty($payload['exclude_milestone_calendars']) ? '1' : null,
        );
        $this->addSimpleProperty($vCard, 'X-DAVVY-CONTACT-ID', (string) $contact->id);
        $this->addSimpleProperty($vCard, 'X-DAVVY-CONTACT-OWNER', (string) $contact->owner_id);

        $data = $vCard->serialize();
        $vCard->destroy();

        return $data;
    }

    /**
     * @return array{
     *   uid:?string,
     *   payload:array<string,mixed>,
     *   managed_contact_id:?int,
     *   managed_owner_id:?int
     * }|null
     */
    public function parse(string $cardData): ?array
    {
        try {
            $component = Reader::read($cardData);
        } catch (ParseException|\Throwable) {
            return null;
        }

        if (! $component instanceof VCard) {
            return null;
        }

        $payload = $this->emptyPayload();

        $name = $this->firstProperty($component, 'N');
        if ($name !== null) {
            $nameParts = $this->propertyParts($name, 5);
            $payload['last_name'] = $this->cleanString($nameParts[0] ?? null);
            $payload['first_name'] = $this->cleanString($nameParts[1] ?? null);
            $payload['middle_name'] = $this->cleanString($nameParts[2] ?? null);
            $payload['prefix'] = $this->cleanString($nameParts[3] ?? null);
            $payload['suffix'] = $this->cleanString($nameParts[4] ?? null);
        }

        $payload['nickname'] = $this->firstPropertyValue($component, 'NICKNAME');
        $payload['job_title'] = $this->firstPropertyValue($component, 'TITLE');
        $payload['phonetic_first_name'] = $this->firstPropertyValue($component, 'X-PHONETIC-FIRST-NAME');
        $payload['phonetic_last_name'] = $this->firstPropertyValue($component, 'X-PHONETIC-LAST-NAME');
        $payload['phonetic_company'] = $this->firstPropertyValue($component, 'X-PHONETIC-COMPANY');
        $payload['maiden_name'] = $this->firstPropertyValue($component, 'X-MAIDEN-NAME');
        $payload['pronouns'] = $this->firstPropertyValue($component, 'X-DAVVY-PRONOUNS');
        $payload['ringtone'] = $this->firstPropertyValue($component, 'X-DAVVY-RINGTONE');
        $payload['text_tone'] = $this->firstPropertyValue($component, 'X-DAVVY-TEXT-TONE');
        $payload['verification_code'] = $this->firstPropertyValue($component, 'X-DAVVY-VERIFICATION-CODE');
        $payload['profile'] = $this->firstPropertyValue($component, 'X-DAVVY-PROFILE');
        $payload['head_of_household'] = $this->toBoolean(
            $this->firstPropertyValue($component, 'X-DAVVY-HEAD-OF-HOUSEHOLD'),
        );
        $payload['exclude_milestone_calendars'] = $this->toBoolean(
            $this->firstPropertyValue($component, 'X-DAVVY-EXCLUDE-MILESTONES'),
        );

        $organization = $this->firstProperty($component, 'ORG');
        if ($organization !== null) {
            $orgParts = $this->propertyParts($organization, 2);
            $payload['company'] = $this->cleanString($orgParts[0] ?? null);
            $payload['department'] = $this->cleanString($orgParts[1] ?? null);
        }

        $birthday = $this->parseDateParts($this->firstPropertyValue($component, 'BDAY'));
        if ($birthday !== null) {
            $payload['birthday'] = $birthday;
        }

        foreach ($component->select('TEL') as $property) {
            $value = $this->cleanString((string) $property);
            if ($value === null) {
                continue;
            }

            [$label, $customLabel] = $this->phoneLabelForProperty($property);
            $payload['phones'][] = [
                'label' => $label,
                'custom_label' => $customLabel,
                'value' => $value,
            ];
        }

        foreach ($component->select('EMAIL') as $property) {
            $value = $this->cleanString((string) $property);
            if ($value === null) {
                continue;
            }

            [$label, $customLabel] = $this->simpleLabelForProperty($property, fallback: 'other');
            $payload['emails'][] = [
                'label' => $label,
                'custom_label' => $customLabel,
                'value' => $value,
            ];
        }

        foreach ($component->select('URL') as $property) {
            $value = $this->cleanString((string) $property);
            if ($value === null) {
                continue;
            }

            [$label, $customLabel] = $this->urlLabelForProperty($property);
            $payload['urls'][] = [
                'label' => $label,
                'custom_label' => $customLabel,
                'value' => $value,
            ];
        }

        foreach ($component->select('ADR') as $property) {
            $parts = $this->propertyParts($property, 7);
            $street = $this->cleanString($parts[2] ?? null);
            $city = $this->cleanString($parts[3] ?? null);
            $state = $this->cleanString($parts[4] ?? null);
            $postalCode = $this->cleanString($parts[5] ?? null);
            $country = $this->cleanString($parts[6] ?? null);

            if (
                $street === null
                && $city === null
                && $state === null
                && $postalCode === null
                && $country === null
            ) {
                continue;
            }

            [$label, $customLabel] = $this->simpleLabelForProperty($property, fallback: 'other');

            $payload['addresses'][] = [
                'label' => $label,
                'custom_label' => $customLabel,
                'street' => $street,
                'city' => $city,
                'state' => $state,
                'postal_code' => $postalCode,
                'country' => $country,
            ];
        }

        $anniversary = $this->parseDateParts($this->firstPropertyValue($component, 'ANNIVERSARY'));
        if ($anniversary !== null) {
            $payload['dates'][] = array_merge([
                'label' => 'anniversary',
                'custom_label' => null,
            ], $anniversary);
        }

        foreach ($component->select('X-ABDATE') as $property) {
            $parts = $this->parseDateParts((string) $property);
            if ($parts === null) {
                continue;
            }

            $rawLabel = $this->appleDateLabelForProperty($component, $property) ?? '';
            if ($rawLabel === 'anniversary' || $rawLabel === 'other') {
                $label = $rawLabel;
                $customLabel = null;
            } elseif ($rawLabel !== '') {
                $label = 'custom';
                $customLabel = $rawLabel;
            } else {
                $label = 'other';
                $customLabel = null;
            }

            $payload['dates'][] = array_merge([
                'label' => $label,
                'custom_label' => $customLabel,
            ], $parts);
        }

        foreach ($component->select('RELATED') as $property) {
            $value = $this->cleanString((string) $property);
            if ($value === null) {
                continue;
            }

            [$label, $customLabel] = $this->relatedLabelForProperty($property);
            $relatedContactId = $this->toInteger(
                $this->propertyParameterValue($property, self::RELATED_CONTACT_ID_PARAMETER),
            );
            $payload['related_names'][] = [
                'label' => $label,
                'custom_label' => $customLabel,
                'value' => $value,
                'related_contact_id' => $relatedContactId !== null && $relatedContactId > 0
                    ? $relatedContactId
                    : null,
            ];
        }

        foreach ($component->select('IMPP') as $property) {
            $value = $this->cleanString((string) $property);
            if ($value === null) {
                continue;
            }

            [$label, $customLabel] = $this->simpleLabelForProperty($property, fallback: 'other');
            $payload['instant_messages'][] = [
                'label' => $label,
                'custom_label' => $customLabel,
                'value' => $value,
            ];
        }

        return [
            'uid' => $this->firstPropertyValue($component, 'UID'),
            'payload' => $payload,
            'managed_contact_id' => $this->toInteger($this->firstPropertyValue($component, 'X-DAVVY-CONTACT-ID')),
            'managed_owner_id' => $this->toInteger($this->firstPropertyValue($component, 'X-DAVVY-CONTACT-OWNER')),
        ];
    }

    private function appleDateLabelForProperty(VCard $vCard, mixed $property): ?string
    {
        $parameterLabel = $this->normalizeAppleDateLabel(
            $this->propertyParameterValue($property, 'X-ABLabel'),
        );
        if ($parameterLabel !== null) {
            return $parameterLabel;
        }

        $group = $this->cleanString($property->group ?? null);
        if ($group === null) {
            return null;
        }

        foreach ($vCard->select('X-ABLABEL') as $labelProperty) {
            $labelGroup = $this->cleanString($labelProperty->group ?? null);
            if ($labelGroup === null || strcasecmp($labelGroup, $group) !== 0) {
                continue;
            }

            return $this->normalizeAppleDateLabel((string) $labelProperty);
        }

        return null;
    }

    private function normalizeAppleDateLabel(?string $value): ?string
    {
        $label = strtolower(trim((string) ($value ?? '')));
        if ($label === '') {
            return null;
        }

        if (preg_match('/^_\\$!<(.+)>!\\$_$/', $label, $matches) === 1) {
            $label = strtolower(trim($matches[1]));
        }

        return $label !== '' ? $label : null;
    }

    /**
     * @param  array<int, mixed>  $rows
     */
    private function firstRowValue(array $rows): ?string
    {
        foreach ($rows as $row) {
            $value = $this->cleanString(Arr::get($row, 'value'));
            if ($value !== null) {
                return $value;
            }
        }

        return null;
    }

    private function addSimpleProperty(VCard $vCard, string $property, mixed $value): void
    {
        $normalized = $this->cleanString($value);
        if ($normalized === null) {
            return;
        }

        $vCard->add($property, $normalized);
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyPayload(): array
    {
        return [
            'prefix' => null,
            'first_name' => null,
            'middle_name' => null,
            'last_name' => null,
            'suffix' => null,
            'nickname' => null,
            'company' => null,
            'job_title' => null,
            'department' => null,
            'pronouns' => null,
            'pronouns_custom' => null,
            'ringtone' => null,
            'text_tone' => null,
            'phonetic_first_name' => null,
            'phonetic_last_name' => null,
            'phonetic_company' => null,
            'maiden_name' => null,
            'verification_code' => null,
            'profile' => null,
            'head_of_household' => false,
            'exclude_milestone_calendars' => false,
            'birthday' => [],
            'phones' => [],
            'emails' => [],
            'urls' => [],
            'addresses' => [],
            'dates' => [],
            'related_names' => [],
            'instant_messages' => [],
        ];
    }

    private function firstProperty(VCard $vCard, string $propertyName): mixed
    {
        $properties = $vCard->select($propertyName);

        return $properties[0] ?? null;
    }

    private function firstPropertyValue(VCard $vCard, string $propertyName): ?string
    {
        $property = $this->firstProperty($vCard, $propertyName);

        if (! $property) {
            return null;
        }

        return $this->cleanString((string) $property);
    }

    /**
     * @return array<int, mixed>
     */
    private function propertyParts(mixed $property, int $minimumCount = 0): array
    {
        if ($property === null) {
            return array_fill(0, max(0, $minimumCount), null);
        }

        $parts = method_exists($property, 'getParts')
            ? $property->getParts()
            : explode(';', (string) $property);

        if (! is_array($parts)) {
            $parts = [];
        }

        $normalized = array_values($parts);
        while (count($normalized) < $minimumCount) {
            $normalized[] = null;
        }

        return $normalized;
    }

    private function propertyParameterValue(mixed $property, string $name): ?string
    {
        if (! isset($property[$name])) {
            return null;
        }

        return $this->cleanString((string) $property[$name]);
    }

    /**
     * @return array<int, string>
     */
    private function propertyTypes(mixed $property): array
    {
        $raw = strtoupper($this->propertyParameterValue($property, 'TYPE') ?? '');
        if ($raw === '') {
            return [];
        }

        return array_values(array_filter(
            preg_split('/[\s,]+/', $raw) ?: [],
            fn (mixed $value): bool => is_string($value) && $value !== ''
        ));
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function phoneLabelForProperty(mixed $property): array
    {
        $customLabel = $this->propertyParameterValue($property, 'X-ABLabel');
        $types = $this->propertyTypes($property);

        if ($customLabel !== null) {
            $base = $this->phoneLabelFromTypes($types);

            return [$base === 'other' ? 'custom' : $base, $customLabel];
        }

        return [$this->phoneLabelFromTypes($types), null];
    }

    private function phoneLabelFromTypes(array $types): string
    {
        $set = collect($types)->map(fn (string $type): string => strtoupper($type))->all();
        $has = fn (string $type): bool => in_array($type, $set, true);

        if ($has('IPHONE')) {
            return 'iphone';
        }
        if ($has('APPLEWATCH')) {
            return 'apple_watch';
        }
        if ($has('CELL')) {
            return 'mobile';
        }
        if ($has('PAGER')) {
            return 'pager';
        }
        if ($has('FAX') && $has('HOME')) {
            return 'home_fax';
        }
        if ($has('FAX') && $has('WORK')) {
            return 'work_fax';
        }
        if ($has('FAX')) {
            return 'other_fax';
        }
        if ($has('HOME')) {
            return 'home';
        }
        if ($has('WORK')) {
            return 'work';
        }
        if ($has('PREF')) {
            return 'main';
        }
        if ($has('VOICE')) {
            return 'other';
        }

        return 'other';
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function simpleLabelForProperty(mixed $property, string $fallback): array
    {
        $customLabel = $this->propertyParameterValue($property, 'X-ABLabel');
        if ($customLabel !== null) {
            return ['custom', $customLabel];
        }

        $types = $this->propertyTypes($property);
        if (in_array('HOME', $types, true)) {
            return ['home', null];
        }
        if (in_array('WORK', $types, true)) {
            return ['work', null];
        }
        if (in_array('SCHOOL', $types, true)) {
            return ['school', null];
        }
        if (in_array('OTHER', $types, true)) {
            return ['other', null];
        }

        return [$fallback, null];
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function urlLabelForProperty(mixed $property): array
    {
        $customLabel = $this->propertyParameterValue($property, 'X-ABLabel');
        if ($customLabel !== null) {
            return ['custom', $customLabel];
        }

        $types = $this->propertyTypes($property);
        if (in_array('WORK', $types, true)) {
            return ['work', null];
        }
        if (in_array('HOME', $types, true)) {
            return ['homepage', null];
        }
        if (in_array('OTHER', $types, true)) {
            return ['other', null];
        }

        return ['homepage', null];
    }

    /**
     * @return array{0:string,1:?string}
     */
    private function relatedLabelForProperty(mixed $property): array
    {
        $customLabel = $this->propertyParameterValue($property, 'X-ABLabel');
        if ($customLabel !== null) {
            return ['custom', $customLabel];
        }

        $types = $this->propertyTypes($property);
        foreach (self::RELATED_LABELS as $candidate) {
            if (in_array(strtoupper($candidate), $types, true)) {
                return [$candidate, null];
            }
        }

        return ['other', null];
    }

    /**
     * @return array{year:?int,month:int,day:int}|null
     */
    private function parseDateParts(?string $value): ?array
    {
        $normalized = trim((string) ($value ?? ''));
        if ($normalized === '') {
            return null;
        }

        if (preg_match('/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/', $normalized, $matches) === 1) {
            return [
                'year' => (int) $matches['year'],
                'month' => (int) $matches['month'],
                'day' => (int) $matches['day'],
            ];
        }

        if (preg_match('/^--(?<month>\d{2})-(?<day>\d{2})$/', $normalized, $matches) === 1) {
            return [
                'year' => null,
                'month' => (int) $matches['month'],
                'day' => (int) $matches['day'],
            ];
        }

        if (preg_match('/^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})$/', $normalized, $matches) === 1) {
            return [
                'year' => (int) $matches['year'],
                'month' => (int) $matches['month'],
                'day' => (int) $matches['day'],
            ];
        }

        if (preg_match('/^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})T/', $normalized, $matches) === 1) {
            return [
                'year' => (int) $matches['year'],
                'month' => (int) $matches['month'],
                'day' => (int) $matches['day'],
            ];
        }

        return null;
    }

    private function setSingletonProperty(VCard $vCard, string $propertyName, string|array $value): void
    {
        $properties = $vCard->select($propertyName);

        if (count($properties) === 0) {
            $vCard->add($propertyName, $value);

            return;
        }

        $properties[0]->setValue($value);

        for ($index = 1; $index < count($properties); $index++) {
            $properties[$index]->destroy();
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function rows(mixed $rows): array
    {
        if (! is_array($rows)) {
            return [];
        }

        return array_values(array_filter($rows, fn (mixed $row): bool => is_array($row)));
    }

    /**
     * @return array<int, string>
     */
    private function phoneTypesForLabel(mixed $label): array
    {
        $normalized = strtolower((string) $label);

        return self::PHONE_TYPE_MAP[$normalized] ?? self::PHONE_TYPE_MAP['other'];
    }

    /**
     * @return array<int, string>
     */
    private function typesForSimpleLabel(mixed $label): array
    {
        $normalized = strtolower((string) $label);

        return self::SIMPLE_LABEL_TYPE_MAP[$normalized] ?? [];
    }

    private function customLabelOrLabel(array $row): string
    {
        return $this->cleanString($row['custom_label'] ?? null)
            ?? $this->cleanString($row['label'] ?? null)
            ?? 'other';
    }

    private function cleanString(mixed $value): ?string
    {
        if (! is_scalar($value) && $value !== null) {
            return null;
        }

        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    /**
     * @param  array<string, mixed>  $parts
     */
    private function dateString(array $parts): ?string
    {
        $year = $this->toInteger($parts['year'] ?? null);
        $month = $this->toInteger($parts['month'] ?? null);
        $day = $this->toInteger($parts['day'] ?? null);

        if ($month === null || $day === null) {
            return null;
        }

        if ($year !== null) {
            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }

        return sprintf('--%02d-%02d', $month, $day);
    }

    private function toInteger(mixed $value): ?int
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

    private function toBoolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value)) {
            return $value !== 0;
        }

        if (is_string($value)) {
            return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true);
        }

        return false;
    }
}
