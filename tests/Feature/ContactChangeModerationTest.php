<?php

namespace Tests\Feature;

use App\Enums\SharePermission;
use App\Enums\ShareResourceType;
use App\Models\AddressBook;
use App\Models\Contact;
use App\Models\ContactAddressBookAssignment;
use App\Models\ContactChangeRequest;
use App\Models\ResourceShare;
use App\Models\User;
use App\Services\Dav\Backends\LaravelCardDavBackend;
use App\Services\DavRequestContext;
use App\Services\RegistrationSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Sabre\DAV\Exception\Conflict;
use Tests\TestCase;

class ContactChangeModerationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        app(RegistrationSettingsService::class)->setContactManagementEnabled(true);
        app(RegistrationSettingsService::class)->setContactChangeModerationEnabled(true);
    }

    public function test_editor_web_update_is_enqueued_and_owner_can_approve_it(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $queued = $this->actingAs($editor)->patchJson('/api/contacts/'.$contactId, [
            'first_name' => 'Jordan',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);

        $queued->assertStatus(202)->assertJsonPath('queued', true);
        $this->assertSame('Alex', Contact::query()->findOrFail($contactId)->payload['first_name'] ?? null);

        $requests = $this->actingAs($owner)
            ->getJson('/api/contact-change-requests?status=open')
            ->assertOk();

        $requestId = (int) $requests->json('data.0.id');
        $this->assertGreaterThan(0, $requestId);

        $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'applied');

        $this->assertSame('Jordan', Contact::query()->findOrFail($contactId)->payload['first_name'] ?? null);
    }

    public function test_editor_web_update_with_birthday_dates_and_related_names_is_enqueued_and_applied(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $partnerCreated = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Jamie',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $partnerCreated->assertCreated();
        $partnerId = (int) $partnerCreated->json('id');
        $partnerName = (string) $partnerCreated->json('display_name');

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $queued = $this->actingAs($editor)->patchJson('/api/contacts/'.$contactId, [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'birthday' => [
                'year' => 1988,
                'month' => 3,
                'day' => 9,
            ],
            'dates' => [
                [
                    'label' => 'anniversary',
                    'custom_label' => null,
                    'year' => 2011,
                    'month' => 11,
                    'day' => 2,
                ],
                [
                    'label' => 'custom',
                    'custom_label' => 'First Met',
                    'year' => 2009,
                    'month' => 4,
                    'day' => 3,
                ],
            ],
            'related_names' => [
                [
                    'label' => 'spouse',
                    'custom_label' => null,
                    'value' => 'Ignored',
                    'related_contact_id' => $partnerId,
                ],
            ],
            'address_book_ids' => [$book->id],
        ]);

        $queued->assertStatus(202)->assertJsonPath('queued', true);

        $pendingPayload = Contact::query()->findOrFail($contactId)->payload;
        $this->assertSame(null, $pendingPayload['birthday']['year'] ?? null);
        $this->assertSame([], $pendingPayload['dates'] ?? []);
        $this->assertSame([], $pendingPayload['related_names'] ?? []);

        $requests = $this->actingAs($owner)
            ->getJson('/api/contact-change-requests?status=open')
            ->assertOk();

        $requestId = (int) $requests->json('data.0.id');
        $this->assertGreaterThan(0, $requestId);
        $this->assertContains('birthday', $requests->json('data.0.changed_fields') ?? []);
        $this->assertContains('dates', $requests->json('data.0.changed_fields') ?? []);
        $this->assertContains('related_names', $requests->json('data.0.changed_fields') ?? []);

        $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'applied');

        $updatedPayload = Contact::query()->findOrFail($contactId)->payload;
        $this->assertSame(1988, $updatedPayload['birthday']['year'] ?? null);
        $this->assertSame(3, $updatedPayload['birthday']['month'] ?? null);
        $this->assertSame(9, $updatedPayload['birthday']['day'] ?? null);
        $this->assertSame('anniversary', $updatedPayload['dates'][0]['label'] ?? null);
        $this->assertSame(2011, $updatedPayload['dates'][0]['year'] ?? null);
        $this->assertSame('custom', $updatedPayload['dates'][1]['label'] ?? null);
        $this->assertSame('First Met', $updatedPayload['dates'][1]['custom_label'] ?? null);
        $this->assertSame($partnerId, $updatedPayload['related_names'][0]['related_contact_id'] ?? null);
        $this->assertSame($partnerName, $updatedPayload['related_names'][0]['value'] ?? null);
    }

    public function test_conflicting_owner_edit_moves_request_to_manual_merge_until_resolved(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $this->actingAs($editor)->patchJson('/api/contacts/'.$contactId, [
            'first_name' => 'Jordan',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ])->assertStatus(202);

        $this->actingAs($owner)->patchJson('/api/contacts/'.$contactId, [
            'first_name' => 'Taylor',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ])->assertOk();

        $requestId = (int) ContactChangeRequest::query()->value('id');

        $manual = $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve');

        $manual->assertOk()->assertJsonPath('data.status', 'manual_merge_needed');
        $this->assertSame('Taylor', Contact::query()->findOrFail($contactId)->payload['first_name'] ?? null);

        $resolvedPayload = Contact::query()->findOrFail($contactId)->payload;
        $resolvedPayload['first_name'] = 'Jordan';

        $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve', [
                'resolved_payload' => $resolvedPayload,
                'resolved_address_book_ids' => [$book->id],
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'applied');

        $this->assertSame('Jordan', Contact::query()->findOrFail($contactId)->payload['first_name'] ?? null);
    }

    public function test_editor_carddav_update_is_enqueued_and_returns_conflict(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');
        $uid = (string) $created->json('uid');
        $cardUri = (string) ContactAddressBookAssignment::query()
            ->where('contact_id', $contactId)
            ->where('address_book_id', $book->id)
            ->value('card_uri');

        app(DavRequestContext::class)->setAuthenticatedUser($editor);

        try {
            app(LaravelCardDavBackend::class)->updateCard(
                $book->id,
                $cardUri,
                "BEGIN:VCARD\nVERSION:4.0\nFN:Jordan Rivera\nN:Rivera;Jordan;;;\nUID:{$uid}\nEMAIL;TYPE=WORK:jordan@example.com\nEND:VCARD"
            );

            $this->fail('Expected CardDAV update to be queued and rejected with a conflict.');
        } catch (Conflict $exception) {
            $this->assertStringContainsString('submitted for owner/admin approval', $exception->getMessage());
        }

        $this->assertSame('Alex', Contact::query()->findOrFail($contactId)->payload['first_name'] ?? null);
        $this->assertDatabaseHas('contact_change_requests', [
            'contact_id' => $contactId,
            'operation' => 'update',
            'source' => 'carddav',
            'status' => 'pending',
        ]);
    }

    public function test_editor_carddav_update_with_birthday_dates_and_related_names_is_enqueued_and_applied(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');
        $uid = (string) $created->json('uid');
        $cardUri = (string) ContactAddressBookAssignment::query()
            ->where('contact_id', $contactId)
            ->where('address_book_id', $book->id)
            ->value('card_uri');

        app(DavRequestContext::class)->setAuthenticatedUser($editor);

        try {
            app(LaravelCardDavBackend::class)->updateCard(
                $book->id,
                $cardUri,
                "BEGIN:VCARD\nVERSION:4.0\nFN:Alex Rivera\nN:Rivera;Alex;;;\nUID:{$uid}\nBDAY:1988-03-09\nANNIVERSARY:2011-11-02\nX-ABDATE;X-ABLabel=First Met:2009-04-03\nRELATED;TYPE=SPOUSE:Jamie Rivera\nEND:VCARD"
            );

            $this->fail('Expected CardDAV update to be queued and rejected with a conflict.');
        } catch (Conflict $exception) {
            $this->assertStringContainsString('submitted for owner/admin approval', $exception->getMessage());
        }

        $pendingPayload = Contact::query()->findOrFail($contactId)->payload;
        $this->assertSame(null, $pendingPayload['birthday']['year'] ?? null);
        $this->assertSame([], $pendingPayload['dates'] ?? []);
        $this->assertSame([], $pendingPayload['related_names'] ?? []);

        $requestId = (int) ContactChangeRequest::query()
            ->where('contact_id', $contactId)
            ->where('operation', 'update')
            ->where('source', 'carddav')
            ->where('status', 'pending')
            ->latest('id')
            ->value('id');
        $this->assertGreaterThan(0, $requestId);

        $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'applied');

        $updatedPayload = Contact::query()->findOrFail($contactId)->payload;
        $this->assertSame(1988, $updatedPayload['birthday']['year'] ?? null);
        $this->assertSame(3, $updatedPayload['birthday']['month'] ?? null);
        $this->assertSame(9, $updatedPayload['birthday']['day'] ?? null);
        $this->assertSame('anniversary', $updatedPayload['dates'][0]['label'] ?? null);
        $this->assertSame(2011, $updatedPayload['dates'][0]['year'] ?? null);
        $this->assertSame('custom', $updatedPayload['dates'][1]['label'] ?? null);
        $this->assertSame('first met', $updatedPayload['dates'][1]['custom_label'] ?? null);
        $this->assertSame('spouse', $updatedPayload['related_names'][0]['label'] ?? null);
        $this->assertSame('Jamie Rivera', $updatedPayload['related_names'][0]['value'] ?? null);
    }

    public function test_editor_web_delete_is_enqueued_and_owner_can_approve_it(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();
        $contactId = (int) $created->json('id');

        $this->actingAs($editor)
            ->deleteJson('/api/contacts/'.$contactId)
            ->assertStatus(202)
            ->assertJsonPath('queued', true);

        $this->assertDatabaseHas('contacts', ['id' => $contactId]);

        $requestId = (int) ContactChangeRequest::query()
            ->where('contact_id', $contactId)
            ->where('operation', 'delete')
            ->where('source', 'web')
            ->where('status', 'pending')
            ->latest('id')
            ->value('id');
        $this->assertGreaterThan(0, $requestId);

        $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'applied');

        $this->assertDatabaseMissing('contacts', ['id' => $contactId]);
    }

    public function test_editor_carddav_delete_is_enqueued_and_owner_can_approve_it(): void
    {
        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');
        $cardUri = (string) ContactAddressBookAssignment::query()
            ->where('contact_id', $contactId)
            ->where('address_book_id', $book->id)
            ->value('card_uri');

        app(DavRequestContext::class)->setAuthenticatedUser($editor);

        try {
            app(LaravelCardDavBackend::class)->deleteCard($book->id, $cardUri);

            $this->fail('Expected CardDAV delete to be queued and rejected with a conflict.');
        } catch (Conflict $exception) {
            $this->assertStringContainsString('submitted for owner/admin approval', $exception->getMessage());
        }

        $this->assertDatabaseHas('contacts', ['id' => $contactId]);

        $requestId = (int) ContactChangeRequest::query()
            ->where('contact_id', $contactId)
            ->where('operation', 'delete')
            ->where('source', 'carddav')
            ->where('status', 'pending')
            ->latest('id')
            ->value('id');
        $this->assertGreaterThan(0, $requestId);

        $this->actingAs($owner)
            ->patchJson('/api/contact-change-requests/'.$requestId.'/approve')
            ->assertOk()
            ->assertJsonPath('data.status', 'applied');

        $this->assertDatabaseMissing('contacts', ['id' => $contactId]);
    }

    public function test_editor_web_update_applies_immediately_when_moderation_is_disabled(): void
    {
        app(RegistrationSettingsService::class)->setContactChangeModerationEnabled(false);

        [$owner, $editor, $book] = $this->ownerEditorAndSharedBook();

        $created = $this->actingAs($owner)->postJson('/api/contacts', [
            'first_name' => 'Alex',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);
        $created->assertCreated();

        $contactId = (int) $created->json('id');

        $updated = $this->actingAs($editor)->patchJson('/api/contacts/'.$contactId, [
            'first_name' => 'Jordan',
            'last_name' => 'Rivera',
            'address_book_ids' => [$book->id],
        ]);

        $updated->assertOk()->assertJsonMissingPath('queued');
        $this->assertSame('Jordan', Contact::query()->findOrFail($contactId)->payload['first_name'] ?? null);
        $this->assertDatabaseCount('contact_change_requests', 0);
    }

    public function test_review_queue_endpoints_return_forbidden_when_moderation_is_disabled(): void
    {
        app(RegistrationSettingsService::class)->setContactChangeModerationEnabled(false);

        $reviewer = User::factory()->create();

        $this->actingAs($reviewer)
            ->getJson('/api/contact-change-requests')
            ->assertForbidden()
            ->assertJsonPath('message', 'Review queue is currently disabled by admins.');

        $this->actingAs($reviewer)
            ->getJson('/api/contact-change-requests/summary')
            ->assertForbidden()
            ->assertJsonPath('message', 'Review queue is currently disabled by admins.');
    }

    /**
     * @return array{0:User,1:User,2:AddressBook}
     */
    private function ownerEditorAndSharedBook(): array
    {
        $owner = User::factory()->create();
        $editor = User::factory()->create();
        $book = AddressBook::factory()->create([
            'owner_id' => $owner->id,
            'is_sharable' => true,
        ]);

        ResourceShare::query()->create([
            'resource_type' => ShareResourceType::AddressBook,
            'resource_id' => $book->id,
            'owner_id' => $owner->id,
            'shared_with_id' => $editor->id,
            'permission' => SharePermission::Editor,
        ]);

        return [$owner, $editor, $book];
    }
}
