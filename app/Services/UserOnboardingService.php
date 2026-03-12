<?php

namespace App\Services;

use App\Mail\AdminUserInviteMail;
use App\Mail\PublicRegistrationVerificationMail;
use App\Models\User;
use App\Models\UserOnboardingToken;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;

/**
 * Handles one-time onboarding token issuance, validation, and optional email delivery.
 */
class UserOnboardingService
{
    public const PURPOSE_INVITE = 'invite';

    public const PURPOSE_EMAIL_VERIFICATION = 'verify_email';

    /**
     * Issues a new one-time admin invitation token for the user.
     */
    public function issueInvite(User $user): array
    {
        return $this->issueToken(
            user: $user,
            purpose: self::PURPOSE_INVITE,
            expiresAt: now()->addHours(max(1, (int) config('onboarding.invite_expires_hours', 72))),
        );
    }

    /**
     * Issues a new one-time public registration email verification token for the user.
     */
    public function issueEmailVerification(User $user): array
    {
        return $this->issueToken(
            user: $user,
            purpose: self::PURPOSE_EMAIL_VERIFICATION,
            expiresAt: now()->addHours(max(1, (int) config('onboarding.verification_expires_hours', 24))),
        );
    }

    /**
     * Consumes a one-time invite token if it is valid and unexpired.
     */
    public function consumeInvite(string $token): ?UserOnboardingToken
    {
        return $this->consumeToken(self::PURPOSE_INVITE, $token);
    }

    /**
     * Consumes a one-time email verification token if it is valid and unexpired.
     */
    public function consumeEmailVerification(string $token): ?UserOnboardingToken
    {
        return $this->consumeToken(self::PURPOSE_EMAIL_VERIFICATION, $token);
    }

    /**
     * Returns whether public sign-ups must verify email before login.
     */
    public function shouldRequirePublicEmailVerification(): bool
    {
        return (bool) config('onboarding.require_public_email_verification', true);
    }

    /**
     * Returns whether onboarding emails should be sent through the configured mailer.
     */
    public function shouldSendEmails(): bool
    {
        return (bool) config('onboarding.send_emails', false);
    }

    /**
     * Returns whether manual onboarding links may be exposed when email delivery is unavailable.
     */
    public function shouldExposeLinksWithoutMailer(): bool
    {
        return (bool) config('onboarding.expose_links_without_mailer', true);
    }

    /**
     * Attempts to send an admin invitation email and reports delivery success.
     */
    public function sendInviteEmail(User $user, string $inviteUrl, CarbonInterface $expiresAt): bool
    {
        if (! $this->shouldSendEmails()) {
            return false;
        }

        try {
            Mail::to($user->email)->send(new AdminUserInviteMail($user, $inviteUrl, $expiresAt));

            return true;
        } catch (Throwable $throwable) {
            report($throwable);

            return false;
        }
    }

    /**
     * Attempts to send a public registration verification email and reports delivery success.
     */
    public function sendVerificationEmail(User $user, string $verificationUrl, CarbonInterface $expiresAt): bool
    {
        if (! $this->shouldSendEmails()) {
            return false;
        }

        try {
            Mail::to($user->email)->send(new PublicRegistrationVerificationMail($user, $verificationUrl, $expiresAt));

            return true;
        } catch (Throwable $throwable) {
            report($throwable);

            return false;
        }
    }

    /**
     * Replaces prior unused tokens for a purpose and persists a fresh one-time token.
     */
    private function issueToken(User $user, string $purpose, CarbonInterface $expiresAt): array
    {
        UserOnboardingToken::query()
            ->where('user_id', $user->id)
            ->where('purpose', $purpose)
            ->whereNull('used_at')
            ->delete();

        [$token, $tokenHash] = $this->generateTokenPair();

        UserOnboardingToken::query()->create([
            'user_id' => $user->id,
            'purpose' => $purpose,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'used_at' => null,
        ]);

        return [
            'token' => $token,
            'url' => $this->buildActionUrl($purpose, $token),
            'expires_at' => CarbonImmutable::parse($expiresAt),
        ];
    }

    /**
     * Atomically validates and marks a one-time token as used.
     */
    private function consumeToken(string $purpose, string $token): ?UserOnboardingToken
    {
        $normalized = trim($token);
        if ($normalized === '') {
            return null;
        }

        $hash = hash('sha256', $normalized);

        return DB::transaction(function () use ($purpose, $hash): ?UserOnboardingToken {
            $record = UserOnboardingToken::query()
                ->where('purpose', $purpose)
                ->where('token_hash', $hash)
                ->lockForUpdate()
                ->first();

            if (! $record) {
                return null;
            }

            if ($record->used_at !== null) {
                return null;
            }

            if ($record->expires_at->isPast()) {
                return null;
            }

            $record->used_at = now();
            $record->save();

            return $record->fresh(['user']);
        });
    }

    /**
     * Builds the browser-facing action URL for an onboarding token purpose.
     */
    private function buildActionUrl(string $purpose, string $token): string
    {
        $baseUrl = rtrim((string) config('app.url', ''), '/');
        $path = match ($purpose) {
            self::PURPOSE_INVITE => '/invite',
            self::PURPOSE_EMAIL_VERIFICATION => '/verify-email',
            default => '/',
        };

        return "{$baseUrl}{$path}?token=".rawurlencode($token);
    }

    /**
     * Generates a unique raw token and its stored hash representation.
     */
    private function generateTokenPair(): array
    {
        do {
            $token = Str::random(64);
            $tokenHash = hash('sha256', $token);
        } while (UserOnboardingToken::query()->where('token_hash', $tokenHash)->exists());

        return [$token, $tokenHash];
    }
}
