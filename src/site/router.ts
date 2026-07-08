/**
 * Tiny hash router — no dependency, works on GitHub Pages under any base path
 * (hash routing needs no server rewrites).
 */

import { useEffect, useState } from "react";

export function useHashRoute(): string {
  const [hash, setHash] = useState(() => normalize(window.location.hash));
  useEffect(() => {
    const onChange = () => setHash(normalize(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function normalize(h: string): string {
  const s = h.replace(/^#/, "");
  return s === "" ? "/" : s;
}

export function navigate(route: string): void {
  window.location.hash = route;
}

const PLAYGROUND_KEY = "edd:playground-source";

/** Stash a snippet and jump to the playground. */
export function openInPlayground(source: string): void {
  try {
    sessionStorage.setItem(PLAYGROUND_KEY, source);
  } catch {
    /* ignore */
  }
  navigate("/playground");
}

export function takePlaygroundSource(): string | null {
  try {
    const s = sessionStorage.getItem(PLAYGROUND_KEY);
    if (s) sessionStorage.removeItem(PLAYGROUND_KEY);
    return s;
  } catch {
    return null;
  }
}
