"use client";

import { useState } from "react";
import type { RankedJob } from "@/lib/models";

interface Group {
  id: string;
  roles: RankedJob[];
}

interface ReviewOrder {
  scope: string;
  input: string;
  companies: string[];
  roles: Record<string, string[]>;
}

/** Keep absent identities until the review ends, so Undo recovers its place. */
function remember(
  groups: Group[],
  scope: string,
  input: string,
  previous?: ReviewOrder,
): ReviewOrder {
  const companies = [...(previous?.companies ?? [])];
  const roles = { ...previous?.roles };
  for (const group of groups) {
    if (!companies.includes(group.id)) companies.push(group.id);
    const ids = new Set(roles[group.id]);
    group.roles.forEach(({ job }) => ids.add(job.id));
    roles[group.id] = [...ids];
  }
  return { scope, input, companies, roles };
}

export function useReviewOrder<T extends Group>(
  groups: T[],
  scope: string,
): T[] {
  const input = JSON.stringify(
    groups.map(({ id, roles }) => [id, roles.map(({ job }) => job.id)]),
  );
  const [stored, setStored] = useState(() => remember(groups, scope, input));
  let order = stored;
  if (stored.scope !== scope || stored.input !== input) {
    order = remember(
      groups,
      scope,
      input,
      stored.scope === scope ? stored : undefined,
    );
    // Derive the order before committing children; an effect would briefly
    // expose the refreshed ranking and move focus to the wrong neighbour.
    setStored(order);
  }
  const byId = new Map(groups.map((group) => [group.id, group]));
  return order.companies.flatMap((id) => {
    const group = byId.get(id);
    if (!group) return [];
    const rows = new Map(group.roles.map((row) => [row.job.id, row]));
    return [
      { ...group, roles: order.roles[id].flatMap((id) => rows.get(id) ?? []) },
    ];
  });
}
