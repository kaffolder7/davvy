Hello {{ $user->name }},

An administrator created an account for you on {{ config('app.name', 'Davvy') }}.

Use this one-time link to set your password and activate your account:
{{ $inviteUrl }}

This link expires at {{ $expiresAt->toDayDateTimeString() }}.

If you did not expect this invitation, you can ignore this email.
