/**
 * Setup global do vitest para os testes de componente:
 *   - Registra matchers do @testing-library/jest-dom (toBeInTheDocument etc.)
 *   - Faz cleanup automático do DOM depois de cada teste
 *   - Inicializa i18n com o dicionário PT real (mesmo do app), sem
 *     LanguageDetector, para que os testes sejam determinísticos e não
 *     dependam de navigator.language / localStorage.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './src/i18n/locales/pt.json';

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { pt: { translation: pt } },
    lng: 'pt',
    fallbackLng: 'pt',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

// jsdom não provê matchMedia — vários componentes (ThemeContext, media
// queries) chamam. Stub mínimo pra evitar TypeError no primeiro render.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  cleanup();
});
