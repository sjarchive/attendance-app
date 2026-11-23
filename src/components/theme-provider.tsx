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
const SWITCHING_CLASS = "theme-switching";

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

  const transitionIdRef = useRef(0);

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
      document.documentElement.classList.remove(SWITCHING_CLASS);
    };
  }, []);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }

    if (typeof document === "undefined") {
      setThemeState(next);
      return;
    }

    const root = document.documentElement;
    transitionIdRef.current += 1;
    const transitionId = transitionIdRef.current;

    const cleanup = () => {
      if (transitionIdRef.current === transitionId) {
        root.classList.remove(SWITCHING_CLASS);
      }
    };

    // Freeze all per-element CSS transitions before mutating theme classes so
    // every element snaps to its new theme together instead of lagging individually.
    root.classList.add(SWITCHING_CLASS);
    void root.offsetHeight;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const doc = document as DocumentWithViewTransition;
    if (!prefersReducedMotion && typeof doc.startViewTransition === "function") {
      try {
        const vt = doc.startViewTransition(() => {
          applyThemeToDom(next);
          flushSync(() => {
            setThemeState(next);
          });
          void root.offsetHeight;
        });
        vt.finished.then(cleanup, cleanup);
        return;
      } catch {
        // Fall through to atomic single-frame switch if view transition fails
      }
    }

    applyThemeToDom(next);
    flushSync(() => {
      setThemeState(next);
    });
    void root.offsetHeight;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(cleanup);
    });
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
