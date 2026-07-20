/**
 * Utilitários de formatação de data/hora que SEMPRE exibem horário de
 * Brasília (America/Sao_Paulo, UTC-3), independente do timezone do
 * navegador do usuário.
 *
 * Contexto: o backend grava/retorna todos os timestamps em UTC
 * (DateTime.UtcNow). Sem especificar `timeZone` explicitamente, as chamadas
 * nativas `toLocaleDateString`/`toLocaleTimeString` deixam a conversão a
 * cargo do timezone do sistema operacional/navegador de quem acessa — o
 * que funciona por acidente quando o dispositivo já está configurado em
 * horário de Brasília, mas quebra (mostra UTC ou outro fuso) em qualquer
 * outro cenário (servidor, container, dispositivo com timezone diferente).
 *
 * Este módulo centraliza a formatação para garantir Brasília sempre,
 * já que o Brasil não usa horário de verão desde 2019 (sem ambiguidade de
 * DST para São Paulo).
 */

export const BR_TIMEZONE = 'America/Sao_Paulo';

function toDate(input: Date | string): Date {
  return input instanceof Date ? input : new Date(input);
}

/** Formata data em pt-BR, sempre no timezone de Brasília. */
export function formatDateBR(input: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(input).toLocaleDateString('pt-BR', { ...opts, timeZone: BR_TIMEZONE });
}

/** Formata hora em pt-BR, sempre no timezone de Brasília. */
export function formatTimeBR(input: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(input).toLocaleTimeString('pt-BR', { ...opts, timeZone: BR_TIMEZONE });
}

/** Formata data+hora em pt-BR, sempre no timezone de Brasília. */
export function formatDateTimeBR(input: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return toDate(input).toLocaleString('pt-BR', { ...opts, timeZone: BR_TIMEZONE });
}

/** dd/MM/yyyy */
export function formatShortDateBR(input: Date | string): string {
  return formatDateBR(input, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** dd/MM/yy */
export function formatShortDate2BR(input: Date | string): string {
  return formatDateBR(input, { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** dd/MM (sem ano) */
export function formatDayMonthBR(input: Date | string): string {
  return formatDateBR(input, { day: '2-digit', month: '2-digit' });
}

/** "segunda-feira, 01 de janeiro de 2026" */
export function formatLongDateBR(input: Date | string): string {
  return formatDateBR(input, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

/** "jan. de 2026" */
export function formatMonthYearBR(input: Date | string): string {
  return formatDateBR(input, { month: 'short', year: 'numeric' });
}

/** HH:mm */
export function formatHmBR(input: Date | string): string {
  return formatTimeBR(input, { hour: '2-digit', minute: '2-digit' });
}

/** HH:mm:ss */
export function formatHmsBR(input: Date | string): string {
  return formatTimeBR(input, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** "HHhmm" (formato compacto usado em vários badges/chips). */
export function formatHmCompactBR(input: Date | string): string {
  return formatHmBR(input).replace(':', 'h');
}

/**
 * Chave "yyyy-MM-dd" calculada no timezone de Brasília — usada para
 * comparar "é hoje?"/"é ontem?" sem depender do timezone do navegador
 * (locale en-CA produz esse formato nativamente via Intl).
 */
export function dateKeyBR(input: Date | string = new Date()): string {
  return toDate(input).toLocaleDateString('en-CA', { timeZone: BR_TIMEZONE });
}

/** True se `input` cai no mesmo dia-calendário de Brasília que agora. */
export function isTodayBR(input: Date | string): boolean {
  return dateKeyBR(input) === dateKeyBR(new Date());
}

/** True se `input` cai no dia-calendário de Brasília imediatamente anterior a hoje. */
export function isYesterdayBR(input: Date | string): boolean {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return dateKeyBR(input) === dateKeyBR(yesterday);
}
