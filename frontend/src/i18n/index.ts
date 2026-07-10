import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import pt from './locales/pt.json';
import en from './locales/en.json';
import es from './locales/es.json';

/** Códigos dos idiomas suportados pelo app. */
export const SUPPORTED_LANGUAGES = ['pt', 'en', 'es'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Rótulos human-readable para o seletor de idioma. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  pt: 'Português',
  en: 'English',
  es: 'Español',
};

void i18n
  // Detecta automaticamente idioma via localStorage → navigator → HTML lang
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
      es: { translation: es },
    },
    fallbackLng: 'pt',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    nonExplicitSupportedLngs: true, // 'pt-BR' também casa com 'pt'
    interpolation: {
      escapeValue: false, // React já sanitiza
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'plantonhub_lang',
    },
  });

export default i18n;
