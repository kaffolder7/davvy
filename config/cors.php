<?php

$parseCsv = static function (string $value): array {
    return array_values(array_filter(array_map(
        static fn (string $entry): string => trim($entry),
        explode(',', $value)
    ), static fn (string $entry): bool => $entry !== ''));
};

return [
    'paths' => ['api/*'],
    'allowed_methods' => $parseCsv((string) env('CORS_ALLOWED_METHODS', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')),
    'allowed_origins' => $parseCsv((string) env('CORS_ALLOWED_ORIGINS', '')),
    'allowed_origins_patterns' => $parseCsv((string) env('CORS_ALLOWED_ORIGIN_PATTERNS', '')),
    'allowed_headers' => $parseCsv((string) env('CORS_ALLOWED_HEADERS', 'Content-Type, X-Requested-With, X-CSRF-TOKEN, Accept, Authorization')),
    'exposed_headers' => [],
    'max_age' => (int) env('CORS_MAX_AGE', 0),
    'supports_credentials' => (bool) env('CORS_SUPPORTS_CREDENTIALS', false),
];
