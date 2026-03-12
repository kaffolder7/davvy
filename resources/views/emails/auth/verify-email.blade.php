<p>Hello {{ $user->name }},</p>

<p>Thanks for registering for {{ config('app.name', 'Davvy') }}.</p>

<p>Confirm your email by opening this link:</p>

<p><a href="{{ $verificationUrl }}">{{ $verificationUrl }}</a></p>

<p>This link expires at {{ $expiresAt->toDayDateTimeString() }}.</p>
