<?php

return [
    'require_public_email_verification' => (bool) env('ONBOARDING_REQUIRE_PUBLIC_EMAIL_VERIFICATION', true),
    'send_emails' => (bool) env('ONBOARDING_SEND_EMAILS', env('MAIL_MAILER', 'log') !== 'log'),
    'invite_expires_hours' => (int) env('ONBOARDING_INVITE_EXPIRES_HOURS', 72),
    'verification_expires_hours' => (int) env('ONBOARDING_VERIFICATION_EXPIRES_HOURS', 24),
    'expose_links_without_mailer' => (bool) env('ONBOARDING_EXPOSE_LINKS_WITHOUT_MAILER', true),
];
