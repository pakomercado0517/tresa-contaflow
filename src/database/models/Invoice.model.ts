import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";

type TipoFactura = "PUE" | "PPD" | "COMPLEMENTO_PAGO";

interface InvoiceAttributes {
  id: string;
  profile_id: string;
  uuid: string;
  fecha: Date;
  mes: number;
  año: number;
  total: number;
  subtotal: number;
  iva: number;
  tipo: TipoFactura;
  rfc_emisor: string;
  nombre_emisor: string;
  regimen_fiscal_emisor: string | null;
  rfc_receptor: string;
  nombre_receptor: string;
  regimen_fiscal_receptor: string | null;
  concepto: string | null;
  pagos: unknown[];
  complemento_pago: Record<string, unknown> | null;
  validacion: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface InvoiceCreationAttributes
  extends Omit<
      InvoiceAttributes,
      "id" | "created_at" | "updated_at" | "regimen_fiscal_emisor" | "regimen_fiscal_receptor" | "concepto" | "pagos" | "complemento_pago" | "validacion"
    >,
    Partial<
      Pick<
        InvoiceAttributes,
        "regimen_fiscal_emisor" | "regimen_fiscal_receptor" | "concepto" | "pagos" | "complemento_pago" | "validacion"
      >
    > {}

class Invoice extends Model<InvoiceAttributes, InvoiceCreationAttributes> implements InvoiceAttributes {
  declare id: string;
  declare profile_id: string;
  declare uuid: string;
  declare fecha: Date;
  declare mes: number;
  declare año: number;
  declare total: number;
  declare subtotal: number;
  declare iva: number;
  declare tipo: TipoFactura;
  declare rfc_emisor: string;
  declare nombre_emisor: string;
  declare regimen_fiscal_emisor: string | null;
  declare rfc_receptor: string;
  declare nombre_receptor: string;
  declare regimen_fiscal_receptor: string | null;
  declare concepto: string | null;
  declare pagos: unknown[];
  declare complemento_pago: Record<string, unknown> | null;
  declare validacion: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

Invoice.init(
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
    uuid: {
      type: DataTypes.STRING,
      unique: true,
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
    tipo: {
      type: DataTypes.ENUM("PUE", "PPD", "COMPLEMENTO_PAGO"),
      allowNull: false,
    },
    rfc_emisor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nombre_emisor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    regimen_fiscal_emisor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    rfc_receptor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nombre_receptor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    regimen_fiscal_receptor: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    concepto: {
      type: DataTypes.TEXT,
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
    tableName: "invoices",
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
Invoice.belongsTo(Profile, { foreignKey: "profile_id", as: "profile" });
Profile.hasMany(Invoice, { foreignKey: "profile_id", as: "invoices" });

export default Invoice;
export type { InvoiceAttributes, InvoiceCreationAttributes, TipoFactura };

