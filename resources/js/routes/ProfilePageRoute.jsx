import React from "react";
import FieldComponent from "../components/common/Field";
import InfoCardComponent from "../components/common/InfoCard";
import AppShellComponent from "../components/layout/AppShell";
import SponsorshipLinkIcon from "../components/layout/SponsorshipLinkIcon";
import ProfilePageComponent from "../components/profile/ProfilePage";
import ThemeControl from "../components/theme/ThemeControl";
import { api, extractError } from "../lib/api";
import { copyTextToClipboard } from "../lib/browserDavUtils";

function AppShell({ auth, theme, children }) {
  return (
    <AppShellComponent
      auth={auth}
      theme={theme}
      api={api}
      ThemeControl={ThemeControl}
      SponsorshipLinkIcon={SponsorshipLinkIcon}
    >
      {children}
    </AppShellComponent>
  );
}

function InfoCard({ title, value, helper, copyable = false }) {
  return (
    <InfoCardComponent
      title={title}
      value={value}
      helper={helper}
      copyable={copyable}
      copyTextToClipboard={copyTextToClipboard}
    />
  );
}

function Field({ label, children }) {
  return <FieldComponent label={label}>{children}</FieldComponent>;
}

export default function ProfilePageRoute({ auth, theme }) {
  return (
    <ProfilePageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      InfoCard={InfoCard}
      Field={Field}
      copyTextToClipboard={copyTextToClipboard}
    />
  );
}
