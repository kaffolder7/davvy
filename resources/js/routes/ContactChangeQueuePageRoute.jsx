import React from "react";
import ContactChangeQueuePageComponent from "../components/queue/ContactChangeQueuePage";
import FullPageState from "../components/common/FullPageState";
import AppShellComponent from "../components/layout/AppShell";
import SponsorshipLinkIcon from "../components/layout/SponsorshipLinkIcon";
import ThemeControl from "../components/theme/ThemeControl";
import { api, extractError } from "../lib/api";

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

export default function ContactChangeQueuePageRoute({ auth, theme }) {
  return (
    <ContactChangeQueuePageComponent
      auth={auth}
      theme={theme}
      api={api}
      extractError={extractError}
      AppShell={AppShell}
      FullPageState={FullPageState}
    />
  );
}
