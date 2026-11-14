import { expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Action, Field, Form } from "./controls";
import { DraftProvider } from "./unsaved";

it("keeps a form draft after a connection failure and retries with the same values", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(undefined);
  render(
    <DraftProvider>
      <Form onSave={save}>
        <Field label="Activity comment" name="comment" />
        <button>Save comment</button>
      </Form>
    </DraftProvider>,
  );
  await userEvent.type(
    screen.getByLabelText("Activity comment"),
    "Checked both documents.",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
  const error = await screen.findByRole("alert");
  expect(error).toHaveTextContent(
    "Your unsaved input is still in this form. Cannot connect to the app. Check your connection and that the app is running, then try again.",
  );
  expect(error).toHaveFocus();
  expect(screen.getByLabelText("Activity comment")).toHaveValue(
    "Checked both documents.",
  );
  const failedUnload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, failedUnload);
  expect(failedUnload.defaultPrevented).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Save comment" }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(
    save.mock.calls.map(([data]) => (data as FormData).get("comment")),
  ).toEqual(["Checked both documents.", "Checked both documents."]);
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  const savedUnload = new Event("beforeunload", { cancelable: true });
  fireEvent(window, savedUnload);
  expect(savedUnload.defaultPrevented).toBe(false);
});

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
