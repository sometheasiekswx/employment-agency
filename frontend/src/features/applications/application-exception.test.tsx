import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { DraftProvider } from "@/components/unsaved";
import { ApiResponseError } from "@/lib/api";
import type { Job } from "@/lib/models";
import { ApplicationException } from "./application-exception";

const fixture = vi.hoisted(() => {
  const action = vi.fn();
  return { action, client: { action }, refresh: vi.fn(async () => {}) };
});

vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({
    client: fixture.client,
    profileId: "profile-a",
    refresh: fixture.refresh,
    state: { _workspace: { timezone: "UTC" }, jobs: [] },
  }),
}));

const listing: Job = {
  id: "role-a",
  employer: "Fictional Harbour Group",
  title: "Platform Engineer",
  url: "https://careers.example.test/platform",
  published_alias_proof: "a".repeat(64),
};
const refreshed = {
  ...listing,
  employer: "Fictional Harbour Company",
  published_alias_proof: "b".repeat(64),
};

const companies = {
  job_id: listing.id,
  employer: null,
  employers: [
    { id: "harbour", name: "Fictional Harbour", aliases: [] },
    { id: "other", name: "Fictional Other", aliases: [] },
  ],
  linked_listings: [],
  status: {},
};

beforeEach(() => {
  fixture.action.mockReset();
  fixture.refresh.mockReset();
  fixture.refresh.mockResolvedValue(undefined);
});

function open(publishedAlias?: string) {
  let company = {
    ...companies,
    published_alias: publishedAlias,
    published_alias_proof: publishedAlias ? listing.published_alias_proof : undefined,
  };
  fixture.action.mockImplementation(async (operation: string) => {
    if (operation === "company-roles") return company;
    if (operation === "company-map") return {};
    throw new Error(operation);
  });
  const onResolved = vi.fn(async () => {});
  const form = (job: Job) => (
    <DraftProvider>
      <ApplicationException
        job={job}
        mode="pending"
        blocker={{
          code: "employer_unresolved",
          message: "Confirm the hiring employer.",
        }}
        onResolved={onResolved}
      />
    </DraftProvider>
  );
  const view = render(form(publishedAlias ? listing : { ...listing, published_alias_proof: undefined }));
  return {
    onResolved,
    showListing: (job: Job) => view.rerender(form(job)),
    updateCompany: (job: Job) => {
      company = { ...companies, published_alias: job.employer, published_alias_proof: job.published_alias_proof };
    },
  };
}

it("records an explicit published alias and clears agreement when the selected employer changes", async () => {
  const { onResolved } = open(listing.employer);
  const user = userEvent.setup();
  const employer = await screen.findByRole("combobox", {
    name: "Hiring employer",
  });
  expect(screen.queryByRole("checkbox", { name: /verified alias/ })).toBeNull();
  await user.selectOptions(employer, "harbour");
  const first = screen.getByRole("checkbox", {
    name: /published hiring name “Fictional Harbour Group” is a verified alias of Fictional Harbour/,
  });
  expect(first).not.toBeChecked();
  await user.click(first);
  expect(first).toBeChecked();
  await user.selectOptions(employer, "other");
  expect(
    screen.getByRole("checkbox", { name: /verified alias of Fictional Other/ }),
  ).not.toBeChecked();
  await user.selectOptions(employer, "harbour");
  const returned = screen.getByRole("checkbox", {
    name: /verified alias of Fictional Harbour/,
  });
  expect(returned).not.toBeChecked();
  await user.click(returned);
  await user.click(screen.getByRole("button", { name: "Confirm employer" }));
  await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
  expect(fixture.action).toHaveBeenCalledWith(
    "company-map",
    expect.objectContaining({
      job_id: listing.id,
      confirmed: true,
      employer_id: "harbour",
      record_alias: true,
      published_alias: listing.employer,
      published_alias_proof: listing.published_alias_proof,
    }),
  );
});

it.each([undefined, listing.employer])(
  "maps an employer without adding an alias unless the user confirms it (%s)",
  async (publishedAlias) => {
    const { onResolved } = open(publishedAlias);
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Hiring employer" }),
      "harbour",
    );
    const alias = screen.queryByRole("checkbox", { name: /verified alias/ });
    if (publishedAlias) expect(alias).not.toBeChecked();
    else expect(alias).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm employer" }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
    expect(fixture.action).toHaveBeenCalledWith(
      "company-map",
      expect.objectContaining({
        job_id: listing.id,
        confirmed: true,
        employer_id: "harbour",
        record_alias: false,
      }),
    );
    const data = fixture.action.mock.calls.find(([operation]) => operation === "company-map")?.[1];
    expect(data).not.toHaveProperty("published_alias");
    expect(data).not.toHaveProperty("published_alias_proof");
  },
);

it("loads the new proof for an updated listing without carrying over consent or losing other input", async () => {
  const { onResolved, showListing, updateCompany } = open(listing.employer);
  const user = userEvent.setup();
  const employer = await screen.findByRole("combobox", { name: "Hiring employer" });
  await user.selectOptions(employer, "harbour");
  await user.click(screen.getByRole("checkbox", { name: /Fictional Harbour Group/ }));
  await user.type(screen.getByRole("textbox", { name: "Requisition ID (optional)" }), "REQ-19");
  updateCompany(refreshed);
  showListing(refreshed);

  const latest = await screen.findByRole("checkbox", { name: /Fictional Harbour Company/ });
  expect(latest).not.toBeChecked();
  expect(screen.queryByRole("checkbox", { name: /Fictional Harbour Group/ })).toBeNull();
  expect(employer).toHaveValue("harbour");
  expect(screen.getByRole("textbox", { name: "Requisition ID (optional)" })).toHaveValue("REQ-19");
  await user.click(latest);
  await user.click(screen.getByRole("button", { name: "Confirm employer" }));
  await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
  expect(fixture.action).toHaveBeenCalledWith(
    "company-map",
    expect.objectContaining({
      job_id: listing.id,
      employer_id: "harbour",
      published_alias: refreshed.employer,
      published_alias_proof: refreshed.published_alias_proof,
      requisition: "REQ-19",
    }),
  );
});

it("submits only the reviewed proof and reloads after a stale confirmation is refused", async () => {
  const { onResolved, showListing, updateCompany } = open(listing.employer);
  const user = userEvent.setup();
  const employer = await screen.findByRole("combobox", { name: "Hiring employer" });
  await user.selectOptions(employer, "harbour");
  await user.click(screen.getByRole("checkbox", { name: /Fictional Harbour Group/ }));
  await user.type(screen.getByRole("textbox", { name: "Requisition ID (optional)" }), "REQ-19");
  updateCompany(refreshed);
  fixture.action.mockRejectedValueOnce(
    new ApiResponseError("Review the current published hiring employer.", 409, "employer_alias_changed", listing.id),
  );
  fixture.refresh.mockImplementationOnce(async () => showListing(refreshed));
  await user.click(screen.getByRole("button", { name: "Confirm employer" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Review the current published hiring employer.");
  expect(fixture.action).toHaveBeenCalledWith(
    "company-map",
    expect.objectContaining({
      job_id: listing.id,
      employer_id: "harbour",
      published_alias: listing.employer,
      published_alias_proof: listing.published_alias_proof,
    }),
  );
  expect(fixture.refresh).toHaveBeenCalledOnce();
  expect(await screen.findByRole("checkbox", { name: /Fictional Harbour Company/ })).not.toBeChecked();
  expect(employer).toHaveValue("harbour");
  expect(screen.getByRole("textbox", { name: "Requisition ID (optional)" })).toHaveValue("REQ-19");
  expect(onResolved).not.toHaveBeenCalled();
});
