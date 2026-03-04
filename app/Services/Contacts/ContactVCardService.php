<?php

namespace App\Services\Contacts;

use App\Models\Contact;
use Illuminate\Support\Arr;
use Sabre\VObject\Component\VCard;

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
        $this->addSimpleProperty($vCard, 'X-DAVVY-CONTACT-ID', (string) $contact->id);
        $this->addSimpleProperty($vCard, 'X-DAVVY-CONTACT-OWNER', (string) $contact->owner_id);

        $data = $vCard->serialize();
        $vCard->destroy();

        return $data;
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
     * @param  mixed  $rows
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
     * @param  mixed  $label
     * @return array<int, string>
     */
    private function phoneTypesForLabel(mixed $label): array
    {
        $normalized = strtolower((string) $label);

        return self::PHONE_TYPE_MAP[$normalized] ?? self::PHONE_TYPE_MAP['other'];
    }

    /**
     * @param  mixed  $label
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
}
