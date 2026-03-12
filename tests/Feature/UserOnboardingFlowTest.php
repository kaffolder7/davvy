<?php

namespace Tests\Feature;

use App\Mail\AdminUserInviteMail;
use App\Mail\PublicRegistrationVerificationMail;
use App\Models\User;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class UserOnboardingFlowTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_returns_verification_requirement_and_manual_link_when_mail_is_disabled(): void
    {
        config()->set('onboarding.require_public_email_verification', true);
        config()->set('onboarding.send_emails', false);
        config()->set('onboarding.expose_links_without_mailer', true);

        $settings = app(RegistrationSettingsService::class);
        $settings->setPublicRegistrationEnabled(true);
        $settings->setPublicRegistrationApprovalRequired(false);

        $response = $this->postJson('/api/auth/register', [
            'name' => 'Verify Me',
            'email' => 'verify-me@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $response->assertStatus(202);
        $response->assertJsonPath('registration_pending_verification', true);
        $response->assertJsonPath('verification_email_sent', false);
        $response->assertJsonPath('registration_pending_approval', false);
        $this->assertNotNull($response->json('verification_url'));
        $this->assertGuest();

        $this->assertDatabaseHas('users', [
            'email' => 'verify-me@example.com',
            'is_approved' => true,
        ]);
    }

    public function test_verifying_email_token_signs_in_when_account_is_approved(): void
    {
        config()->set('onboarding.require_public_email_verification', true);
        config()->set('onboarding.send_emails', false);
        config()->set('onboarding.expose_links_without_mailer', true);

        $settings = app(RegistrationSettingsService::class);
        $settings->setPublicRegistrationEnabled(true);
        $settings->setPublicRegistrationApprovalRequired(false);

        $registration = $this->postJson('/api/auth/register', [
            'name' => 'Verify Me',
            'email' => 'verify-me@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ])->assertStatus(202);

        $verificationUrl = (string) $registration->json('verification_url');
        $token = $this->extractTokenFromUrl($verificationUrl);

        $verified = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
        ]);

        $user = User::query()->where('email', 'verify-me@example.com')->firstOrFail();

        $verified->assertOk();
        $verified->assertJsonPath('email_verified', true);
        $verified->assertJsonPath('user.id', $user->id);
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->assertAuthenticatedAs($user);
    }

    public function test_verifying_email_token_keeps_session_guest_when_account_is_pending_approval(): void
    {
        config()->set('onboarding.require_public_email_verification', true);
        config()->set('onboarding.send_emails', false);
        config()->set('onboarding.expose_links_without_mailer', true);

        $settings = app(RegistrationSettingsService::class);
        $settings->setPublicRegistrationEnabled(true);
        $settings->setPublicRegistrationApprovalRequired(true);

        $registration = $this->postJson('/api/auth/register', [
            'name' => 'Pending Approval',
            'email' => 'pending-approval@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ])->assertStatus(202);

        $token = $this->extractTokenFromUrl((string) $registration->json('verification_url'));

        $verified = $this->postJson('/api/auth/verify-email', [
            'token' => $token,
        ]);

        $verified->assertStatus(202);
        $verified->assertJsonPath('registration_pending_approval', true);
        $this->assertGuest();
    }

    public function test_admin_created_user_can_accept_invitation_to_set_password_and_sign_in(): void
    {
        config()->set('onboarding.send_emails', false);
        config()->set('onboarding.expose_links_without_mailer', true);

        $admin = User::factory()->admin()->create();

        $created = $this->actingAs($admin)->postJson('/api/admin/users', [
            'name' => 'Invited User',
            'email' => 'invited@example.com',
            'role' => 'regular',
        ]);

        $created->assertCreated();
        $created->assertJsonPath('invitation_sent', false);
        $inviteToken = $this->extractTokenFromUrl((string) $created->json('invitation_url'));

        $accepted = $this->postJson('/api/auth/invite/accept', [
            'token' => $inviteToken,
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ]);

        $invitedUser = User::query()->where('email', 'invited@example.com')->firstOrFail();

        $accepted->assertOk();
        $accepted->assertJsonPath('invitation_accepted', true);
        $accepted->assertJsonPath('user.id', $invitedUser->id);
        $this->assertNotNull($invitedUser->fresh()->email_verified_at);
        $this->assertAuthenticatedAs($invitedUser);

        $this->postJson('/api/auth/logout')->assertOk();

        $this->postJson('/api/auth/login', [
            'email' => 'invited@example.com',
            'password' => 'Password123!',
        ])->assertOk();
    }

    public function test_login_rejects_unverified_accounts_when_verification_is_required(): void
    {
        config()->set('onboarding.require_public_email_verification', true);

        User::factory()->create([
            'email' => 'unverified@example.com',
            'password' => 'Password123!',
            'is_approved' => true,
            'email_verified_at' => null,
        ]);

        $this->postJson('/api/auth/login', [
            'email' => 'unverified@example.com',
            'password' => 'Password123!',
        ])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Verify your email address before signing in.');
    }

    public function test_registration_and_admin_create_send_mail_when_enabled(): void
    {
        Mail::fake();
        config()->set('onboarding.require_public_email_verification', true);
        config()->set('onboarding.send_emails', true);

        $settings = app(RegistrationSettingsService::class);
        $settings->setPublicRegistrationEnabled(true);
        $settings->setPublicRegistrationApprovalRequired(false);

        $this->postJson('/api/auth/register', [
            'name' => 'Mail Verify',
            'email' => 'mail-verify@example.com',
            'password' => 'Password123!',
            'password_confirmation' => 'Password123!',
        ])->assertStatus(202);

        Mail::assertSent(PublicRegistrationVerificationMail::class, function (PublicRegistrationVerificationMail $mail): bool {
            return $mail->hasTo('mail-verify@example.com');
        });

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->postJson('/api/admin/users', [
            'name' => 'Mail Invite',
            'email' => 'mail-invite@example.com',
            'role' => 'regular',
        ])->assertCreated()->assertJsonPath('invitation_sent', true);

        Mail::assertSent(AdminUserInviteMail::class, function (AdminUserInviteMail $mail): bool {
            return $mail->hasTo('mail-invite@example.com');
        });
    }

    private function extractTokenFromUrl(string $url): string
    {
        $parts = parse_url($url);
        parse_str((string) ($parts['query'] ?? ''), $query);
        $token = (string) ($query['token'] ?? '');

        $this->assertSame(64, strlen($token), 'Expected a 64-character onboarding token.');

        return $token;
    }
}
