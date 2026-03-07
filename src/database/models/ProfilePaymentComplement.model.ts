import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";
import PaymentComplement from "./PaymentComplement.model.js";

import type {
  ProfilePaymentComplementAttributes,
  ProfilePaymentComplementCreationAttributes,
  ComplementRole,
} from "../../types/payment.types.js";

class ProfilePaymentComplement
  extends Model<ProfilePaymentComplementAttributes, ProfilePaymentComplementCreationAttributes>
  implements ProfilePaymentComplementAttributes
{
  declare id: string;
  declare profile_id: string;
  declare complement_id: string;
  declare role: ComplementRole;
  declare created_at: Date;
  declare updated_at: Date;
}

ProfilePaymentComplement.init(
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
    complement_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "payment_complements",
        key: "id",
      },
    },
    role: {
      type: DataTypes.ENUM("INGRESO", "EGRESO"),
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
    tableName: "profile_payment_complements",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["profile_id", "complement_id"],
        name: "profile_complement_unique",
      },
      { fields: ["profile_id"] },
      { fields: ["complement_id"] },
    ],
  }
);

ProfilePaymentComplement.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Profile.hasMany(ProfilePaymentComplement, {
  foreignKey: "profile_id",
  as: "profile_payment_complements",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

ProfilePaymentComplement.belongsTo(PaymentComplement, {
  foreignKey: "complement_id",
  as: "complement",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

PaymentComplement.hasMany(ProfilePaymentComplement, {
  foreignKey: "complement_id",
  as: "profile_links",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default ProfilePaymentComplement;
export type { ProfilePaymentComplementAttributes, ProfilePaymentComplementCreationAttributes };
