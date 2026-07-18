//Normalizamos un query param opcional a string
export const optionalQueryString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

// Normalizamos un query param opcional a number
export const optionalQueryInt = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value === '') return undefined;

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};
