import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";
import Period from "./Period.model.js";

interface ManualIncomeAttributes {
  id: string;
  profile_id: string;
  period_id: string;
  concept: string;
  subtotal: number;
  iva_amount: number;
  fecha: Date;
  is_paid: boolean;
  payment_date: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ManualIncomeCreationAttributes
  extends Omit<
      ManualIncomeAttributes,
      "id" | "created_at" | "updated_at" | "iva_amount" | "is_paid" | "payment_date" | "notes"
    >,
    Partial<
      Pick<
        ManualIncomeAttributes,
        "iva_amount" | "is_paid" | "payment_date" | "notes"
      >
    > {}

class ManualIncome
  extends Model<ManualIncomeAttributes, ManualIncomeCreationAttributes>
  implements ManualIncomeAttributes
{
  declare id: string;
  declare profile_id: string;
  declare period_id: string;
  declare concept: string;
  declare subtotal: number;
  declare iva_amount: number;
  declare fecha: Date;
  declare is_paid: boolean;
  declare payment_date: Date | null;
  declare notes: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

ManualIncome.init(
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
    concept: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    subtotal: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    iva_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    },
    fecha: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    is_paid: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    payment_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
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
    tableName: "manual_incomes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["profile_id"] },
      { fields: ["period_id"] },
      { fields: ["is_paid"] },
      { fields: ["fecha"] },
    ],
  }
);

ManualIncome.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Profile.hasMany(ManualIncome, {
  foreignKey: "profile_id",
  as: "manualIncomes",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

ManualIncome.belongsTo(Period, {
  foreignKey: "period_id",
  as: "period",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Period.hasMany(ManualIncome, {
  foreignKey: "period_id",
  as: "manualIncomes",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default ManualIncome;
export type { ManualIncomeAttributes, ManualIncomeCreationAttributes };
