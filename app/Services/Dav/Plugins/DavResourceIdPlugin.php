<?php

namespace App\Services\Dav\Plugins;

use App\Models\AddressBook;
use Sabre\CardDAV\AddressBookHome;
use Sabre\DAV\INode;
use Sabre\DAV\PropFind;
use Sabre\DAV\Server;
use Sabre\DAV\ServerPlugin;
use Sabre\DAV\Xml\Property\Href;

class DavResourceIdPlugin extends ServerPlugin
{
    /**
     * @param  Server  $server
     * @return void
     */
    public function initialize(Server $server): void
    {
        $server->on('propFind', [$this, 'propFind']);
    }

    /**
     * @return string
     */
    public function getPluginName(): string
    {
        return 'davvy-resource-id';
    }

    /**
     * @param  PropFind  $propFind
     * @param  INode  $node
     * @return void
     */
    public function propFind(PropFind $propFind, INode $node): void
    {
        $propFind->handle('{DAV:}resource-id', function () use ($propFind): Href {
            $path = trim((string) $propFind->getPath(), '/');
            $seedPath = $path !== '' ? $path : '/';

            return new Href('urn:uuid:'.$this->stableUuidForPath($seedPath));
        });

        if ($node instanceof AddressBookHome) {
            $propFind->handle('{DAV:}displayname', fn (): string => 'Address Books');

            $propFind->handle('{DAV:}sync-token', function () use ($propFind): string {
                return $this->addressBookHomeSyncToken((string) $propFind->getPath());
            });
        }
    }

    /**
     * @param  string  $path
     * @return string
     */
    private function stableUuidForPath(string $path): string
    {
        $seed = (string) config('app.key', 'davvy');
        $hash = sha1($seed.'|'.$path);

        $timeLow = substr($hash, 0, 8);
        $timeMid = substr($hash, 8, 4);
        $timeHiAndVersion = (hexdec(substr($hash, 12, 4)) & 0x0FFF) | 0x5000;
        $clockSeq = (hexdec(substr($hash, 16, 4)) & 0x3FFF) | 0x8000;
        $node = substr($hash, 20, 12);

        return sprintf(
            '%s-%s-%04x-%04x-%s',
            $timeLow,
            $timeMid,
            $timeHiAndVersion,
            $clockSeq,
            $node
        );
    }

    /**
     * @param  string  $path
     * @return string
     */
    private function addressBookHomeSyncToken(string $path): string
    {
        $segments = explode('/', trim($path, '/'));
        $principalId = isset($segments[1]) && ctype_digit($segments[1]) ? (int) $segments[1] : 0;

        if ($principalId < 1) {
            return 'http://sabre.io/ns/sync/home-0';
        }

        $signature = AddressBook::query()
            ->where('owner_id', $principalId)
            ->orderBy('id')
            ->get(['id', 'uri', 'updated_at'])
            ->map(function (AddressBook $addressBook): string {
                return implode(':', [
                    (string) $addressBook->id,
                    $addressBook->uri,
                    (string) ($addressBook->updated_at?->getTimestamp() ?? 0),
                ]);
            })
            ->implode('|');

        return 'http://sabre.io/ns/sync/home-'.substr(sha1($principalId.'|'.$signature), 0, 16);
    }
}
