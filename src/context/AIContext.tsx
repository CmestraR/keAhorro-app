import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeminiModelType } from '../utils/geminiService';

const AI_SETTINGS_STORAGE_KEY = 'keahorro_ai_settings_v1';

export interface AISettingsState {
  geminiApiKey: string;
  geminiModel: GeminiModelType;
  googleMapsApiKey: string;
  googleMapsEnabled: boolean;
  voiceHoldEnabled: boolean;
  autoCategorizeEnabled: boolean;
}

const DEFAULT_AI_SETTINGS: AISettingsState = {
  geminiApiKey: '',
  geminiModel: 'gemini-3.0-flash',
  googleMapsApiKey: '',
  googleMapsEnabled: false,
  voiceHoldEnabled: true,
  autoCategorizeEnabled: true,
};

interface AIContextType extends AISettingsState {
  isLoaded: boolean;
  isAISettingsModalOpen: boolean;
  openAISettingsModal: () => void;
  closeAISettingsModal: () => void;
  updateAISettings: (partial: Partial<AISettingsState>) => Promise<void>;
}

const AIContext = createContext<AIContextType>({
  ...DEFAULT_AI_SETTINGS,
  isLoaded: false,
  isAISettingsModalOpen: false,
  openAISettingsModal: () => {},
  closeAISettingsModal: () => {},
  updateAISettings: async () => {},
});

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AISettingsState>(DEFAULT_AI_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAISettingsModalOpen, setIsAISettingsModalOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(AI_SETTINGS_STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as Partial<AISettingsState>;
            setSettings((prev) => ({
              ...prev,
              ...parsed,
              geminiModel:
                typeof parsed.geminiModel === 'string' && parsed.geminiModel.trim().length > 0
                  ? parsed.geminiModel.trim()
                  : 'gemini-3.0-flash',
            }));
          } catch {
            // conservar defaults
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const updateAISettings = useCallback(async (partial: Partial<AISettingsState>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const openAISettingsModal = useCallback(() => setIsAISettingsModalOpen(true), []);
  const closeAISettingsModal = useCallback(() => setIsAISettingsModalOpen(false), []);

  return (
    <AIContext.Provider
      value={{
        ...settings,
        isLoaded,
        isAISettingsModalOpen,
        openAISettingsModal,
        closeAISettingsModal,
        updateAISettings,
      }}
    >
      {children}
    </AIContext.Provider>
  );
};

export const useAI = (): AIContextType => useContext(AIContext);
