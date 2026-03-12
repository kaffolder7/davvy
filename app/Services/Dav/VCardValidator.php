<?php

namespace App\Services\Dav;

use App\Services\RegistrationSettingsService;
use Sabre\DAV\Exception\BadRequest;
use Sabre\VObject\Component\VCard;
use Sabre\VObject\ParseException;
use Sabre\VObject\Reader;

class VCardValidator
{
    public function __construct(private readonly RegistrationSettingsService $settings) {}

    /**
     * Validates and normalizes the payload.
     *
     * @param  string  $cardData
     * @return array
     */
    public function validateAndNormalize(string $cardData): array
    {
        $strictModeEnabled = ! $this->settings->isDavCompatibilityModeEnabled();

        $component = $this->parseVCard($cardData);
        if (! $component instanceof VCard) {
            throw new BadRequest('Expected VCARD payload.');
        }

        $version = $this->validateVersion($component, $strictModeEnabled);
        $fn = $this->validateFullName($component, $strictModeEnabled);
        $uid = $this->validateUid($component, $strictModeEnabled);
        $this->validateEmailAddresses($component, $strictModeEnabled);

        if ($strictModeEnabled && $fn === '') {
            throw new BadRequest('vCard must include FN.');
        }

        return [
            'data' => $component->serialize(),
            'uid' => $uid,
            'version' => $version,
        ];
    }

    /**
     * Extracts the UID.
     *
     * @param  string  $cardData
     * @return string|null
     */
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

    /**
     * @param  string  $cardData
     * @return VCard
     */
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

    /**
     * @param  VCard  $card
     * @param  bool  $strictModeEnabled
     * @return string
     */
    private function validateVersion(VCard $card, bool $strictModeEnabled): string
    {
        $versions = $card->select('VERSION');

        if ($strictModeEnabled && count($versions) !== 1) {
            throw new BadRequest('vCard must include exactly one VERSION property.');
        }

        $version = trim((string) ($versions[0] ?? ''));

        if (! $strictModeEnabled && $version === '') {
            return '3.0';
        }

        if ($strictModeEnabled && ! in_array($version, ['3.0', '4.0'], true)) {
            throw new BadRequest('vCard VERSION must be 3.0 or 4.0.');
        }

        return $version;
    }

    /**
     * @param  VCard  $card
     * @param  bool  $strictModeEnabled
     * @return string
     */
    private function validateFullName(VCard $card, bool $strictModeEnabled): string
    {
        $fnProperties = $card->select('FN');

        if ($strictModeEnabled && count($fnProperties) !== 1) {
            throw new BadRequest('vCard must include exactly one FN property.');
        }

        $value = trim((string) ($fnProperties[0] ?? ''));

        if ($strictModeEnabled && $value === '') {
            throw new BadRequest('vCard FN must not be empty.');
        }

        if (! $strictModeEnabled && $value === '') {
            $nameProperty = trim((string) ($card->N ?? ''));

            if ($nameProperty !== '') {
                return str_replace(';', ' ', $nameProperty);
            }

            return '';
        }

        return $value;
    }

    /**
     * @param  VCard  $card
     * @param  bool  $strictModeEnabled
     * @return string|null
     */
    private function validateUid(VCard $card, bool $strictModeEnabled): ?string
    {
        $uidProperties = $card->select('UID');

        if ($strictModeEnabled && count($uidProperties) !== 1) {
            throw new BadRequest('vCard must include exactly one UID property.');
        }

        $uid = trim((string) ($uidProperties[0] ?? ''));

        if ($strictModeEnabled && $uid === '') {
            throw new BadRequest('vCard UID must not be empty.');
        }

        return $uid !== '' ? $uid : null;
    }

    /**
     * @param  VCard  $card
     * @param  bool  $strictModeEnabled
     * @return void
     */
    private function validateEmailAddresses(VCard $card, bool $strictModeEnabled): void
    {
        foreach ($card->select('EMAIL') as $emailProperty) {
            $email = trim((string) $emailProperty);

            if (
                $strictModeEnabled
                && ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false)
            ) {
                throw new BadRequest('vCard EMAIL values must be valid email addresses.');
            }
        }
    }
}
