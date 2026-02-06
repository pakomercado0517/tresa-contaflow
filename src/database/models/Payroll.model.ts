import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";
import Period from "./Period.model.js";

interface PayrollAttributes {
  id: string;
  profile_id: string;
  period_id: string;
  uuid: string;
  employee_rfc: string;
  fecha_pago: Date;
  percepciones_total: number;
  deducciones_total: number;
  neto_pagado: number;
  xml_path: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PayrollCreationAttributes
  extends Omit<
      PayrollAttributes,
      "id" | "created_at" | "updated_at" | "xml_path"
    >,
    Partial<Pick<PayrollAttributes, "xml_path">> {}

class Payroll
  extends Model<PayrollAttributes, PayrollCreationAttributes>
  implements PayrollAttributes
{
  declare id: string;
  declare profile_id: string;
  declare period_id: string;
  declare uuid: string;
  declare employee_rfc: string;
  declare fecha_pago: Date;
  declare percepciones_total: number;
  declare deducciones_total: number;
  declare neto_pagado: number;
  declare xml_path: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Payroll.init(
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
    period_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "periods",
        key: "id",
      },
    },
    uuid: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
    },
    employee_rfc: {
      type: DataTypes.STRING(13),
      allowNull: false,
    },
    fecha_pago: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    percepciones_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    deducciones_total: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    neto_pagado: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    xml_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
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
    tableName: "payrolls",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["profile_id"] },
      { fields: ["period_id"] },
      { fields: ["uuid"] },
      { fields: ["fecha_pago"] },
    ],
  }
);

Payroll.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Profile.hasMany(Payroll, {
  foreignKey: "profile_id",
  as: "payrolls",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Payroll.belongsTo(Period, {
  foreignKey: "period_id",
  as: "period",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Period.hasMany(Payroll, {
  foreignKey: "period_id",
  as: "payrolls",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default Payroll;
export type { PayrollAttributes, PayrollCreationAttributes };
