"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: Theme;
  setTheme: (next: Theme) => void;
}

const STORAGE_KEY = "theme";
const TRANSITION_CLASS = "theme-transition";
const TRANSITION_MS = 320;

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  resolvedTheme: "light",
  setTheme: () => {},
});

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => {
    finished: Promise<void>;
  };
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch {
      // ignore storage errors
    }
    return document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
  });

  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (
        e.key === STORAGE_KEY &&
        (e.newValue === "light" || e.newValue === "dark")
      ) {
        setThemeState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion || typeof document === "undefined") {
      applyThemeToDom(next);
      setThemeState(next);
      return;
    }

    const doc = document as DocumentWithViewTransition;
    if (typeof doc.startViewTransition === "function") {
      try {
        const vt = doc.startViewTransition(() => {
          flushSync(() => {
            setThemeState(next);
          });
          applyThemeToDom(next);
        });
        vt?.finished?.catch(() => {});
        return;
      } catch {
        // Fall through to CSS transition fallback if view transition fails
      }
    }

    const root = document.documentElement;
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }
    root.classList.add(TRANSITION_CLASS);
    void root.offsetWidth;
    applyThemeToDom(next);
    setThemeState(next);
    transitionTimerRef.current = window.setTimeout(() => {
      root.classList.remove(TRANSITION_CLASS);
      transitionTimerRef.current = null;
    }, TRANSITION_MS);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme: theme, setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
