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
