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
 * Renders the one-time public registration email verification message.
 */
class PublicRegistrationVerificationMail extends Mailable
{
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly User $user,
        public readonly string $verificationUrl,
        public readonly CarbonInterface $expiresAt,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Verify your email for '.config('app.name', 'Davvy'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.auth.verify-email',
        );
    }
}
