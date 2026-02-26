<?php

namespace Database\Factories;

use App\Models\Calendar;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Calendar>
 */
class CalendarFactory extends Factory
{
    protected $model = Calendar::class;

    public function definition(): array
    {
        return [
            'owner_id' => User::factory(),
            'uri' => Str::slug(fake()->unique()->words(2, true)),
            'display_name' => fake()->words(2, true),
            'description' => fake()->sentence(),
            'color' => '#0EA5E9',
            'timezone' => 'UTC',
            'is_default' => false,
            'is_sharable' => false,
        ];
    }
}
