<?php

return [
    'registration' => [
        'enabled' => (bool) env('ENABLE_PUBLIC_REGISTRATION', false),
    ],
    'sharing' => [
        'owner_management_enabled' => (bool) env('ENABLE_OWNER_SHARE_MANAGEMENT', true),
    ],
    'dav' => [
        'compatibility_mode_enabled' => (bool) env('ENABLE_DAV_COMPATIBILITY_MODE', false),
    ],
    'contacts' => [
        'management_enabled' => (bool) env('ENABLE_CONTACT_MANAGEMENT', false),
    ],
];
