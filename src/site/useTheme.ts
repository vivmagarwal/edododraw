/**
 * useResolvedTheme — the site's single source of truth for the *effective*
 * light/dark theme. It mirrors what the playground writes: `data-theme` on
 * <html> (system | light | dark) plus the OS preference. Embedded demos use it
 * so gallery/hero canvases follow the same theme as the surrounding chrome.
 */

import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";

function readPref(): ThemePref {
  const v = typeof document !== "undefined" ? document.documentElement.dataset.theme : undefined;
  return v === "light" || v === "dark" ? v : "system";
}
function prefersDark(): boolean {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}
function resolve(pref: ThemePref, systemDark: boolean): "light" | "dark" {
  return pref === "system" ? (systemDark ? "dark" : "light") : pref;
}

export function useResolvedTheme(): "light" | "dark" {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);

  useEffect(() => {
    // React to the playground toggle flipping data-theme on <html>…
    const mo = new MutationObserver(() => setPref(readPref()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    // …and to the OS theme changing while in "system".
    const mq = typeof matchMedia !== "undefined" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const onMq = () => setSystemDark(!!mq?.matches);
    mq?.addEventListener?.("change", onMq);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);

  return resolve(pref, systemDark);
}
