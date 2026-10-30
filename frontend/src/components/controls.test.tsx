import { expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Action, Field, Form } from "./controls";

it("retains draft input after a failed save and allows retry", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("Workspace is locked"))
    .mockResolvedValueOnce(undefined);
  render(
    <Form onSave={save}>
      <Field label="Example name" name="name" />
      <button>Save</button>
    </Form>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Example name"), "A careful draft");
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Workspace is locked",
  );
  expect(screen.getByLabelText("Example name")).toHaveValue("A careful draft");
  await user.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});

it("disables an action while pending even if the caller passed disabled=false", async () => {
  let finish!: () => void;
  const run = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <Action disabled={false} run={run}>
      Prepare
    </Action>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Prepare" }));
  expect(screen.getByRole("button", { name: "Working…" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Working…" }));
  expect(run).toHaveBeenCalledTimes(1);
  finish();
  expect(await screen.findByRole("button", { name: "Prepare" })).toBeEnabled();
});
