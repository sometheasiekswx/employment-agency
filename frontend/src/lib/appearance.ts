export const appearanceOptions = [
  ["dark", "Dark"],
  ["light", "Light"],
  ["system", "System"],
] as const;

export type Appearance = (typeof appearanceOptions)[number][0];

export const defaultAppearance: Appearance = "dark";
export const appearanceStorageKey = "employment-agency:appearance";
export const darkAppearanceQuery = "(prefers-color-scheme: dark)";

const appearanceValues = appearanceOptions.map(([value]) => value);

export function isAppearance(
  value: string | null | undefined,
): value is Appearance {
  return appearanceValues.some((appearance) => appearance === value);
}

// Run in the document head so the first paint honors a saved preference.
// All interpolated values are build-time constants. Each server hashes the
// exact exported script when generating its Content Security Policy.
export const appearanceBootstrap = `(() => {
  let appearance = ${JSON.stringify(defaultAppearance)};
  try {
    const saved = localStorage.getItem(${JSON.stringify(appearanceStorageKey)});
    if (${JSON.stringify(appearanceValues)}.includes(saved)) appearance = saved;
  } catch {}
  const system = window.matchMedia?.(${JSON.stringify(darkAppearanceQuery)});
  const root = document.documentElement;
  root.dataset.appearance = appearance;
  root.dataset.theme = appearance === "system"
    ? (system?.matches === false ? "light" : "dark")
    : appearance;
})();`;
