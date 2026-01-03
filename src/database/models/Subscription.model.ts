import { DataTypes, Model } from "sequelize";
import sequelize from "../config";
import User from "./User.model.js";

type Plan = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
type SubscriptionStatus = "ACTIVE" | "CANCELLED" | "EXPIRED" | "PAST_DUE" | "UNPAID" | "TRIALING";

interface SubscriptionAttributes {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: Plan;
  plan_price: number;
  status: SubscriptionStatus;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  canceled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface SubscriptionCreationAttributes
  extends Omit<
      SubscriptionAttributes,
      "id" | "created_at" | "updated_at" | "stripe_customer_id" | "stripe_subscription_id" | "current_period_start" | "current_period_end" | "canceled_at" | "plan" | "plan_price" | "status" | "cancel_at_period_end"
    >,
    Partial<
      Pick<
        SubscriptionAttributes,
        "stripe_customer_id" | "stripe_subscription_id" | "current_period_start" | "current_period_end" | "canceled_at" | "plan" | "plan_price" | "status" | "cancel_at_period_end"
      >
    > {}

class Subscription
  extends Model<SubscriptionAttributes, SubscriptionCreationAttributes>
  implements SubscriptionAttributes
{
  declare id: string;
  declare user_id: string;
  declare stripe_customer_id: string | null;
  declare stripe_subscription_id: string | null;
  declare plan: Plan;
  declare plan_price: number;
  declare status: SubscriptionStatus;
  declare current_period_start: Date | null;
  declare current_period_end: Date | null;
  declare cancel_at_period_end: boolean;
  declare canceled_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Subscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    stripe_customer_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    stripe_subscription_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    plan: {
      type: DataTypes.ENUM("FREE", "BASIC", "PRO", "ENTERPRISE"),
      defaultValue: "FREE",
      allowNull: false,
    },
    plan_price: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "CANCELLED", "EXPIRED", "PAST_DUE", "UNPAID", "TRIALING"),
      defaultValue: "ACTIVE",
      allowNull: false,
    },
    current_period_start: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    current_period_end: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    cancel_at_period_end: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    canceled_at: {
      type: DataTypes.DATE,
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
    tableName: "subscriptions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"] },
      { fields: ["stripe_customer_id"] },
      { fields: ["stripe_subscription_id"] },
      { fields: ["status"] },
    ],
  }
);

// Relaciones
Subscription.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(Subscription, { foreignKey: "user_id", as: "subscriptions" });

export default Subscription;
export type { SubscriptionAttributes, SubscriptionCreationAttributes, Plan, SubscriptionStatus };

