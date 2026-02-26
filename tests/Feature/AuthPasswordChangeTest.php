<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthPasswordChangeTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_user_can_change_password(): void
    {
        $user = User::factory()->create([
            'password' => 'CurrentPassword123!',
        ]);

        $this->actingAs($user)
            ->patchJson('/api/auth/password', [
                'current_password' => 'CurrentPassword123!',
                'password' => 'UpdatedPassword123!',
                'password_confirmation' => 'UpdatedPassword123!',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $user->refresh();

        $this->assertTrue(Hash::check('UpdatedPassword123!', $user->password));
        $this->assertFalse(Hash::check('CurrentPassword123!', $user->password));
    }

    public function test_password_change_requires_valid_current_password(): void
    {
        $user = User::factory()->create([
            'password' => 'CurrentPassword123!',
        ]);

        $this->actingAs($user)
            ->patchJson('/api/auth/password', [
                'current_password' => 'WrongPassword123!',
                'password' => 'UpdatedPassword123!',
                'password_confirmation' => 'UpdatedPassword123!',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['current_password']);

        $user->refresh();
        $this->assertTrue(Hash::check('CurrentPassword123!', $user->password));
    }

    public function test_password_change_requires_authentication(): void
    {
        $this->patchJson('/api/auth/password', [
            'current_password' => 'CurrentPassword123!',
            'password' => 'UpdatedPassword123!',
            'password_confirmation' => 'UpdatedPassword123!',
        ])->assertUnauthorized();
    }
}
