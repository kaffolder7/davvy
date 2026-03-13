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

    public function test_dav_basic_auth_accepts_case_variant_email(): void
    {
        $user = User::factory()->create([
            'email' => 'principal-case@example.test',
            'password' => 'password1234',
        ]);

        $response = $this->call(
            method: 'PROPFIND',
            uri: '/dav',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode(strtoupper($user->email).':password1234'),
                'HTTP_DEPTH' => '0',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
        );

        $this->assertSame(207, $response->getStatusCode());
        $this->assertStringContainsString('/dav/principals/'.$user->id.'/', (string) $response->getContent());
    }

    public function test_dav_basic_auth_rejects_unapproved_users(): void
    {
        $user = User::factory()->create([
            'email' => 'pending-principal@example.test',
            'password' => 'password1234',
            'is_approved' => false,
            'approved_at' => null,
            'approved_by' => null,
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

        $this->assertSame(401, $response->getStatusCode());
    }

    public function test_authenticated_principal_propfind_returns_stable_resource_id(): void
    {
        $user = User::factory()->create([
            'email' => 'principal-resource-id@example.test',
            'password' => 'password1234',
        ]);

        $response = $this->call(
            method: 'PROPFIND',
            uri: '/dav/principals/'.$user->id.'/',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '0',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resource-id/></d:prop></d:propfind>',
        );

        $this->assertSame(207, $response->getStatusCode());
        $this->assertStringContainsString('<d:resource-id><d:href>urn:uuid:', (string) $response->getContent());
    }

    public function test_authenticated_principals_collection_listing_is_disabled(): void
    {
        $user = User::factory()->create([
            'email' => 'principal-listing-owner@example.test',
            'password' => 'password1234',
        ]);
        User::factory()->create([
            'email' => 'principal-listing-other@example.test',
        ]);

        $response = $this->call(
            method: 'PROPFIND',
            uri: '/dav/principals/',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '1',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
        );

        $this->assertSame(405, $response->getStatusCode());
    }

    public function test_principal_property_search_report_honors_anyof_and_allof_modes(): void
    {
        $user = User::factory()->create([
            'name' => 'Principal Search Owner',
            'email' => 'principal-search-owner@example.test',
            'password' => 'password1234',
        ]);
        $otherUser = User::factory()->create([
            'name' => 'Principal Search Other',
            'email' => 'principal-search-other@example.test',
        ]);

        $allOfResponse = $this->call(
            method: 'REPORT',
            uri: '/dav/principals/',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '0',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: <<<'XML'
<?xml version="1.0" encoding="utf-8"?>
<d:principal-property-search xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" test="allof">
  <d:property-search>
    <d:prop><d:displayname/></d:prop>
    <d:match>Principal Search</d:match>
  </d:property-search>
  <d:property-search>
    <d:prop><s:email-address/></d:prop>
    <d:match>missing-fragment</d:match>
  </d:property-search>
  <d:prop><d:displayname/></d:prop>
</d:principal-property-search>
XML,
        );

        $allOfResponse->assertStatus(207);
        $this->assertStringNotContainsString(
            '/dav/principals/'.$user->id.'/',
            (string) $allOfResponse->getContent()
        );

        $anyOfResponse = $this->call(
            method: 'REPORT',
            uri: '/dav/principals/',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '0',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: <<<'XML'
<?xml version="1.0" encoding="utf-8"?>
<d:principal-property-search xmlns:d="DAV:" xmlns:s="http://sabredav.org/ns" test="anyof">
  <d:property-search>
    <d:prop><d:displayname/></d:prop>
    <d:match>Principal Search</d:match>
  </d:property-search>
  <d:property-search>
    <d:prop><s:email-address/></d:prop>
    <d:match>missing-fragment</d:match>
  </d:property-search>
  <d:prop><d:displayname/></d:prop>
</d:principal-property-search>
XML,
        );

        $anyOfResponse->assertStatus(207);
        $this->assertStringContainsString('/dav/principals/'.$user->id.'/', (string) $anyOfResponse->getContent());
        $this->assertStringNotContainsString('/dav/principals/'.$otherUser->id.'/', (string) $anyOfResponse->getContent());
    }

    public function test_address_book_home_propfind_exposes_display_name_and_sync_token(): void
    {
        $user = User::factory()->create([
            'email' => 'addressbook-home-sync@example.test',
            'password' => 'password1234',
        ]);

        $response = $this->call(
            method: 'PROPFIND',
            uri: '/dav/addressbooks/'.$user->id.'/',
            server: [
                'HTTP_AUTHORIZATION' => 'Basic '.base64_encode($user->email.':password1234'),
                'HTTP_DEPTH' => '0',
                'CONTENT_TYPE' => 'application/xml; charset=utf-8',
            ],
            content: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:sync-token/></d:prop></d:propfind>',
        );

        $this->assertSame(207, $response->getStatusCode());
        $this->assertStringContainsString('<d:displayname>Address Books</d:displayname>', (string) $response->getContent());
        $this->assertStringContainsString('<d:sync-token>http://sabre.io/ns/sync/home-', (string) $response->getContent());
    }
}
