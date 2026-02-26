<?php

namespace Database\Factories;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\Calendar;
use App\Models\ResourceShare;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ResourceShare>
 */
class ResourceShareFactory extends Factory
{
    protected $model = ResourceShare::class;

    public function definition(): array
    {
        return [
            'resource_type' => ShareResourceType::Calendar,
            'owner_id' => User::factory(),
            'resource_id' => function (array $attributes): int {
                return Calendar::factory()->create([
                    'owner_id' => $attributes['owner_id'],
                    'is_sharable' => true,
                ])->id;
            },
            'shared_with_id' => User::factory(),
            'permission' => SharePermission::ReadOnly,
        ];
    }
}
