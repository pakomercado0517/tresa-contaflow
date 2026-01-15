import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import User from "./User.model.js";

interface DiscountCodeAttributes {
  id: string;
  code: string;
  stripe_promotion_code_id: string;
  stripe_coupon_id: string;
  active: boolean;
  expires_at: Date | null;
  max_redemptions: number | null;
  times_redeemed: number;
  created_by: string;
  metadata: Record<string, string> | null;
  created_at: Date;
  updated_at: Date;
}

interface DiscountCodeCreationAttributes
  extends Omit<
      DiscountCodeAttributes,
      "id" | "created_at" | "updated_at" | "expires_at" | "max_redemptions" | "metadata"
    >,
    Partial<Pick<DiscountCodeAttributes, "expires_at" | "max_redemptions" | "metadata">> {}

class DiscountCode
  extends Model<DiscountCodeAttributes, DiscountCodeCreationAttributes>
  implements DiscountCodeAttributes
{
  declare id: string;
  declare code: string;
  declare stripe_promotion_code_id: string;
  declare stripe_coupon_id: string;
  declare active: boolean;
  declare expires_at: Date | null;
  declare max_redemptions: number | null;
  declare times_redeemed: number;
  declare created_by: string;
  declare metadata: Record<string, string> | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DiscountCode.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    stripe_promotion_code_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    stripe_coupon_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    max_redemptions: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    times_redeemed: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: "discount_codes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["code"] },
      { fields: ["stripe_promotion_code_id"] },
      { fields: ["active"] },
      { fields: ["created_by"] },
    ],
  }
);

DiscountCode.belongsTo(User, { foreignKey: "created_by", as: "creator" });
User.hasMany(DiscountCode, { foreignKey: "created_by", as: "discountCodes" });

export default DiscountCode;
export type { DiscountCodeAttributes, DiscountCodeCreationAttributes };
