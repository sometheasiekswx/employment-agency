import { expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RankedJob } from "@/lib/models";
import { useReviewOrder } from "./use-review-order";

const group = (id: string, ids: string[]) => ({
  id,
  roles: ids.map(
    (id) => ({ job: { id, title: id, employer: "Fictional" } }) as RankedJob,
  ),
});
const ids = (groups: ReturnType<typeof group>[]) =>
  groups.map(({ id, roles }) => [id, roles.map(({ job }) => job.id)]);

it("keeps surviving companies and roles in place through reranking, arrivals, removal and Undo", () => {
  const { result, rerender } = renderHook(
    ({ groups, scope }) => useReviewOrder(groups, scope),
    {
      initialProps: {
        groups: [group("a", ["a1", "a2"]), group("b", ["b1"])],
        scope: "jobs",
      },
    },
  );
  rerender({
    groups: [group("c", ["c1"]), group("b", ["b1"]), group("a", ["a3", "a2"])],
    scope: "jobs",
  });
  expect(ids(result.current)).toEqual([
    ["a", ["a2", "a3"]],
    ["b", ["b1"]],
    ["c", ["c1"]],
  ]);
  rerender({ groups: [group("c", ["c1"]), group("b", ["b1"])], scope: "jobs" });
  expect(ids(result.current)).toEqual([
    ["b", ["b1"]],
    ["c", ["c1"]],
  ]);
  rerender({
    groups: [
      group("b", ["b1"]),
      group("a", ["a3", "a2", "a1"]),
      group("c", ["c1"]),
    ],
    scope: "jobs",
  });
  expect(ids(result.current)).toEqual([
    ["a", ["a1", "a2", "a3"]],
    ["b", ["b1"]],
    ["c", ["c1"]],
  ]);
});

it("uses current ranking at an explicit reset and always renders current role data", () => {
  const { result, rerender } = renderHook(
    ({ groups, scope }) => useReviewOrder(groups, scope),
    {
      initialProps: {
        groups: [group("a", ["a1"]), group("b", ["b1"])],
        scope: "first",
      },
    },
  );
  const updated = group("a", ["a1"]);
  updated.roles[0].job.title = "Updated evidence";
  rerender({ groups: [group("b", ["b1"]), updated], scope: "refresh" });
  expect(ids(result.current)).toEqual([
    ["b", ["b1"]],
    ["a", ["a1"]],
  ]);
  expect(result.current[1].roles[0].job.title).toBe("Updated evidence");
});
