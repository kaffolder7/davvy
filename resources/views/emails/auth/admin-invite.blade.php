<!doctype html>
<html lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>You are invited</title>
  <style>
    :root {
      color-scheme: light dark;
      supported-color-schemes: light dark;
    }

    body {
      margin: 0;
      padding: 0;
      background: #f7faf9;
      color: #0b1c1a;
      font-family: "Space Grotesk", "Segoe UI", Arial, sans-serif;
    }

    .email-shell {
      width: 100%;
      background: radial-gradient(circle at 10% 20%, #d8f2ee 0%, transparent 44%), radial-gradient(circle at 80% 0%, #ffeecf 0%, transparent 38%), linear-gradient(160deg, #f7faf9, #eff3ea);
      padding: 28px 12px;
    }

    .email-card {
      width: 100%;
      max-width: 620px;
      margin: 0 auto;
      border: 1px solid #d9e7e2;
      border-radius: 18px;
      background: #ffffff;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
    }

    .header {
      padding: 28px 28px 20px;
      border-bottom: 1px solid #d9e7e2;
      text-align: center;
    }

    .logo {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      display: inline-block;
      margin-bottom: 14px;
    }

    .logo-dark {
      display: none;
    }

    .title {
      margin: 0;
      font-size: 26px;
      line-height: 1.2;
      color: #0f172a;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .subtitle {
      margin: 8px 0 0;
      font-size: 14px;
      line-height: 1.5;
      color: #475569;
    }

    .content {
      padding: 24px 28px;
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
    }

    .content p {
      margin: 0 0 14px;
    }

    .btn {
      display: inline-block;
      margin: 8px 0 14px;
      padding: 12px 20px;
      border-radius: 10px;
      text-decoration: none;
      background: #0b7a75;
      color: #ffffff !important;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .link-wrap {
      margin: 2px 0 14px;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      word-break: break-all;
      font-size: 13px;
      line-height: 1.45;
      color: #0f172a;
    }

    .meta {
      margin-top: 2px;
      font-size: 13px;
      color: #64748b;
    }

    .footer {
      border-top: 1px solid #d9e7e2;
      background: #f8fafc;
      padding: 14px 28px 18px;
      font-size: 12px;
      line-height: 1.5;
      color: #64748b;
      text-align: center;
    }

    @media (prefers-color-scheme: dark) {
      body {
        background: #090909;
        color: #f5f5f5;
      }

      .email-shell {
        background: radial-gradient(circle at 15% 15%, rgba(63, 63, 70, 0.18) 0%, transparent 44%), radial-gradient(circle at 85% 0%, rgba(39, 39, 42, 0.22) 0%, transparent 38%), linear-gradient(160deg, #090909, #141414);
      }

      .email-card {
        background: #18181b;
        border-color: #2a2a2a;
        box-shadow: 0 18px 38px rgba(0, 0, 0, 0.42);
      }

      .header {
        border-bottom-color: #2a2a2a;
      }

      .logo-light {
        display: none;
      }

      .logo-dark {
        display: inline-block;
      }

      .title {
        color: #fafafa;
      }

      .subtitle,
      .content {
        color: #d4d4d8;
      }

      .btn {
        background: #238b83;
      }

      .link-wrap {
        background: #09090b;
        border-color: #3f3f46;
        color: #e4e4e7;
      }

      .meta {
        color: #a1a1aa;
      }

      .footer {
        background: #09090b;
        border-top-color: #2a2a2a;
        color: #a1a1aa;
      }
    }
  </style>
</head>
<body>
@php($baseUrl = rtrim((string) config('app.url', ''), '/'))
@php($lightLogo = $baseUrl !== '' ? $baseUrl.'/davvy_dark.png' : '/davvy_dark.png')
@php($darkLogo = $baseUrl !== '' ? $baseUrl.'/davvy.png' : '/davvy.png')
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-shell">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="email-card">
        <tr>
          <td class="header">
            <img class="logo logo-light" src="{{ $lightLogo }}" alt="Davvy logo" />
            <img class="logo logo-dark" src="{{ $darkLogo }}" alt="Davvy logo" />
            <h1 class="title">You're invited to {{ config('app.name', 'Davvy') }}</h1>
            <p class="subtitle">A one-time activation link was created for your account.</p>
          </td>
        </tr>
        <tr>
          <td class="content">
            <p>Hello {{ $user->name }},</p>
            <p>An administrator created an account for you on {{ config('app.name', 'Davvy') }}.</p>
            <p>Set your password and activate your account:</p>
            <p>
              <a class="btn" href="{{ $inviteUrl }}">Activate Account</a>
            </p>
            <p class="meta">If the button does not work, copy and paste this link:</p>
            <div class="link-wrap">{{ $inviteUrl }}</div>
            <p class="meta">This one-time link expires at {{ $expiresAt->toDayDateTimeString() }}.</p>
          </td>
        </tr>
        <tr>
          <td class="footer">
            This message was sent by {{ config('app.name', 'Davvy') }}. If you did not expect this invitation, you can ignore this email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
