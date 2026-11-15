import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, ThemeMode, darkColors, getColors } from '../components/common/Theme';

const STORAGE_KEY = '@pref_theme_mode';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  colors: darkColors,
  isDark: true,
  setMode: () => {},
  toggleMode: () => {},
});

/**
 * Provee el tema visual (Oscuro alto contraste / Claro cálido) y lo persiste
 * en AsyncStorage. Solo afecta a la presentación; no toca datos financieros.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark') setModeState(saved);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: getColors(mode), isDark: mode === 'dark', setMode, toggleMode }),
    [mode, setMode, toggleMode]
  );

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: darkColors.background }} />;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = (): ThemeContextValue => useContext(ThemeContext);

