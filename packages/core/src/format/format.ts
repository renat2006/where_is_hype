const NBSP = '\u00A0';

export function formatRubles(rubles: number): string {
  const rounded = Math.round(rubles);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = rounded < 0 ? '−' : '';

  return `${sign}${grouped}`;
}

export function formatPrice(rubles: number): string {
  return `до${NBSP}${formatRubles(rubles)}${NBSP}₽`;
}
