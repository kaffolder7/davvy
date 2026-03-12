<?php

namespace App\Services\Security;

use App\Models\AppSetting;
use App\Models\User;
use Carbon\CarbonImmutable;

class TwoFactorSettingsService
{
    public function isEnforced(): bool
    {
        return AppSetting::twoFactorEnforcementEnabled();
    }

    public function setEnforced(bool $enabled, ?User $actor = null): void
    {
        AppSetting::query()->updateOrCreate(
            ['key' => 'two_factor_enforcement_enabled'],
            ['value' => $enabled ? 'true' : 'false', 'updated_by' => $actor?->id],
        );

        if ($enabled) {
            $startedAt = $this->enforcementStartedAt();
            if ($startedAt === null) {
                AppSetting::query()->updateOrCreate(
                    ['key' => 'two_factor_enforcement_started_at'],
                    ['value' => now()->toISOString(), 'updated_by' => $actor?->id],
                );
            }

            return;
        }

        AppSetting::query()->updateOrCreate(
            ['key' => 'two_factor_enforcement_started_at'],
            ['value' => null, 'updated_by' => $actor?->id],
        );
    }

    public function gracePeriodDays(): int
    {
        $configured = (int) config('services.auth.two_factor_grace_period_days', 14);

        return max(1, min(30, $configured));
    }

    public function enforcementStartedAt(): ?CarbonImmutable
    {
        $raw = AppSetting::twoFactorEnforcementStartedAt();
        if ($raw === null) {
            return null;
        }

        try {
            return CarbonImmutable::parse($raw);
        } catch (\Throwable) {
            return null;
        }
    }

    public function graceDeadlineFor(User $user): ?CarbonImmutable
    {
        if (! $this->isEnforced() || $user->hasTwoFactorEnabled()) {
            return null;
        }

        $startedAt = $this->enforcementStartedAt();
        if ($startedAt === null) {
            return null;
        }

        $userCreatedAt = $user->created_at?->toImmutable();
        $reference = $userCreatedAt !== null && $userCreatedAt->greaterThan($startedAt)
            ? $userCreatedAt
            : $startedAt;

        return $reference->addDays($this->gracePeriodDays());
    }

    public function isSetupRequired(User $user): bool
    {
        if ($user->hasTwoFactorEnabled()) {
            return false;
        }

        $deadline = $this->graceDeadlineFor($user);

        return $deadline !== null && now()->greaterThanOrEqualTo($deadline);
    }

    public function isWithinGrace(User $user): bool
    {
        if (! $this->isEnforced() || $user->hasTwoFactorEnabled()) {
            return false;
        }

        $deadline = $this->graceDeadlineFor($user);

        return $deadline !== null && now()->lessThan($deadline);
    }
}
