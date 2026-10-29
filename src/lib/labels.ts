// Texts shown for the stored values, shared by pages and forms.
export const KIND_LABEL = {
  efectivo: 'Cuenta corriente o efectivo',
  remunerada: 'Cuenta remunerada',
  inversion: 'Inversión',
  pension: 'Plan de pensiones',
  cripto: 'Cripto',
  inmueble: 'Inmueble',
  vehiculo: 'Vehículo',
  otro: 'Otro',
  deuda: 'Deuda o préstamo',
} as const;

// These follow the projection's scenario return, so they have no rate of their own.
export const FOLLOWS_SCENARIO = ['inversion', 'pension', 'cripto'];

export const RATE_LABEL: Record<string, string> = {
  deuda: 'Interés anual que te cobran',
  vehiculo: 'Cuánto cambia su valor al año',
  inmueble: 'Cuánto cambia su valor al año',
};

export const FREQUENCY_LABEL = {
  mensual: 'Mes',
  trimestral: 'Trimestre',
  anual: 'Año',
  una_vez: 'Una vez',
} as const;

export const TYPE_LABEL = { entra: 'Entra', sale: 'Sale', mueve: 'Se mueve' } as const;

// In-app themes (Horizonte README); the brand and the public web stay in Amanecer.
export const THEMES = [
  { id: 'amanecer', label: 'Amanecer', color: '#FFB547' },
  { id: 'crepusculo', label: 'Crepúsculo', color: '#B9A3FF' },
  { id: 'rose', label: 'Rosé', color: '#F2B0A0' },
] as const;
export type Theme = (typeof THEMES)[number]['id'];
export const THEME_COOKIE = 'soleva_theme';
export const asTheme = (v: string | undefined | null): Theme =>
  THEMES.find((t) => t.id === v)?.id ?? 'amanecer';
