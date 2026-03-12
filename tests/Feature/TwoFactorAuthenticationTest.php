<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\User;
use App\Services\Security\AppPasswordService;
use App\Services\Security\TotpService;
use App\Services\Security\TwoFactorService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TwoFactorAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_requires_second_factor_when_enabled_and_completes_with_totp(): void
    {
        $user = User::factory()->create([
            'email' => 'two-factor@example.test',
            'password' => 'Password123!',
        ]);

        $secret = app(TotpService::class)->generateSecret();
        app(TwoFactorService::class)->enable($user, $secret);

        $login = $this->postJson('/api/auth/login', [
            'email' => 'two-factor@example.test',
            'password' => 'Password123!',
        ]);

        $login->assertStatus(202);
        $login->assertJsonPath('two_factor_required', true);

        $verificationCode = app(TotpService::class)->currentCode($secret);

        $verify = $this->postJson('/api/auth/login/2fa', [
            'code' => $verificationCode,
        ]);

        $verify->assertOk();
        $verify->assertJsonPath('user.id', $user->id);
        $verify->assertJsonPath('two_factor_enabled', true);

        $this->assertAuthenticatedAs($user);
    }

    public function test_backup_code_is_single_use_for_login_challenge(): void
    {
        $user = User::factory()->create([
            'email' => 'backup-code@example.test',
            'password' => 'Password123!',
        ]);

        $secret = app(TotpService::class)->generateSecret();
        $backupCodes = app(TwoFactorService::class)->enable($user, $secret);
        $backupCode = $backupCodes[0];

        $this->postJson('/api/auth/login', [
            'email' => 'backup-code@example.test',
            'password' => 'Password123!',
        ])->assertStatus(202);

        $this->postJson('/api/auth/login/2fa', [
            'code' => $backupCode,
        ])->assertOk();

        $this->postJson('/api/auth/logout')->assertOk();

        $this->postJson('/api/auth/login', [
            'email' => 'backup-code@example.test',
            'password' => 'Password123!',
        ])->assertStatus(202);

        $this->postJson('/api/auth/login/2fa', [
            'code' => $backupCode,
        ])->assertStatus(422);
    }

    public function test_authenticated_user_can_complete_two_factor_setup_and_receive_backup_codes(): void
    {
        $user = User::factory()->create();

        $setup = $this->actingAs($user)
            ->postJson('/api/auth/2fa/setup')
            ->assertOk()
            ->json();

        $secret = (string) ($setup['secret'] ?? '');
        $this->assertNotSame('', $secret);
        $this->assertStringStartsWith('otpauth://totp/', (string) ($setup['otpauth_uri'] ?? ''));

        $code = app(TotpService::class)->currentCode($secret);

        $enable = $this->actingAs($user)
            ->postJson('/api/auth/2fa/enable', [
                'code' => $code,
            ])
            ->assertOk();

        $backupCodes = $enable->json('backup_codes');
        $this->assertIsArray($backupCodes);
        $this->assertCount(8, $backupCodes);

        $this->assertTrue($user->fresh()->hasTwoFactorEnabled());
    }

    public function test_dav_uses_app_password_when_two_factor_is_enabled(): void
    {
        $user = User::factory()->create([
            'email' => 'dav-app-password@example.test',
            'password' => 'Password123!',
        ]);

        $secret = app(TotpService::class)->generateSecret();
        app(TwoFactorService::class)->enable($user, $secret);

        $totpCode = app(TotpService::class)->currentCode($secret);
        $appPasswordResponse = $this->actingAs($user)
            ->postJson('/api/auth/app-passwords', [
                'name' => 'iPhone',
                'code' => $totpCode,
            ])
            ->assertCreated();

        $appPassword = (string) $appPasswordResponse->json('token');
        $this->assertNotSame('', $appPassword);

        $passwordRejected = $this->call('PROPFIND', '/dav', server: [
            'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':Password123!'),
            'HTTP_DEPTH' => '0',
            'CONTENT_TYPE' => 'application/xml; charset=utf-8',
        ], content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>');

        $passwordRejected->assertStatus(401);

        $appPasswordAccepted = $this->call('PROPFIND', '/dav', server: [
            'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':'.$appPassword),
            'HTTP_DEPTH' => '0',
            'CONTENT_TYPE' => 'application/xml; charset=utf-8',
        ], content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>');

        $appPasswordAccepted->assertStatus(207);
        $this->assertStringContainsString('/dav/principals/'.$user->id.'/', (string) $appPasswordAccepted->getContent());
    }

    public function test_mandated_two_factor_blocks_dashboard_after_grace_period(): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'two_factor_enforcement_enabled'],
            ['value' => 'true'],
        );
        AppSetting::query()->updateOrCreate(
            ['key' => 'two_factor_enforcement_started_at'],
            ['value' => now()->subDays(30)->toISOString()],
        );

        $user = User::factory()->create([
            'created_at' => now()->subDays(30),
            'updated_at' => now()->subDays(30),
        ]);

        $this->actingAs($user)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('two_factor_setup_required', true);

        $this->actingAs($user)
            ->getJson('/api/dashboard')
            ->assertStatus(423);

        $this->actingAs($user)
            ->postJson('/api/auth/2fa/setup')
            ->assertOk();
    }

    public function test_admin_can_reset_user_two_factor_and_revoke_app_passwords(): void
    {
        $admin = User::factory()->admin()->create();
        $user = User::factory()->create();

        $secret = app(TotpService::class)->generateSecret();
        app(TwoFactorService::class)->enable($user, $secret);
        app(AppPasswordService::class)->create($user, 'MacBook');

        $this->actingAs($admin)
            ->postJson('/api/admin/users/'.$user->id.'/two-factor/reset', [
                'revoke_app_passwords' => true,
            ])
            ->assertOk()
            ->assertJsonPath('two_factor_enabled', false)
            ->assertJsonPath('app_passwords_revoked', true);

        $this->assertFalse($user->fresh()->hasTwoFactorEnabled());
        $this->assertDatabaseHas('user_app_passwords', [
            'user_id' => $user->id,
        ]);
        $this->assertDatabaseMissing('user_app_passwords', [
            'user_id' => $user->id,
            'revoked_at' => null,
        ]);
    }
}
