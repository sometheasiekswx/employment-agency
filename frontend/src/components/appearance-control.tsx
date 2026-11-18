"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { appearanceLabels, type Appearance } from "@/lib/appearance";
import { useAppearance } from "./appearance";
import styles from "./appearance-control.module.css";

const icons = { dark: Moon, light: Sun, system: Monitor };
const nextAppearance: Record<Appearance, Appearance> = {
  dark: "light",
  light: "system",
  system: "dark",
};

export function AppearanceControl() {
  const { appearance, setAppearance } = useAppearance();
  const [feedback, setFeedback] = useState<Appearance | null>(null);
  const next = nextAppearance[appearance];
  const label = `Color theme: ${appearanceLabels[appearance]}. Switch to ${appearanceLabels[next]}`;
  const Icon = icons[appearance];
  useEffect(() => {
    if (feedback === null) return;
    const timeout = window.setTimeout(() => setFeedback(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  return (
    <div className={styles.area}>
      <button
        type="button"
        className={styles.control}
        aria-label={label}
        title={label}
        onClick={() => {
          setAppearance(next);
          setFeedback(next);
        }}
      >
        <Icon aria-hidden="true" />
      </button>
      <span
        className={feedback ? styles.status : "visually-hidden"}
        role="status"
      >
        {feedback && `${appearanceLabels[feedback]} theme`}
      </span>
    </div>
  );
}
