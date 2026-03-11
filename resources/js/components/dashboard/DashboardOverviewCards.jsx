import React from "react";

export default function DashboardOverviewCards({ auth, InfoCard }) {
  return (
    <section className="fade-up grid gap-4 md:grid-cols-3">
      <InfoCard
        title="DAV Endpoint"
        value={`${window.location.origin}/dav`}
        helper="Use this URL in client connection settings."
        copyable
      />
      <InfoCard
        title="Principal"
        value={`principals/${auth.user.id}`}
        helper="Autodiscovery may resolve this automatically."
      />
      <InfoCard
        title="Role"
        value={auth.user.role.toUpperCase()}
        helper="Admins can manage users and cross-user sharing."
      />
    </section>
  );
}
