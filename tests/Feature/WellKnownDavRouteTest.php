<?php

namespace Tests\Feature;

use App\Models\User;
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

    public function test_carddav_well_known_propfind_redirects_to_dav_endpoint_with_method_preserved(): void
    {
        $response = $this->call('PROPFIND', '/.well-known/carddav', server: [
            'HTTP_DEPTH' => '0',
        ]);

        $response->assertStatus(308);
        $this->assertStringEndsWith('/dav', (string) $response->headers->get('Location'));
    }

    public function test_dav_route_accepts_propfind_method(): void
    {
        $response = $this->call('PROPFIND', '/dav', server: [
            'HTTP_DEPTH' => '0',
        ]);

        $this->assertSame(401, $response->getStatusCode());
        $this->assertStringContainsString('Basic', (string) $response->headers->get('WWW-Authenticate'));
    }

    public function test_authenticated_root_propfind_returns_id_based_current_user_principal(): void
    {
        $user = User::factory()->create([
            'email' => 'principal-check@example.test',
            'password' => 'password1234',
        ]);

        $response = $this->call(
            method: 'PROPFIND',
            uri: '/dav',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '0',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
        );

        $this->assertSame(207, $response->getStatusCode());
        $this->assertStringContainsString('/dav/principals/'.$user->id.'/', (string) $response->getContent());
    }
}
