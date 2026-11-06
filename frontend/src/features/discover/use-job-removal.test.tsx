import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "@/lib/api";
import { currentRemoval } from "@/lib/job-removal";
import type {
  Job,
  JobRemoval,
  JobRemovalResult,
  RequestData,
} from "@/lib/models";
import { useJobRemoval } from "./use-job-removal";

const alpha: Job = {
  id: "a".repeat(24),
  title: "Cloud Engineer",
  employer: "Fictional Alpha",
  saved: true,
};
const beta: Job = {
  id: "b".repeat(24),
  title: "Software Engineer",
  employer: "Fictional Beta",
};
const event: JobRemoval = {
  id: "1".repeat(32),
  at: "2026-11-07T01:00:00Z",
  reason: "",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(jobs = [alpha, beta]) {
  const requests: {
    action: string;
    data: RequestData;
    pending: ReturnType<typeof deferred<JobRemovalResult>>;
  }[] = [];
  const client = new ApiClient(false);
  const action = vi
    .spyOn(client, "action")
    .mockImplementation((action, data = {}) => {
      const pending = deferred<JobRemovalResult>();
      requests.push({ action, data, pending });
      return pending.promise;
    });
  const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const hook = renderHook(
    ({ jobs }) => useJobRemoval({ jobs, client, refresh }),
    { initialProps: { jobs } },
  );
  return { ...hook, requests, action, refresh };
}

function receipt(
  data: RequestData,
  extra: Partial<JobRemoval> = {},
): JobRemovalResult {
  return {
    id: data.id as string,
    removals: [{ ...event, id: data.removal_id as string, ...extra }],
  };
}

describe("opportunity removal controller", () => {
  it("serializes immediate Undo behind removal and binds both requests to one event", async () => {
    const { result, requests } = setup();
    let remove!: Promise<boolean>;
    await act(async () => {
      remove = result.current.remove(alpha);
    });
    const optimistic = result.current.jobWithRemoval(alpha);
    expect(currentRemoval(optimistic)?.id).toMatch(/^[a-f0-9]{32}$/);
    expect(optimistic.saved).toBe(true);
    expect(requests).toHaveLength(1);
    let undo!: Promise<boolean>;
    await act(async () => {
      undo = result.current.restore(optimistic);
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(alpha)),
    ).toBeUndefined();
    expect(requests).toHaveLength(1);
    await act(async () => {
      requests[0].pending.resolve(receipt(requests[0].data));
      expect(await remove).toBe(true);
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].action).toBe("remove-job");
    expect(requests[1]).toMatchObject({
      action: "restore-job",
      data: requests[0].data,
    });
    // The older remove receipt cannot overwrite the newer optimistic Undo.
    expect(
      currentRemoval(result.current.jobWithRemoval(alpha)),
    ).toBeUndefined();
    await act(async () => {
      requests[1].pending.resolve(
        receipt(requests[1].data, { restored_at: "2026-11-07T01:01:00Z" }),
      );
      expect(await undo).toBe(true);
    });
    expect(result.current.feedback).toMatchObject({
      job: { id: alpha.id },
      status: "restored",
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(alpha)),
    ).toBeUndefined();
  });

  it("retries an uncertain removal with the same operation ID", async () => {
    const { result, requests } = setup();
    let remove!: Promise<boolean>;
    await act(async () => {
      remove = result.current.remove(alpha);
    });
    await act(async () => {
      requests[0].pending.reject(new Error("Receipt was interrupted"));
      expect(await remove).toBe(false);
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(alpha)),
    ).toBeUndefined();
    expect(result.current.feedback).toMatchObject({
      status: "error",
      error: "Receipt was interrupted",
    });
    let retry!: Promise<boolean>;
    await act(async () => {
      retry = result.current.retry();
    });
    expect(requests[1]).toMatchObject({
      action: "remove-job",
      data: requests[0].data,
    });
    await act(async () => {
      requests[1].pending.resolve(receipt(requests[1].data));
      expect(await retry).toBe(true);
    });
    expect(currentRemoval(result.current.jobWithRemoval(alpha))?.id).toBe(
      requests[0].data.removal_id,
    );
    expect(result.current.feedback?.status).toBe("removed");
  });

  it("reports restored when a removal retry finds that its original event was already undone", async () => {
    const { result, requests, refresh } = setup();
    refresh.mockRejectedValue(new Error("Refresh is unavailable"));
    let remove!: Promise<boolean>;
    await act(async () => {
      remove = result.current.remove(alpha);
    });
    const originalData = requests[0].data;
    await act(async () => {
      requests[0].pending.reject(new Error("Removal response was lost"));
      expect(await remove).toBe(false);
    });
    let retry!: Promise<boolean>;
    await act(async () => {
      retry = result.current.retry();
    });
    expect(requests[1]).toMatchObject({
      action: "remove-job",
      data: originalData,
    });
    const restored = receipt(originalData, {
      restored_at: "2026-11-07T01:02:00Z",
    });
    await act(async () => {
      requests[1].pending.resolve(restored);
      expect(await retry).toBe(false);
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(alpha)),
    ).toBeUndefined();
    expect(result.current.jobWithRemoval(alpha).removals).toEqual(
      restored.removals,
    );
    expect(result.current.feedback).toMatchObject({
      job: { id: alpha.id },
      removalId: originalData.removal_id,
      status: "restored",
    });
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.data.removal_id)).toEqual([
      originalData.removal_id,
      originalData.removal_id,
    ]);
  });

  it("rolls back a failed job independently of another successful removal", async () => {
    const { result, requests } = setup();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = result.current.remove(alpha);
    });
    await act(async () => {
      second = result.current.remove(beta);
    });
    expect(requests).toHaveLength(2);
    await act(async () => {
      requests[1].pending.resolve(receipt(requests[1].data));
      expect(await second).toBe(true);
      requests[0].pending.reject(new Error("First role failed"));
      expect(await first).toBe(false);
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(alpha)),
    ).toBeUndefined();
    expect(currentRemoval(result.current.jobWithRemoval(beta))?.id).toBe(
      requests[1].data.removal_id,
    );
    expect(result.current.feedback).toMatchObject({
      job: { id: beta.id },
      status: "removed",
    });
  });

  it("keeps rapid different-job feedback and the reason editor bound to the latest event", async () => {
    const { result, requests } = setup();
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    await act(async () => {
      first = result.current.remove(alpha);
    });
    await act(async () => {
      second = result.current.remove(beta);
    });
    const secondEvent = currentRemoval(result.current.jobWithRemoval(beta))!;
    act(() => result.current.addReason(beta, secondEvent));
    act(() => result.current.changeReason("The second role's reason"));
    await act(async () => {
      requests[0].pending.resolve(receipt(requests[0].data));
      await first;
    });
    expect(result.current.feedback).toMatchObject({
      job: { id: beta.id },
      removalId: secondEvent.id,
      status: "removing",
    });
    expect(result.current.editor).toMatchObject({
      job: { id: beta.id },
      removalId: secondEvent.id,
      value: "The second role's reason",
    });
    await act(async () => {
      requests[1].pending.resolve(receipt(requests[1].data));
      await second;
    });
    expect(result.current.feedback).toMatchObject({
      job: { id: beta.id },
      removalId: secondEvent.id,
      status: "removed",
    });
  });

  it("retains removal and a failed reason draft, then retries only that reason", async () => {
    const removed = { ...alpha, removals: [event] };
    const { result, requests } = setup([removed]);
    act(() => result.current.addReason(removed, event));
    act(() => result.current.changeReason("Outside my preferred location"));
    let save!: Promise<void>;
    await act(async () => {
      save = result.current.saveReason();
    });
    expect(requests[0]).toMatchObject({
      action: "job-removal-reason",
      data: {
        id: alpha.id,
        removal_id: event.id,
        comment: "Outside my preferred location",
      },
    });
    await act(async () => {
      requests[0].pending.reject(new Error("Reason could not be saved"));
      await save;
    });
    expect(result.current.editor).toMatchObject({
      value: "Outside my preferred location",
      saving: false,
      saved: false,
      error: "Reason could not be saved",
    });
    expect(currentRemoval(result.current.jobWithRemoval(removed))?.id).toBe(
      event.id,
    );
    await act(async () => {
      save = result.current.saveReason();
    });
    expect(requests[1]).toMatchObject({
      action: "job-removal-reason",
      data: requests[0].data,
    });
    await act(async () => {
      requests[1].pending.resolve(
        receipt(requests[1].data, { reason: "Outside my preferred location" }),
      );
      await save;
    });
    expect(result.current.editor).toMatchObject({
      value: "Outside my preferred location",
      saving: false,
      saved: true,
      error: "",
    });
    expect(currentRemoval(result.current.jobWithRemoval(removed))?.reason).toBe(
      "Outside my preferred location",
    );
    expect(requests.map((request) => request.action)).toEqual([
      "job-removal-reason",
      "job-removal-reason",
    ]);
  });

  it("preserves newer edits while an earlier reason save is pending", async () => {
    const removed = { ...alpha, removals: [event] };
    const { result, requests } = setup([removed]);
    act(() => result.current.addReason(removed, event));
    act(() => result.current.changeReason("First saved text"));
    let save!: Promise<void>;
    await act(async () => {
      save = result.current.saveReason();
    });
    act(() => result.current.changeReason("Newer unfinished text"));
    await act(async () => {
      requests[0].pending.resolve(
        receipt(requests[0].data, { reason: "First saved text" }),
      );
      await save;
    });
    expect(result.current.editor).toMatchObject({
      value: "Newer unfinished text",
      saving: false,
      saved: false,
    });
    expect(currentRemoval(result.current.jobWithRemoval(removed))?.reason).toBe(
      "First saved text",
    );
    await act(async () => {
      save = result.current.saveReason();
    });
    expect(requests[1].data.comment).toBe("Newer unfinished text");
    await act(async () => {
      requests[1].pending.resolve(
        receipt(requests[1].data, { reason: "Newer unfinished text" }),
      );
      await save;
    });
    expect(result.current.editor).toMatchObject({
      value: "Newer unfinished text",
      saved: true,
    });
  });

  it("keeps each reason draft while browsing and closes without discarding text", () => {
    const first = { ...alpha, removals: [event] };
    const secondEvent = {
      ...event,
      id: "2".repeat(32),
      reason: "Previously saved",
    };
    const second = { ...beta, removals: [secondEvent] };
    const { result, action } = setup([first, second]);
    act(() => result.current.addReason(first, event));
    act(() => result.current.changeReason("Unfinished first draft"));
    act(() => result.current.closeReason());
    expect(result.current.editor).toBeUndefined();
    act(() => result.current.addReason(second, secondEvent));
    expect(result.current.editor?.value).toBe("Previously saved");
    act(() => result.current.changeReason("Unfinished second draft"));
    act(() => result.current.addReason(first, event));
    expect(result.current.editor).toMatchObject({
      job: { id: alpha.id },
      value: "Unfinished first draft",
    });
    act(() => result.current.addReason(second, secondEvent));
    expect(result.current.editor).toMatchObject({
      job: { id: beta.id },
      value: "Unfinished second draft",
    });
    expect(action).not.toHaveBeenCalled();
  });

  it("keeps a confirmed mutation committed when its following refresh fails", async () => {
    const { result, requests, refresh } = setup();
    refresh.mockRejectedValue(new Error("Refresh is unavailable"));
    let remove!: Promise<boolean>;
    await act(async () => {
      remove = result.current.remove(alpha);
    });
    await act(async () => {
      requests[0].pending.resolve(receipt(requests[0].data));
      expect(await remove).toBe(true);
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(currentRemoval(result.current.jobWithRemoval(alpha))?.id).toBe(
      requests[0].data.removal_id,
    );
    expect(result.current.feedback?.status).toBe("removed");
  });

  it("rolls back a failed Undo to the confirmed removal even when refresh fails", async () => {
    const { result, requests, refresh } = setup();
    refresh.mockRejectedValue(new Error("Refresh is unavailable"));
    let remove!: Promise<boolean>;
    let undo!: Promise<boolean>;
    await act(async () => {
      remove = result.current.remove(alpha);
    });
    const optimistic = result.current.jobWithRemoval(alpha);
    await act(async () => {
      undo = result.current.restore(optimistic);
    });
    await act(async () => {
      requests[0].pending.resolve(receipt(requests[0].data));
      expect(await remove).toBe(true);
    });
    expect(requests).toHaveLength(2);
    await act(async () => {
      requests[1].pending.reject(new Error("Undo failed"));
      expect(await undo).toBe(false);
    });
    expect(currentRemoval(result.current.jobWithRemoval(alpha))?.id).toBe(
      requests[0].data.removal_id,
    );
    expect(result.current.feedback).toMatchObject({
      status: "error",
      error: "Undo failed",
    });
  });

  it("rolls back to refreshed authoritative history rather than the initial workspace snapshot", async () => {
    const originallyRemoved = { ...alpha, removals: [event] };
    const { result, rerender, requests, refresh } = setup([originallyRemoved]);
    const refreshed = {
      ...alpha,
      removals: [{ ...event, restored_at: "2026-11-07T01:02:00Z" }],
    };
    // The normal provider refresh may observe a restoration made in another tab.
    rerender({ jobs: [refreshed] });
    expect(
      currentRemoval(result.current.jobWithRemoval(refreshed)),
    ).toBeUndefined();
    refresh.mockRejectedValue(new Error("Refresh is unavailable"));
    let remove!: Promise<boolean>;
    await act(async () => {
      remove = result.current.remove(refreshed);
    });
    await act(async () => {
      requests[0].pending.reject(new Error("Removal failed"));
      expect(await remove).toBe(false);
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(refreshed)),
    ).toBeUndefined();
    expect(result.current.jobWithRemoval(refreshed).removals).toEqual(
      refreshed.removals,
    );
  });

  it("retains a confirmed reason save when a later queued Undo fails", async () => {
    const removed = { ...alpha, removals: [event] };
    const { result, requests, refresh } = setup([removed]);
    refresh.mockRejectedValue(new Error("Refresh is unavailable"));
    act(() => result.current.addReason(removed, event));
    act(() => result.current.changeReason("Keep this confirmed reason"));
    let save!: Promise<void>;
    let undo!: Promise<boolean>;
    await act(async () => {
      save = result.current.saveReason();
    });
    await act(async () => {
      undo = result.current.restore(removed);
    });
    expect(requests).toHaveLength(1);
    await act(async () => {
      requests[0].pending.resolve(
        receipt(requests[0].data, { reason: "Keep this confirmed reason" }),
      );
      await save;
    });
    expect(requests).toHaveLength(2);
    await act(async () => {
      requests[1].pending.reject(new Error("Undo failed"));
      expect(await undo).toBe(false);
    });
    expect(
      currentRemoval(result.current.jobWithRemoval(removed)),
    ).toMatchObject({
      id: event.id,
      reason: "Keep this confirmed reason",
    });
    expect(result.current.editor).toMatchObject({
      value: "Keep this confirmed reason",
      saved: true,
    });
  });

  it("does not claim a stale Undo restored a newer active removal", async () => {
    const restored = { ...event, restored_at: "2026-11-07T01:01:00Z" };
    const newer = { ...event, id: "2".repeat(32) };
    const job = { ...alpha, removals: [restored, newer] };
    const { result, requests } = setup([job]);
    let undo!: Promise<boolean>;
    await act(async () => {
      undo = result.current.restore(job, event);
    });
    await act(async () => {
      requests[0].pending.resolve({
        id: alpha.id,
        removals: [restored, newer],
      });
      expect(await undo).toBe(false);
    });
    expect(currentRemoval(result.current.jobWithRemoval(job))?.id).toBe(
      newer.id,
    );
    expect(result.current.feedback).toMatchObject({
      status: "removed",
      removalId: newer.id,
    });
  });

  it("stops queued old-workspace requests on unmount without blocking a new workspace", async () => {
    const old = setup();
    let remove!: Promise<boolean>;
    let undo!: Promise<boolean>;
    await act(async () => {
      remove = old.result.current.remove(alpha);
    });
    await act(async () => {
      undo = old.result.current.restore(
        old.result.current.jobWithRemoval(alpha),
      );
    });
    expect(old.requests).toHaveLength(1);
    old.unmount();
    // WorkspaceProvider changes its keyed child when the workspace path changes.
    const next = setup();
    let newRemove!: Promise<boolean>;
    await act(async () => {
      newRemove = next.result.current.remove(alpha);
    });
    expect(next.requests).toHaveLength(1);
    expect(next.requests[0].data.removal_id).not.toBe(
      old.requests[0].data.removal_id,
    );
    await act(async () => {
      old.requests[0].pending.resolve(receipt(old.requests[0].data));
      expect(await remove).toBe(false);
      expect(await undo).toBe(false);
    });
    expect(old.requests).toHaveLength(1);
    expect(old.refresh).not.toHaveBeenCalled();
    expect(next.result.current.feedback).toMatchObject({
      job: { id: alpha.id },
      status: "removing",
    });
    await act(async () => {
      next.requests[0].pending.resolve(receipt(next.requests[0].data));
      expect(await newRemove).toBe(true);
    });
    expect(next.result.current.feedback?.status).toBe("removed");
  });
});
