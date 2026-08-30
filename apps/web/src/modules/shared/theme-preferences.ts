import { normalizeAppTheme } from './app-theme.ts';
import type { AppTheme, SelectableAppTheme } from './app-theme.ts';

const themeStorageKey = 'app-theme-override';
const darkStorageKey = 'app-dark-override';
export const themeChangeEvent = 'doce-horizonte:theme-change';

export type ThemePreference = {
  appTheme: SelectableAppTheme;
  darkMode: boolean;
};

export const getSavedThemePreference = (): ThemePreference | null => {
  if (typeof window === 'undefined') return null;
  const theme = window.localStorage.getItem(themeStorageKey);
  const darkMode = window.localStorage.getItem(darkStorageKey);
  if (theme === null && darkMode === null) return null;
  return { appTheme: normalizeAppTheme(theme), darkMode: darkMode === 'true' };
};

export const applyThemePreference = (preference: { appTheme?: AppTheme | string | null; darkMode?: boolean }, persist = false) => {
  if (typeof window === 'undefined') return;
  const next: ThemePreference = {
    appTheme: normalizeAppTheme(preference.appTheme),
    darkMode: Boolean(preference.darkMode)
  };
  document.documentElement.setAttribute('data-theme', next.appTheme);
  document.documentElement.setAttribute('data-dark', next.darkMode ? 'true' : 'false');
  if (persist) {
    window.localStorage.setItem(themeStorageKey, next.appTheme);
    window.localStorage.setItem(darkStorageKey, String(next.darkMode));
  }
  window.dispatchEvent(new CustomEvent<ThemePreference>(themeChangeEvent, { detail: next }));
  return next;
};
