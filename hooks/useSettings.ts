import { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_REASONING_PROMPT } from '../constants';
import { makePromptHumanReadable } from '../utils/prompt';

const hydrateSettings = (raw: AppSettings | null): AppSettings => {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (raw?.ollamaModel === 'llama3.2-vision') {
    merged.ollamaModel = DEFAULT_SETTINGS.ollamaModel;
  }
  if (!merged.ollamaUrl) {
    merged.ollamaUrl = DEFAULT_SETTINGS.ollamaUrl;
  }
  if (!merged.ollamaModel) {
    merged.ollamaModel = DEFAULT_SETTINGS.ollamaModel;
  }
  // Ensure reasoning model is set if it was previously empty (migration)
  if (!merged.ollamaReasoningModel) {
    merged.ollamaReasoningModel = DEFAULT_SETTINGS.ollamaReasoningModel;
  }
  const formattedSystemPrompt = makePromptHumanReadable(merged.systemPrompt);
  merged.systemPrompt = formattedSystemPrompt?.trim() ? formattedSystemPrompt : DEFAULT_REASONING_PROMPT;
  merged.visionPrompt = makePromptHumanReadable(merged.visionPrompt);
  return merged;
};

/**
 * Custom hook for managing application settings
 * Handles localStorage persistence with debouncing
 */
export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('vision-settings');
    return hydrateSettings(saved ? JSON.parse(saved) : null);
  });

  // Debounced localStorage save
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem('vision-settings', JSON.stringify(settings));
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [settings]);

  return { settings, setSettings };
};
