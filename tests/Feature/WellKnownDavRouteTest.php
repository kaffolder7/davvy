<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WellKnownDavRouteTest extends TestCase
{
    use RefreshDatabase;

    public function test_caldav_well_known_redirects_to_dav_endpoint(): void
    {
        $this->get('/.well-known/caldav')
            ->assertStatus(301)
            ->assertRedirect('/dav');
    }

    public function test_carddav_well_known_redirects_to_dav_endpoint(): void
    {
        $this->get('/.well-known/carddav')
            ->assertStatus(301)
            ->assertRedirect('/dav');
    }
}
