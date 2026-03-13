<?php

namespace Tests\Unit;

use App\Services\Analytics\AnalyticsPayloadSanitizer;
use Tests\TestCase;

class AnalyticsPayloadSanitizerTest extends TestCase
{
    public function test_it_drops_pii_like_keys_and_values(): void
    {
        $sanitizer = new AnalyticsPayloadSanitizer;

        $result = $sanitizer->sanitize([
            'email' => 'person@example.test',
            'url_target' => 'https://example.test/private',
            'password_hint' => 'hunter2',
            'profile_path' => '/users/123/private',
            'safe_flag' => true,
            'safe_count' => 3,
            'safe_status' => 'completed',
            'empty_string' => '   ',
            'uuid_value' => 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        ]);

        $this->assertSame([
            'safe_flag' => true,
            'safe_count' => 3,
            'safe_status' => 'completed',
        ], $result);
    }

    public function test_it_rejects_non_scalar_values(): void
    {
        $sanitizer = new AnalyticsPayloadSanitizer;

        $result = $sanitizer->sanitize([
            'safe_flag' => false,
            'nested' => ['a' => 'b'],
            'object' => (object) ['a' => 'b'],
            'closure' => static fn () => null,
        ]);

        $this->assertSame([
            'safe_flag' => false,
        ], $result);
    }
}
