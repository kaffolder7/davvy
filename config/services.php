<?php

return [
    'registration' => [
        'enabled' => (bool) env('ENABLE_PUBLIC_REGISTRATION', false),
    ],
    'sharing' => [
        'owner_management_enabled' => (bool) env('ENABLE_OWNER_SHARE_MANAGEMENT', true),
    ],
];
