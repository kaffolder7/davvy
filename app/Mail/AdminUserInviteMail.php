<?php

namespace App\Mail;

use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Renders the one-time admin invitation email sent to newly created users.
 */
class AdminUserInviteMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $inviteUrl,
        public readonly CarbonInterface $expiresAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'You are invited to '.config('app.name', 'Davvy'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.auth.admin-invite',
            text: 'emails.auth.admin-invite-text',
        );
    }
}
