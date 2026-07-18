/**
 * Papéis (`roles`) reconhecidos pelo app.
 *
 * A área "profissional" — check-in, check-out, plantões, relatórios — é
 * usada por qualquer profissional assistencial, não só médicos. A lista
 * abaixo deve ser mantida em sincronia com o enum `RoleType` do backend
 * (`src/PlantonHub.Domain/Enums/RoleType.cs`) e com a policy `Profissional`
 * em `src/PlantonHub.API/Extensions/AuthorizationExtensions.cs`.
 */
export const PROFESSIONAL_ROLES = ['Medico', 'Enfermeiro', 'Tecnico'] as const;

export type ProfessionalRole = (typeof PROFESSIONAL_ROLES)[number];

/** Verifica se um conjunto de roles contém pelo menos um role profissional. */
export function isProfessional(roles: readonly string[]): boolean {
  return roles.some((r) => (PROFESSIONAL_ROLES as readonly string[]).includes(r));
}

/**
 * Rota "home" natural do usuário após o login, escolhida pela role de maior
 * prioridade que ele tem:
 *
 *   Profissional (Medico/Enfermeiro/Tecnico) → /doctor
 *   GestorPublico                            → /prefeitura
 *   AdminGlobal / AdminClinica               → /admin
 *   Nenhuma role reconhecida (edge case)     → /dashboard (fallback seguro)
 *
 * A ideia é que quem só faz check-in/check-out não precise passar por telas
 * administrativas antes de chegar onde quer estar. Gestor público entra no
 * portal Prefeitura direto (Sprint 7).
 */
export function getHomeRouteFor(roles: readonly string[] | undefined | null): string {
  if (!roles || roles.length === 0) return '/dashboard';
  if (isProfessional(roles)) return '/doctor';
  if (roles.includes('GestorPublico')) return '/prefeitura';
  if (roles.includes('AdminGlobal') || roles.includes('AdminClinica')) return '/admin';
  return '/dashboard';
}
