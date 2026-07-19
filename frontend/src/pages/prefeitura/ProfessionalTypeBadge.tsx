import { useTranslation } from 'react-i18next';

/**
 * Pequeno badge que indica o tipo de profissional (Médico/Enfermeiro) ao
 * lado do nome, reutilizado em tabelas/listas/cards de todas as sub-views
 * operacionais do Portal Prefeitura. O backend serializa o enum via
 * `.ToString()` (ProfessionalTypeLabel em PrefeituraService.cs), então os
 * valores esperados são "Medico" | "Enfermeiro" (sem acento).
 *
 * Renderiza null quando o campo vier ausente/nulo — cobre dados legados
 * (seed antigo, usuário sem ProfessionalType populado) sem quebrar layout.
 */
export function ProfessionalTypeBadge({
  type,
  className,
}: {
  type?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!type) return null;
  const isEnfermeiro = type.toLowerCase().startsWith('enferm');
  const label = isEnfermeiro
    ? t('prefeitura.common.professionalTypeEnfermeiro')
    : t('prefeitura.common.professionalTypeMedico');
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        marginLeft: '0.4rem',
        padding: '0.05rem 0.45rem',
        borderRadius: 8,
        fontSize: '0.62rem',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        background: isEnfermeiro ? 'rgba(139, 92, 246, 0.15)' : 'rgba(45, 191, 184, 0.15)',
        color: isEnfermeiro ? '#8b5cf6' : '#1a8a85',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      {label}
    </span>
  );
}
