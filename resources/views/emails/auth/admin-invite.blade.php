<p>Hello {{ $user->name }},</p>

<p>An administrator created an account for you on {{ config('app.name', 'Davvy') }}.</p>

<p>Use this one-time link to set your password and activate your account:</p>

<p><a href="{{ $inviteUrl }}">{{ $inviteUrl }}</a></p>

<p>This link expires at {{ $expiresAt->toDayDateTimeString() }}.</p>
