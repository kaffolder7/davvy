<?php

namespace Database\Factories;

use App\Models\AddressBook;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<AddressBook>
 */
class AddressBookFactory extends Factory
{
    protected $model = AddressBook::class;

    public function definition(): array
    {
        return [
            'owner_id' => User::factory(),
            'uri' => Str::slug(fake()->unique()->words(2, true)),
            'display_name' => fake()->words(2, true),
            'description' => fake()->sentence(),
            'is_default' => false,
            'is_sharable' => false,
        ];
    }
}
