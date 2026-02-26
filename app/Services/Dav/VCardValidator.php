<?php

namespace App\Services\Dav;

use Sabre\DAV\Exception\BadRequest;
use Sabre\VObject\Component\VCard;
use Sabre\VObject\ParseException;
use Sabre\VObject\Reader;

class VCardValidator
{
    public function validateAndNormalize(string $cardData): string
    {
        try {
            $component = Reader::read($cardData);
        } catch (ParseException|\Throwable) {
            throw new BadRequest('Invalid vCard payload.');
        }

        if (! $component instanceof VCard) {
            throw new BadRequest('Expected VCARD payload.');
        }

        if (! isset($component->VERSION) || trim((string) $component->VERSION) === '') {
            throw new BadRequest('vCard must include VERSION.');
        }

        if (! isset($component->FN) || trim((string) $component->FN) === '') {
            throw new BadRequest('vCard must include FN.');
        }

        return $component->serialize();
    }
}
