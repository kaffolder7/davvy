<?php

return [
    'base_uri' => '/dav',
    'default_calendar_name' => 'Personal Calendar',
    'default_address_book_name' => 'Contacts',
    'log_client_traffic' => (bool) env('DAV_LOG_CLIENT_TRAFFIC', false),
    'auth_throttle' => [
        'max_attempts' => (int) env('DAV_AUTH_THROTTLE_MAX_ATTEMPTS', 20),
        'decay_seconds' => (int) env('DAV_AUTH_THROTTLE_DECAY_SECONDS', 60),
    ],
];
