/**
 * Configuração de marca (nome exibido, tagline curta, etc.).
 *
 * Fonte única para o nome comercial mostrado ao usuário. Se a marca mudar,
 * altere aqui e em `frontend/index.html` (título da aba). Nenhum outro lugar
 * do código deveria conter o nome literal.
 *
 * Chaves i18n `login.*` já referenciam este valor via componente, então
 * traduções continuam funcionando sem precisar de placeholder.
 */
export const BRAND = {
  /** Nome curto exibido em headers, logos e footers. */
  name: '24p7',
} as const;
