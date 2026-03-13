<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class UserApprovalCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_defaults_to_approving_and_verifying_user_by_email(): void
    {
        $user = User::factory()->create([
            'email' => 'Locked.Out@Example.com',
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
            'email_verified_at' => null,
        ]);

        $this->artisan('app:user:approve', [
            'identifier' => 'LOCKED.OUT@EXAMPLE.COM',
            '--force' => true,
        ])->assertExitCode(0);

        $fresh = $user->fresh();
        $this->assertTrue((bool) $fresh?->is_approved);
        $this->assertNull($fresh?->approved_by);
        $this->assertNotNull($fresh?->approved_at);
        $this->assertNotNull($fresh?->email_verified_at);
    }

    public function test_command_can_only_approve_without_verifying_email(): void
    {
        $user = User::factory()->create([
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
            'email_verified_at' => null,
        ]);

        $this->artisan('app:user:approve', [
            'identifier' => (string) $user->id,
            '--approve' => true,
            '--force' => true,
        ])->assertExitCode(0);

        $fresh = $user->fresh();
        $this->assertTrue((bool) $fresh?->is_approved);
        $this->assertNotNull($fresh?->approved_at);
        $this->assertNull($fresh?->email_verified_at);
    }

    public function test_command_can_only_verify_without_approving(): void
    {
        $user = User::factory()->create([
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
            'email_verified_at' => null,
        ]);

        $this->artisan('app:user:approve', [
            'identifier' => (string) $user->id,
            '--verify-email' => true,
            '--force' => true,
        ])->assertExitCode(0);

        $fresh = $user->fresh();
        $this->assertFalse((bool) $fresh?->is_approved);
        $this->assertNull($fresh?->approved_at);
        $this->assertNotNull($fresh?->email_verified_at);
    }

    public function test_command_is_idempotent_for_users_that_already_match_selected_state(): void
    {
        $approvedAt = Carbon::parse('2026-03-01T10:00:00Z');
        $verifiedAt = Carbon::parse('2026-03-01T11:00:00Z');

        $user = User::factory()->create([
            'is_approved' => true,
            'approved_at' => $approvedAt,
            'approved_by' => 99,
            'email_verified_at' => $verifiedAt,
        ]);

        $this->artisan('app:user:approve', [
            'identifier' => (string) $user->id,
            '--force' => true,
        ])->assertExitCode(0);

        $fresh = $user->fresh();
        $this->assertTrue((bool) $fresh?->is_approved);
        $this->assertTrue($fresh?->approved_at?->equalTo($approvedAt) ?? false);
        $this->assertSame(99, $fresh?->approved_by);
        $this->assertTrue($fresh?->email_verified_at?->equalTo($verifiedAt) ?? false);
    }

    public function test_command_returns_error_when_user_identifier_is_unknown(): void
    {
        $this->artisan('app:user:approve', [
            'identifier' => 'missing-user@example.com',
            '--force' => true,
        ])->assertExitCode(1);
    }
}
