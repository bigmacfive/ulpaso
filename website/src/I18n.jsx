import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SITE_COPY } from "./siteCopy.js";

const STORAGE_KEY = "ulpaso-locale";
const SUPPORTED = ["en", "ko", "ja"];
const LABELS = { en: "English", ko: "한국어", ja: "日本語" };
const I18nContext = createContext(null);

function detectLocale() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (SUPPORTED.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }

  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const language of languages) {
    const base = String(language || "").toLowerCase().split("-")[0];
    if (SUPPORTED.includes(base)) return base;
  }
  return "en";
}

function readPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(detectLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (!SUPPORTED.includes(next)) return;
    setLocaleState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* no-op */ }
  }, []);

  const t = useCallback((path) => readPath(SITE_COPY[locale], path) ?? readPath(SITE_COPY.en, path) ?? path, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t, labels: LABELS, supported: SUPPORTED }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
