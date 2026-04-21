import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type ChartTheme = "light" | "dark";

interface ThemeContextValue {
  darkMode: boolean;
  chartTheme: ChartTheme;
  setDarkMode: (value: boolean) => void;
  toggleDarkMode: () => void;
}

const STORAGE_KEY = "fx2-dark-mode";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem(STORAGE_KEY);

    if (storedValue === null) {
      return;
    }

    setDarkMode(storedValue === "true");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    document.documentElement.classList.toggle("dark", darkMode);
    window.localStorage.setItem(STORAGE_KEY, String(darkMode));
  }, [darkMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      darkMode,
      chartTheme: darkMode ? "dark" : "light",
      setDarkMode,
      toggleDarkMode: () => setDarkMode((current) => !current),
    }),
    [darkMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useFx2Theme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useFx2Theme must be used within ThemeProvider");
  }

  return context;
}
