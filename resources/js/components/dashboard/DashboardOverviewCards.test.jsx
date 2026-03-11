import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardOverviewCards from "./DashboardOverviewCards";

function InfoCardStub({ title, value, helper }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{value}</p>
      <p>{helper}</p>
    </article>
  );
}

describe("DashboardOverviewCards", () => {
  it("renders endpoint, principal, and role cards", () => {
    render(
      <DashboardOverviewCards
        auth={{ user: { id: 42, role: "admin" } }}
        InfoCard={InfoCardStub}
      />,
    );

    expect(screen.getByText("DAV Endpoint")).toBeInTheDocument();
    expect(screen.getByText("Principal")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("principals/42")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByText(/\/dav$/)).toBeInTheDocument();
  });
});
