Hello {{ $user->name }},

Thanks for registering for {{ config('app.name', 'Davvy') }}.

Use this one-time link to verify your email address:
{{ $verificationUrl }}

This link expires at {{ $expiresAt->toDayDateTimeString() }}.

If you did not create this account, you can ignore this email.
