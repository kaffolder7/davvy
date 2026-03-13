import React from "react";
import AuthShellComponent from "../components/auth/AuthShell";
import InviteAcceptPageComponent from "../components/auth/InviteAcceptPage";
import LoginPageComponent from "../components/auth/LoginPage";
import LoginTwoFactorPageComponent from "../components/auth/LoginTwoFactorPage";
import RegisterPageComponent from "../components/auth/RegisterPage";
import VerifyEmailPageComponent from "../components/auth/VerifyEmailPage";
import FieldComponent from "../components/common/Field";
import { api, extractError } from "../lib/api";

function Field({ label, children }) {
  return <FieldComponent label={label}>{children}</FieldComponent>;
}

export function LoginPageRoute({ auth, theme }) {
  return (
    <LoginPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AuthShell={AuthShellComponent}
      Field={Field}
    />
  );
}

export function LoginTwoFactorPageRoute({ auth, theme }) {
  return (
    <LoginTwoFactorPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AuthShell={AuthShellComponent}
      Field={Field}
    />
  );
}

export function RegisterPageRoute({ auth, theme }) {
  return (
    <RegisterPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AuthShell={AuthShellComponent}
      Field={Field}
    />
  );
}

export function VerifyEmailPageRoute({ auth, theme }) {
  return (
    <VerifyEmailPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AuthShell={AuthShellComponent}
    />
  );
}

export function InviteAcceptPageRoute({ auth, theme }) {
  return (
    <InviteAcceptPageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AuthShell={AuthShellComponent}
      Field={Field}
    />
  );
}
