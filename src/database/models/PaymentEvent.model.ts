import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import User from "./User.model.js";

interface PaymentEventAttributes {
  id: string;
  user_id: string | null;
  stripe_event_id: string;
  stripe_event_type: string;
  event_data: Record<string, unknown>;
  processed_at: Date | null;
  created_at: Date;
}

interface PaymentEventCreationAttributes
  extends Omit<PaymentEventAttributes, "id" | "created_at">,
    Partial<Pick<PaymentEventAttributes, "user_id" | "processed_at">> {}

class PaymentEvent
  extends Model<PaymentEventAttributes, PaymentEventCreationAttributes>
  implements PaymentEventAttributes
{
  declare id: string;
  declare user_id: string | null;
  declare stripe_event_id: string;
  declare stripe_event_type: string;
  declare event_data: Record<string, unknown>;
  declare processed_at: Date | null;
  declare created_at: Date;
}

PaymentEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    stripe_event_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    stripe_event_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    event_data: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    processed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "payment_events",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [
      { fields: ["stripe_event_id"] },
      { fields: ["stripe_event_type"] },
      { fields: ["user_id"] },
    ],
  }
);

// Relaciones
PaymentEvent.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(PaymentEvent, { foreignKey: "user_id", as: "payment_events" });

export default PaymentEvent;
export type { PaymentEventAttributes, PaymentEventCreationAttributes };

