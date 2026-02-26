<?php

namespace App\Services\Dav;

use App\Services\Dav\Backends\LaravelAuthBackend;
use App\Services\Dav\Backends\LaravelCalendarBackend;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\Dav\Backends\LaravelPrincipalBackend;
use Sabre\CalDAV\CalendarRoot;
use Sabre\CalDAV\Plugin as CalDavPlugin;
use Sabre\CalDAV\Principal\Collection as PrincipalCollection;
use Sabre\CardDAV\AddressBookRoot;
use Sabre\CardDAV\Plugin as CardDavPlugin;
use Sabre\DAV\Auth\Plugin as AuthPlugin;
use Sabre\DAV\Server;
use Sabre\DAV\Sync\Plugin as SyncPlugin;
use Sabre\DAVACL\Plugin as AclPlugin;

class DavServerFactory
{
    public function __construct(
        private readonly LaravelAuthBackend $authBackend,
        private readonly LaravelPrincipalBackend $principalBackend,
        private readonly LaravelCalendarBackend $calendarBackend,
        private readonly LaravelCardDavBackend $cardDavBackend,
    ) {
    }

    public function make(): Server
    {
        $nodes = [
            new PrincipalCollection($this->principalBackend),
            new CalendarRoot($this->principalBackend, $this->calendarBackend),
            new AddressBookRoot($this->principalBackend, $this->cardDavBackend),
        ];

        $server = new Server($nodes);
        $baseUri = trim((string) config('dav.base_uri', '/dav'), '/').'/';
        $server->setBaseUri('/'.$baseUri);

        $authPlugin = new AuthPlugin($this->authBackend, 'Davvy DAV');
        $server->addPlugin($authPlugin);
        $server->addPlugin(new AclPlugin());
        $server->addPlugin(new CalDavPlugin());
        $server->addPlugin(new CardDavPlugin());
        $server->addPlugin(new SyncPlugin());

        return $server;
    }
}
