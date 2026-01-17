import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";

import type {
  PaymentComplementAttributes,
  PaymentComplementCreationAttributes,
} from "../../types/payment.types.js";

class PaymentComplement
  extends Model<PaymentComplementAttributes, PaymentComplementCreationAttributes>
  implements PaymentComplementAttributes
{
  declare id: string;
  declare profile_id: string;
  declare uuid: string;
  declare fecha_emision: Date;
  declare rfc_emisor: string;
  declare rfc_receptor: string;
  declare complemento_data: PaymentComplementAttributes["complemento_data"];
  declare created_at: Date;
  declare updated_at: Date;
}

PaymentComplement.init(
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
      allowNull: false,
      unique: true,
    },
    fecha_emision: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    rfc_emisor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rfc_receptor: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    complemento_data: {
      type: DataTypes.JSONB,
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
    tableName: "payment_complements",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["profile_id"] }, { fields: ["uuid"] }, { fields: ["fecha_emision"] }],
  }
);

PaymentComplement.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Profile.hasMany(PaymentComplement, {
  foreignKey: "profile_id",
  as: "payment_complements",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default PaymentComplement;
export type { PaymentComplementAttributes, PaymentComplementCreationAttributes };
