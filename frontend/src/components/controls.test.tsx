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

it("retains an icon action's content, name and busy semantics through failure and retry", async () => {
  let fail!: (error: Error) => void;
  const run = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValueOnce(undefined);
  render(
    <Action aria-label="Save opportunity" keepContentWhileBusy run={run}>
      <svg data-testid="bookmark" aria-hidden="true" />
    </Action>,
  );
  const button = screen.getByRole("button", { name: "Save opportunity" });
  await userEvent.click(button);
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toBeDisabled();
  expect(screen.getByTestId("bookmark")).toBeInTheDocument();
  await userEvent.click(button);
  expect(run).toHaveBeenCalledTimes(1);
  fail(new Error("Save failed; retry."));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Save failed; retry.",
  );
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute("aria-busy", "false");
  await userEvent.click(button);
  await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
});
