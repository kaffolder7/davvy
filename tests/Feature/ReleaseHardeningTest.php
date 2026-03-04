<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReleaseHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_preflight_passes_for_testing_defaults(): void
    {
        $this->artisan('app:preflight')->assertExitCode(0);
    }

    public function test_preflight_fails_for_insecure_production_settings(): void
    {
        $this->withTemporaryEnv([
            'SESSION_SECURE_COOKIE' => 'false',
            'RUN_DB_SEED' => 'true',
            'DEFAULT_ADMIN_EMAIL' => 'admin@example.com',
            'DEFAULT_ADMIN_PASSWORD' => 'ChangeMe123!',
        ], function (): void {
            config()->set('app.env', 'production');
            config()->set('app.debug', true);
            config()->set('app.url', 'http://example.com');
            config()->set('app.key', '');
            config()->set('database.default', 'sqlite');

            $this->artisan('app:preflight')->assertExitCode(1);
        });
    }

    public function test_preflight_fails_when_cors_credentials_are_enabled_with_wildcard_origins(): void
    {
        $this->withTemporaryEnv([
            'SESSION_SECURE_COOKIE' => 'true',
        ], function (): void {
            $original = [
                'app.env' => config('app.env'),
                'app.debug' => config('app.debug'),
                'app.url' => config('app.url'),
                'app.key' => config('app.key'),
                'database.default' => config('database.default'),
                'cors.allowed_origins' => config('cors.allowed_origins'),
                'cors.supports_credentials' => config('cors.supports_credentials'),
            ];

            try {
                config()->set('app.env', 'production');
                config()->set('app.debug', false);
                config()->set('app.url', 'https://example.com');
                config()->set('app.key', 'base64:MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=');
                config()->set('database.default', 'pgsql');
                config()->set('cors.allowed_origins', ['*']);
                config()->set('cors.supports_credentials', true);

                $this->artisan('app:preflight')
                    ->expectsOutputToContain('CORS_ALLOWED_ORIGINS must not include "*" when CORS_SUPPORTS_CREDENTIALS=true.')
                    ->assertExitCode(1);
            } finally {
                foreach ($original as $key => $value) {
                    config()->set($key, $value);
                }
            }
        });
    }

    public function test_login_endpoint_is_rate_limited(): void
    {
        User::factory()->create([
            'email' => 'throttle@example.com',
            'password' => 'Password123!',
        ]);

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->postJson('/api/auth/login', [
                'email' => 'throttle@example.com',
                'password' => 'incorrect-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/auth/login', [
            'email' => 'throttle@example.com',
            'password' => 'incorrect-password',
        ])->assertStatus(429);
    }

    public function test_registration_endpoint_is_rate_limited(): void
    {
        app(RegistrationSettingsService::class)->setPublicRegistrationEnabled(true);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/register', [
                'name' => 'Rate Limited User',
                'email' => "rate-limited-{$attempt}@example.com",
                'password' => 'Password123!',
                'password_confirmation' => 'Password123!',
            ])->assertCreated();
        }

        $this->postJson('/api/auth/register', [
            'name' => 'Rate Limited User',
            'email' => 'rate-limited-overflow@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ])->assertStatus(429);
    }

    public function test_public_api_does_not_reflect_untrusted_cors_origin_by_default(): void
    {
        config()->set('cors.allowed_origins', []);
        config()->set('cors.allowed_origins_patterns', []);
        config()->set('cors.supports_credentials', false);

        $response = $this->withHeaders([
            'Origin' => 'https://evil.example',
        ])->getJson('/api/public/config');

        $response->assertOk();
        $this->assertNull($response->headers->get('Access-Control-Allow-Origin'));
        $this->assertNull($response->headers->get('Access-Control-Allow-Credentials'));
    }

    public function test_public_api_allows_explicit_configured_cors_origin_with_credentials(): void
    {
        config()->set('cors.allowed_origins', ['https://app.example']);
        config()->set('cors.allowed_origins_patterns', []);
        config()->set('cors.supports_credentials', true);

        $response = $this->withHeaders([
            'Origin' => 'https://app.example',
        ])->getJson('/api/public/config');

        $response->assertOk();
        $this->assertSame('https://app.example', $response->headers->get('Access-Control-Allow-Origin'));
        $this->assertSame('true', $response->headers->get('Access-Control-Allow-Credentials'));
    }

    public function test_dav_endpoint_is_rate_limited_for_failed_basic_auth_attempts(): void
    {
        User::factory()->create([
            'email' => 'dav-throttle@example.com',
            'password' => 'Password123!',
        ]);

        config()->set('dav.auth_throttle.max_attempts', 3);
        config()->set('dav.auth_throttle.decay_seconds', 60);

        $server = [
            'HTTP_AUTHORIZATION' => 'Basic '.base64_encode('dav-throttle@example.com:incorrect-password'),
            'HTTP_DEPTH' => '0',
            'REMOTE_ADDR' => '127.0.0.1',
        ];

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->call('PROPFIND', '/dav', server: $server)
                ->assertStatus(401);
        }

        $limited = $this->call('PROPFIND', '/dav', server: $server);
        $limited->assertStatus(429);
        $this->assertNotNull($limited->headers->get('Retry-After'));
    }

    private function withTemporaryEnv(array $values, callable $callback): void
    {
        $previous = [];

        foreach ($values as $key => $value) {
            $oldValue = getenv($key);

            $previous[$key] = $oldValue === false ? null : $oldValue;
            putenv($key.'='.$value);
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }

        try {
            $callback();
        } finally {
            foreach ($previous as $key => $value) {
                if ($value === null) {
                    putenv($key);
                    unset($_ENV[$key], $_SERVER[$key]);
                } else {
                    putenv($key.'='.$value);
                    $_ENV[$key] = $value;
                    $_SERVER[$key] = $value;
                }
            }
        }
    }
}
