import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DraftProvider, useDraft } from "@/components/unsaved";
import type { Fact, Job } from "@/lib/models";
import { requirementEvidence } from "./discovery";
import { OpportunityCareerEvidence as EvidenceSection } from "./opportunity-career-evidence";

const job: Job = {
  id: "job-1",
  title: "Site Reliability Engineer",
  employer: "Fictional Studio",
  requirements: ["Kubernetes", "PostgreSQL"],
};

function OpportunityCareerEvidence({
  facts,
  evidence,
  ...props
}: Omit<ComponentProps<typeof EvidenceSection>, "rows"> & {
  facts: Fact[];
  evidence: unknown;
}) {
  const rows = requirementEvidence(
    props.assessmentAvailable ? evidence : undefined,
    facts,
    props.job,
  );
  return <EvidenceSection {...props} rows={rows} />;
}

function requirementRow(requirement: string) {
  return within(
    screen
      .getByText(requirement, { selector: "strong" })
      .closest(".discover-evidence-row")!,
  );
}

it("shows the saved career skill for a job opened without a profile assessment", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  const props = {
    job,
    facts: [] as Fact[],
    evidence: undefined,
    assessmentAvailable: false,
    onAddEvidence: save,
  };
  const view = render(<OpportunityCareerEvidence {...props} />);
  const row = requirementRow("Kubernetes");
  await user.click(row.getByRole("button", { name: /I have this skill/ }));
  expect(save).toHaveBeenCalledExactlyOnceWith("Kubernetes", "");
  view.rerender(
    <OpportunityCareerEvidence
      {...props}
      job={{
        ...job,
        requirement_evidence: { Kubernetes: { fact_ids: ["skill-1"] } },
      }}
      facts={[
        {
          id: "skill-1",
          text: "Kubernetes",
          category: "skill",
          confirmed: true,
          source: { name: "User confirmed skill" },
        },
      ]}
    />,
  );
  expect(row.getByRole("listitem")).toHaveTextContent("Kubernetes");
  expect(row.getByText("Source: User confirmed skill")).toBeVisible();
  expect(
    row.queryByRole("button", { name: /I have this skill/ }),
  ).not.toBeInTheDocument();
  expect(
    row.getByRole("button", { name: "Add evidence for Kubernetes" }),
  ).toHaveFocus();
  expect(
    row.queryByText("No confirmed supporting evidence"),
  ).not.toBeInTheDocument();
  expect(
    requirementRow("PostgreSQL").getByText("No confirmed supporting evidence"),
  ).toBeVisible();
});

it("offers to add an earlier job-only confirmation to career evidence", async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <OpportunityCareerEvidence
      job={{
        ...job,
        requirement_evidence: { Kubernetes: { confirmed: true } },
      }}
      facts={[]}
      evidence={[]}
      assessmentAvailable
      onAddEvidence={save}
    />,
  );
  const row = requirementRow("Kubernetes");
  expect(row.getByText("Confirmed by you for this job.")).toBeVisible();
  await user.click(
    row.getByRole("button", {
      name: "Add skill to career evidence for Kubernetes",
    }),
  );
  expect(save).toHaveBeenCalledExactlyOnceWith("Kubernetes", "");
});

it("ticks a saved skill on another listing without needing a profile assessment", () => {
  const equivalent = "Hands-on experience with Kubernetes";
  const extraSkill = "Kubernetes and Terraform";
  render(
    <OpportunityCareerEvidence
      job={{
        ...job,
        requirements: [equivalent, extraSkill],
        requirement_evidence: { [equivalent]: { confirmed: true } },
        matched_skill_evidence: { [equivalent]: ["skill-1"] },
      }}
      facts={[
        {
          id: "skill-1",
          text: "Kubernetes",
          category: "skill",
          confirmed: true,
        },
      ]}
      evidence={undefined}
      assessmentAvailable={false}
      onAddEvidence={vi.fn()}
    />,
  );
  const row = requirementRow(equivalent);
  expect(
    row.queryByRole("button", { name: /I have this skill/ }),
  ).not.toBeInTheDocument();
  expect(
    row.queryByRole("button", { name: /Add skill to career evidence/ }),
  ).not.toBeInTheDocument();
  expect(row.getByRole("listitem")).toHaveTextContent("Kubernetes");
  expect(row.queryByText("Verify the full requirement.")).toBeNull();
  expect(
    requirementRow(extraSkill).getByRole("button", {
      name: /I have this skill/,
    }),
  ).toBeVisible();
});

it("keeps a partial textual match neutral and allows an explicit skill confirmation", async () => {
  const requirement = "Kubernetes and Terraform";
  const save = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <OpportunityCareerEvidence
      job={{ ...job, requirements: [requirement] }}
      facts={[
        {
          id: "partial",
          text: "Deployed a Kubernetes service.",
          category: "experience",
          confirmed: true,
        },
      ]}
      evidence={[{ requirement, fact_ids: ["partial"] }]}
      assessmentAvailable
      onAddEvidence={save}
    />,
  );
  const row = requirementRow(requirement);
  expect(row.getByText("Verify the full requirement.")).toBeVisible();
  expect(view.container.querySelector(".discover-evidence-mark")).toHaveClass(
    "related",
  );
  await userEvent.click(row.getByRole("button", { name: /I have this skill/ }));
  expect(save).toHaveBeenCalledExactlyOnceWith(requirement, "");
});

it("keeps a failed example editable and guarded, then shows the saved example below the requirement", async () => {
  const user = userEvent.setup();
  const details = "Deployed and monitored a service on EKS.";
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("The workspace could not be saved."))
    .mockResolvedValueOnce(undefined);
  const props = {
    job,
    facts: [] as Fact[],
    evidence: [],
    assessmentAvailable: true,
    onAddEvidence: save,
  };
  function LeaveDetails() {
    const { canLeave } = useDraft();
    return <button onClick={() => canLeave()}>Leave details</button>;
  }
  const content = (next = props) => (
    <DraftProvider>
      <OpportunityCareerEvidence {...next} />
      <LeaveDetails />
    </DraftProvider>
  );
  const view = render(content());
  const row = requirementRow("Kubernetes");
  await user.click(
    row.getByRole("button", { name: "Add evidence for Kubernetes" }),
  );
  const input = row.getByRole("textbox", {
    name: "Supporting example for Kubernetes",
  });
  expect(input).toHaveFocus();
  await user.type(input, details);
  await user.click(row.getByRole("button", { name: "Save evidence" }));
  expect(await row.findByRole("alert")).toHaveTextContent(
    "The workspace could not be saved.",
  );
  expect(input).toHaveValue(details);
  expect(row.getByText("No confirmed supporting evidence")).toBeVisible();

  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  try {
    await user.click(screen.getByRole("button", { name: "Leave details" }));
    expect(confirm).toHaveBeenCalledOnce();
    await user.click(row.getByRole("button", { name: "Save evidence" }));
    expect(save.mock.calls).toEqual([
      ["Kubernetes", details],
      ["Kubernetes", details],
    ]);
    view.rerender(
      content({
        ...props,
        job: {
          ...job,
          requirement_evidence: { Kubernetes: { fact_ids: ["fact-1"] } },
        },
        facts: [{ id: "fact-1", text: details, confirmed: true }],
      }),
    );
    expect(row.getByText(details)).toBeVisible();
    expect(row.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      row.getByRole("button", { name: "Add evidence for Kubernetes" }),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Leave details" }));
    expect(confirm).toHaveBeenCalledOnce();
  } finally {
    confirm.mockRestore();
  }
});

it("omits retired evidence, stale requirements and duplicate ranked facts", () => {
  render(
    <OpportunityCareerEvidence
      job={{
        ...job,
        requirement_evidence: {
          Kubernetes: { fact_ids: ["fact-1", "fact-1"] },
          PostgreSQL: { fact_ids: ["retired"] },
          "Old skill": { confirmed: true },
        },
      }}
      facts={[
        { id: "fact-1", text: "A reusable example", confirmed: true },
        {
          id: "retired",
          text: "Retired example",
          confirmed: true,
          retired: true,
        },
      ]}
      evidence={[
        { requirement: "Kubernetes", fact_ids: ["fact-1"] },
        { requirement: "Old skill", fact_ids: ["fact-1"] },
      ]}
      assessmentAvailable
    />,
  );
  expect(screen.getByText("A reusable example")).toBeVisible();
  expect(screen.queryByText("Retired example")).not.toBeInTheDocument();
  expect(screen.queryByText("Old skill")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Add evidence/ }),
  ).not.toBeInTheDocument();
  expect(
    requirementRow("PostgreSQL").getByText("No confirmed supporting evidence"),
  ).toBeVisible();
});
