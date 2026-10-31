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
  broker: 'Bróker',
  deuda_hipoteca: 'Hipoteca',
  deuda_prestamo: 'Préstamo',
  bien: 'Bien',
  deposito: 'Depósito',
  letra: 'Letras del Tesoro',
} as const;

// Inicio's breakdown by kind of asset (engine/insight.ts AssetClass).
export const CLASS_LABEL: Record<string, string> = {
  liquidez: 'Liquidez',
  renta_variable: 'Renta variable',
  oro: 'Oro',
  cripto: 'Cripto',
  inmuebles: 'Inmuebles',
  bienes: 'Bienes',
};

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

// Inicio's periods (server/home.ts computes them).
export const PERIODS = [
  { key: 'dia', label: 'Día', short: 'hoy' },
  { key: 'mes', label: 'Mes', short: 'mes' },
  { key: 'm3', label: '3M', short: '3 meses' },
  { key: 'm6', label: '6M', short: '6 meses' },
  { key: 'ano', label: 'Año', short: 'año' },
  { key: 'todo', label: 'Todo', short: 'total' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

// Alta inicial (b11/NAlta): what can go in, and what its amount is called.
export const ALTA_KINDS = [
  { kind: 'efectivo', label: 'Cuenta bancaria', hint: 'nómina, día a día', amount: 'Saldo hoy' },
  { kind: 'remunerada', label: 'Cuenta remunerada', hint: 'con interés', amount: 'Saldo hoy' },
  {
    kind: 'broker',
    label: 'Bróker o inversiones',
    hint: 'ETF, fondos, acciones',
    amount: 'Efectivo en la cuenta',
    placeholder: 'Nombre, p. ej. Trade Republic',
  },
  { kind: 'cripto', label: 'Cripto', hint: 'precio automático', amount: 'Efectivo en la cuenta' },
  { kind: 'vehiculo', label: 'Coche o moto', hint: 'lo que vale hoy', amount: 'Valor hoy' },
  { kind: 'bien', label: 'Otro bien', hint: 'PC, joyas, reloj…', amount: 'Valor hoy' },
  {
    kind: 'deuda_hipoteca',
    label: 'Hipoteca o préstamo',
    hint: 'lo que te queda',
    amount: 'Lo que debes',
  },
] as const;
export type AltaKind = (typeof ALTA_KINDS)[number]['kind'];
// Where its products go in next.
export const WITH_PRODUCTS: AltaKind[] = ['broker', 'cripto'];
