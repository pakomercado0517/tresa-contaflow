import { DataTypes, Model } from "sequelize";
import sequelize from "../config";
import Profile from "./Profile.model.js";

type TipoOrigen = "XML" | "MANUAL";
type TipoGasto = "PUE" | "PPD" | "COMPLEMENTO_PAGO";

interface ExpenseAttributes {
  id: string;
  profile_id: string;
  tipo_origen: TipoOrigen;
  fecha: Date;
  mes: number;
  año: number;
  total: number;
  subtotal: number;
  iva: number;
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
  pagos: unknown[];
  complemento_pago: Record<string, unknown> | null;
  validacion: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ExpenseCreationAttributes
  extends Omit<
      ExpenseAttributes,
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
    >,
    Partial<
      Pick<
        ExpenseAttributes,
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
      >
    > {}

class Expense extends Model<ExpenseAttributes, ExpenseCreationAttributes> implements ExpenseAttributes {
  declare id: string;
  declare profile_id: string;
  declare tipo_origen: TipoOrigen;
  declare fecha: Date;
  declare mes: number;
  declare año: number;
  declare total: number;
  declare subtotal: number;
  declare iva: number;
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
  declare pagos: unknown[];
  declare complemento_pago: Record<string, unknown> | null;
  declare validacion: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

Expense.init(
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
    tableName: "expenses",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["profile_id"] },
      { fields: ["uuid"] },
      { fields: ["fecha"] },
      { fields: ["mes", "año"] },
    ],
  }
);

// Relaciones
Expense.belongsTo(Profile, { foreignKey: "profile_id", as: "profile" });
Profile.hasMany(Expense, { foreignKey: "profile_id", as: "expenses" });

export default Expense;
export type { ExpenseAttributes, ExpenseCreationAttributes, TipoOrigen, TipoGasto };

