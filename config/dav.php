<?php

return [
    'base_uri' => '/dav',
    'default_calendar_name' => 'Personal Calendar',
    'default_address_book_name' => 'Contacts',
    'log_client_traffic' => (bool) env('DAV_LOG_CLIENT_TRAFFIC', false),
];
