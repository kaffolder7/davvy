<?php

namespace App\Services\Dav;

use Sabre\DAV\Exception\BadRequest;
use Sabre\VObject\Component\VCard;
use Sabre\VObject\ParseException;
use Sabre\VObject\Reader;

class VCardValidator
{
    public function validateAndNormalize(string $cardData): array
    {
        $component = $this->parseVCard($cardData);
        if (! $component instanceof VCard) {
            throw new BadRequest('Expected VCARD payload.');
        }

        $version = $this->validateVersion($component);
        $fn = $this->validateFullName($component);
        $uid = $this->validateUid($component);
        $this->validateEmailAddresses($component);

        if ($fn === '') {
            throw new BadRequest('vCard must include FN.');
        }

        return [
            'data' => $component->serialize(),
            'uid' => $uid,
            'version' => $version,
        ];
    }

    public function extractUid(string $cardData): ?string
    {
        try {
            $component = $this->parseVCard($cardData);
        } catch (BadRequest) {
            return null;
        }

        $uidProperties = $component->select('UID');

        if (count($uidProperties) === 0) {
            return null;
        }

        $uid = trim((string) $uidProperties[0]);

        return $uid !== '' ? $uid : null;
    }

    private function parseVCard(string $cardData): VCard
    {
        try {
            $component = Reader::read($cardData);
        } catch (ParseException|\Throwable) {
            throw new BadRequest('Invalid vCard payload.');
        }

        if (! $component instanceof VCard) {
            throw new BadRequest('Expected VCARD payload.');
        }

        return $component;
    }

    private function validateVersion(VCard $card): string
    {
        $versions = $card->select('VERSION');

        if (count($versions) !== 1) {
            throw new BadRequest('vCard must include exactly one VERSION property.');
        }

        $version = trim((string) $versions[0]);

        if (! in_array($version, ['3.0', '4.0'], true)) {
            throw new BadRequest('vCard VERSION must be 3.0 or 4.0.');
        }

        return $version;
    }

    private function validateFullName(VCard $card): string
    {
        $fnProperties = $card->select('FN');

        if (count($fnProperties) !== 1) {
            throw new BadRequest('vCard must include exactly one FN property.');
        }

        $value = trim((string) $fnProperties[0]);

        if ($value === '') {
            throw new BadRequest('vCard FN must not be empty.');
        }

        return $value;
    }

    private function validateUid(VCard $card): string
    {
        $uidProperties = $card->select('UID');

        if (count($uidProperties) !== 1) {
            throw new BadRequest('vCard must include exactly one UID property.');
        }

        $uid = trim((string) $uidProperties[0]);

        if ($uid === '') {
            throw new BadRequest('vCard UID must not be empty.');
        }

        return $uid;
    }

    private function validateEmailAddresses(VCard $card): void
    {
        foreach ($card->select('EMAIL') as $emailProperty) {
            $email = trim((string) $emailProperty);

            if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                throw new BadRequest('vCard EMAIL values must be valid email addresses.');
            }
        }
    }
}
