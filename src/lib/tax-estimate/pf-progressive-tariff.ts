import { getPfProgressiveBrackets } from '../../constants/fiscal-rates/pf-progressive-2026.js';
import { roundMoney } from './round-money.js';

export interface PfProgressiveTariffResult {
  isrCausado: number;
  tarifaLabel: string;
}

export function applyPfProgressiveTariff(
  baseGravable: number,
  ejercicio: number,
  mesAcumulado: number
): PfProgressiveTariffResult | null {
  const brackets = getPfProgressiveBrackets(ejercicio, mesAcumulado);
  if (!brackets || brackets.length === 0) {
    return null;
  }

  const base = Math.max(0, baseGravable);
  let row = brackets[brackets.length - 1]!;
  for (const bracket of brackets) {
    if (base >= bracket.limite_inferior && base <= bracket.limite_superior) {
      row = bracket;
      break;
    }
    if (base > bracket.limite_superior) {
      row = bracket;
    }
  }

  const excedente = base - row.limite_inferior;
  const isrCausado = roundMoney(row.cuota_fija + excedente * row.porcentaje_excedente);
  const pctLabel = `${(row.porcentaje_excedente * 100).toFixed(2)}%`;

  return {
    isrCausado,
    tarifaLabel: `Tarifa progresiva (mes ${mesAcumulado}, tramo ${pctLabel})`,
  };
}
