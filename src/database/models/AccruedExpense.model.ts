import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";

import type { ComplementoPago } from "../../types/cfdi.types.js";
import type { PagoParcial } from "../../types/payment.types.js";
import type { EstadoValidacionGasto } from "../../types/validation.types.js";

type TipoOrigen = "XML" | "MANUAL";
type TipoGasto = "PUE" | "PPD" | "COMPLEMENTO_PAGO";

interface AccruedExpenseAttributes {
  id: string;
  profile_id: string;
  tipo_origen: TipoOrigen;
  fecha: Date;
  mes: number;
  año: number;
  total: number;
  subtotal: number;
  iva: number;
  iva_amount: number;
  retencion_iva_amount: number;
  retencion_isr_amount: number;
  is_paid: boolean;
  concepto: string | null;
  categoria: string | null;
  uuid: string | null;
  tipo: TipoGasto | null;
  rfc_emisor: string | null;
  nombre_emisor: string | null;
  regimen_fiscal_emisor: string | null;
  rfc_receptor: string | null;
  nombre_receptor: string | null;
  regimen_fiscal_receptor: string | null;
  pagos: PagoParcial[];
  complemento_pago: ComplementoPago | null;
  validacion: EstadoValidacionGasto;
  created_at: Date;
  updated_at: Date;
}

interface AccruedExpenseCreationAttributes
  extends Omit<
      AccruedExpenseAttributes,
      | "id"
      | "created_at"
      | "updated_at"
      | "uuid"
      | "tipo"
      | "rfc_emisor"
      | "nombre_emisor"
      | "regimen_fiscal_emisor"
      | "rfc_receptor"
      | "nombre_receptor"
      | "regimen_fiscal_receptor"
      | "concepto"
      | "categoria"
      | "pagos"
      | "complemento_pago"
      | "validacion"
      | "iva_amount"
      | "retencion_iva_amount"
      | "retencion_isr_amount"
      | "is_paid"
    >,
    Partial<
      Pick<
        AccruedExpenseAttributes,
        | "uuid"
        | "tipo"
        | "rfc_emisor"
        | "nombre_emisor"
        | "regimen_fiscal_emisor"
        | "rfc_receptor"
        | "nombre_receptor"
        | "regimen_fiscal_receptor"
        | "concepto"
        | "categoria"
        | "pagos"
        | "complemento_pago"
        | "validacion"
        | "iva_amount"
        | "retencion_iva_amount"
        | "retencion_isr_amount"
        | "is_paid"
      >
    > {}

class AccruedExpense
  extends Model<AccruedExpenseAttributes, AccruedExpenseCreationAttributes>
  implements AccruedExpenseAttributes
{
  declare id: string;
  declare profile_id: string;
  declare tipo_origen: TipoOrigen;
  declare fecha: Date;
  declare mes: number;
  declare año: number;
  declare total: number;
  declare subtotal: number;
  declare iva: number;
  declare iva_amount: number;
  declare retencion_iva_amount: number;
  declare retencion_isr_amount: number;
  declare is_paid: boolean;
  declare concepto: string | null;
  declare categoria: string | null;
  declare uuid: string | null;
  declare tipo: TipoGasto | null;
  declare rfc_emisor: string | null;
  declare nombre_emisor: string | null;
  declare regimen_fiscal_emisor: string | null;
  declare rfc_receptor: string | null;
  declare nombre_receptor: string | null;
  declare regimen_fiscal_receptor: string | null;
  declare pagos: PagoParcial[];
  declare complemento_pago: ComplementoPago | null;
  declare validacion: EstadoValidacionGasto;
  declare created_at: Date;
  declare updated_at: Date;
}

AccruedExpense.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "profiles",
        key: "id",
      },
    },
    tipo_origen: {
      type: DataTypes.ENUM("XML", "MANUAL"),
      allowNull: false,
    },
    fecha: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    año: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    total: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    subtotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    iva: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    iva_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    retencion_iva_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    retencion_isr_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    is_paid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    concepto: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    categoria: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    uuid: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    tipo: {
      type: DataTypes.ENUM("PUE", "PPD", "COMPLEMENTO_PAGO"),
      allowNull: true,
    },
    rfc_emisor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    nombre_emisor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    regimen_fiscal_emisor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rfc_receptor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    nombre_receptor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    regimen_fiscal_receptor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pagos: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false,
    },
    complemento_pago: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    validacion: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "accrued_expenses",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["profile_id"] },
      { fields: ["uuid"] },
      { fields: ["fecha"] },
      { fields: ["mes", "año"] },
      { fields: ["tipo_origen"] },
      { fields: ["is_paid"] },
    ],
  }
);

// Relaciones
AccruedExpense.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Profile.hasMany(AccruedExpense, {
  foreignKey: "profile_id",
  as: "accruedExpenses",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default AccruedExpense;
export type {
  AccruedExpenseAttributes,
  AccruedExpenseCreationAttributes,
  TipoOrigen,
  TipoGasto,
};
