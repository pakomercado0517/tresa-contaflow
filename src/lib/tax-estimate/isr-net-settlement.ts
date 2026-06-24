import { roundMoney } from './round-money.js';

export interface IsrNetSettlementInput {
  isrCausado: number;
  retenciones: number;
  pagosProvisionales: number;
  saldoAFavorIsr: number;
}

export interface IsrNetSettlementResult {
  isrNetoAPagar: number;
  saldoAFavor: number;
}

export function settleIsrNeto(input: IsrNetSettlementInput): IsrNetSettlementResult {
  const creditos = input.retenciones + input.pagosProvisionales + input.saldoAFavorIsr;
  const netoRaw = input.isrCausado - creditos;
  return {
    isrNetoAPagar: roundMoney(Math.max(0, netoRaw)),
    saldoAFavor: roundMoney(Math.max(0, creditos - input.isrCausado)),
  };
}
