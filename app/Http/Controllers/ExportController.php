<?php

namespace App\Http\Controllers;

use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\ResourceAccessService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Sabre\VObject\Component;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use ZipArchive;

class ExportController extends Controller
{
    public function __construct(private readonly ResourceAccessService $accessService) {}

    public function exportAllCalendars(Request $request): BinaryFileResponse
    {
        $calendars = $this->readableCalendars($request->user());
        $files = $calendars->map(fn (Calendar $calendar): array => [
            'name' => $this->resourceFileName($calendar->display_name, 'calendar', 'ics'),
            'contents' => $this->buildCalendarPayload($calendar),
        ])->all();

        return $this->downloadZip(
            files: $files,
            emptyEntryName: 'calendars.txt',
            emptyEntryContents: "No calendars are available for export.\n",
            archiveName: $this->exportArchiveName('calendars')
        );
    }

    public function exportCalendar(Request $request, Calendar $calendar): Response
    {
        $user = $request->user();

        if (! $this->accessService->userCanReadCalendar($user, $calendar)) {
            abort(403, 'You cannot access this calendar.');
        }

        return response(
            $this->buildCalendarPayload($calendar),
            200,
            [
                'Content-Type' => 'text/calendar; charset=utf-8',
                'Content-Disposition' => $this->attachmentHeader(
                    $this->resourceFileName($calendar->display_name, 'calendar', 'ics')
                ),
            ]
        );
    }

    public function exportAllAddressBooks(Request $request): BinaryFileResponse
    {
        $addressBooks = $this->readableAddressBooks($request->user());
        $files = $addressBooks->map(fn (AddressBook $addressBook): array => [
            'name' => $this->resourceFileName($addressBook->display_name, 'address-book', 'vcf'),
            'contents' => $this->buildAddressBookPayload($addressBook),
        ])->all();

        return $this->downloadZip(
            files: $files,
            emptyEntryName: 'address-books.txt',
            emptyEntryContents: "No address books are available for export.\n",
            archiveName: $this->exportArchiveName('address-books')
        );
    }

    public function exportAddressBook(Request $request, AddressBook $addressBook): Response
    {
        $user = $request->user();

        if (! $this->accessService->userCanReadAddressBook($user, $addressBook)) {
            abort(403, 'You cannot access this address book.');
        }

        return response(
            $this->buildAddressBookPayload($addressBook),
            200,
            [
                'Content-Type' => 'text/vcard; charset=utf-8',
                'Content-Disposition' => $this->attachmentHeader(
                    $this->resourceFileName($addressBook->display_name, 'address-book', 'vcf')
                ),
            ]
        );
    }

    /**
     * @return Collection<int, Calendar>
     */
    private function readableCalendars(User $user): Collection
    {
        $ids = Calendar::query()
            ->where('owner_id', $user->id)
            ->pluck('id')
            ->merge(
                ResourceShare::query()
                    ->where('shared_with_id', $user->id)
                    ->where('resource_type', ShareResourceType::Calendar->value)
                    ->pluck('resource_id')
            )
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        return Calendar::query()
            ->with(['objects' => fn ($query) => $query->orderBy('id')])
            ->whereIn('id', $ids)
            ->orderBy('display_name')
            ->get();
    }

    /**
     * @return Collection<int, AddressBook>
     */
    private function readableAddressBooks(User $user): Collection
    {
        $ids = AddressBook::query()
            ->where('owner_id', $user->id)
            ->pluck('id')
            ->merge(
                ResourceShare::query()
                    ->where('shared_with_id', $user->id)
                    ->where('resource_type', ShareResourceType::AddressBook->value)
                    ->pluck('resource_id')
            )
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        return AddressBook::query()
            ->with(['cards' => fn ($query) => $query->orderBy('id')])
            ->whereIn('id', $ids)
            ->orderBy('display_name')
            ->get();
    }

    private function buildCalendarPayload(Calendar $calendar): string
    {
        $calendar->loadMissing(['objects' => fn ($query) => $query->orderBy('id')]);

        $export = new VCalendar([
            'VERSION' => '2.0',
            'PRODID' => '-//Davvy//Calendar Export//EN',
        ]);

        foreach ($calendar->objects as $object) {
            $source = Reader::read($object->data);

            if (! $source instanceof VCalendar) {
                continue;
            }

            foreach ($source->children() as $child) {
                if ($child instanceof Component) {
                    $export->add(clone $child);
                }
            }
        }

        return $export->serialize();
    }

    private function buildAddressBookPayload(AddressBook $addressBook): string
    {
        $addressBook->loadMissing(['cards' => fn ($query) => $query->orderBy('id')]);

        return $addressBook->cards
            ->map(fn ($card): string => rtrim((string) $card->data, "\r\n"))
            ->filter(fn (string $card): bool => $card !== '')
            ->implode("\r\n");
    }

    /**
     * @param  array<int, array{name: string, contents: string}>  $files
     */
    private function downloadZip(
        array $files,
        string $emptyEntryName,
        string $emptyEntryContents,
        string $archiveName
    ): BinaryFileResponse {
        $tmpPath = tempnam(sys_get_temp_dir(), 'davvy-export-');

        if ($tmpPath === false) {
            abort(500, 'Unable to create temporary export file.');
        }

        $zip = new ZipArchive;
        $opened = $zip->open($tmpPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);

        if ($opened !== true) {
            @unlink($tmpPath);
            abort(500, 'Unable to create export archive.');
        }

        $usedNames = [];
        foreach ($files as $file) {
            $entryName = $this->uniqueArchiveEntryName($file['name'], $usedNames);
            $zip->addFromString($entryName, $file['contents']);
        }

        if ($files === []) {
            $zip->addFromString($emptyEntryName, $emptyEntryContents);
        }

        $zip->close();

        return response()
            ->download($tmpPath, $archiveName, ['Content-Type' => 'application/zip'])
            ->deleteFileAfterSend(true);
    }

    /**
     * @param  array<string, true>  $usedNames
     */
    private function uniqueArchiveEntryName(string $name, array &$usedNames): string
    {
        $candidate = $name;
        $baseName = pathinfo($name, PATHINFO_FILENAME);
        $extension = pathinfo($name, PATHINFO_EXTENSION);
        $suffix = 1;

        while (isset($usedNames[$candidate])) {
            $candidate = $baseName.'-'.$suffix.($extension !== '' ? '.'.$extension : '');
            $suffix++;
        }

        $usedNames[$candidate] = true;

        return $candidate;
    }

    private function attachmentHeader(string $fileName): string
    {
        return sprintf('attachment; filename="%s"', $fileName);
    }

    private function resourceFileName(string $displayName, string $fallbackStem, string $extension): string
    {
        $stem = Str::slug($displayName);

        if ($stem === '') {
            $stem = $fallbackStem;
        }

        return $stem.'.'.$extension;
    }

    private function exportArchiveName(string $resourceType): string
    {
        return sprintf('davvy-%s-%s.zip', $resourceType, now()->format('Ymd-His'));
    }
}
