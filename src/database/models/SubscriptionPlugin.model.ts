import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Subscription from "./Subscription.model.js";
import Plugin from "./Plugin.model.js";

export interface SubscriptionPluginAttributes {
  id: string;
  subscription_id: string;
  plugin_id: string;
  enabled: boolean;
  created_at: Date;
}

export interface SubscriptionPluginCreationAttributes
  extends Omit<
      SubscriptionPluginAttributes,
      "id" | "created_at" | "enabled"
    >,
    Partial<Pick<SubscriptionPluginAttributes, "enabled">> {}

class SubscriptionPlugin
  extends Model<SubscriptionPluginAttributes, SubscriptionPluginCreationAttributes>
  implements SubscriptionPluginAttributes
{
  declare id: string;
  declare subscription_id: string;
  declare plugin_id: string;
  declare enabled: boolean;
  declare created_at: Date;
}

SubscriptionPlugin.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subscription_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "subscriptions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    plugin_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "plugins",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "subscription_plugins",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [
      { fields: ["subscription_id"] },
      { fields: ["plugin_id"] },
      {
        unique: true,
        fields: ["subscription_id", "plugin_id"],
      },
    ],
  }
);

SubscriptionPlugin.belongsTo(Subscription, {
  foreignKey: "subscription_id",
  as: "subscription",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Subscription.hasMany(SubscriptionPlugin, {
  foreignKey: "subscription_id",
  as: "subscriptionPlugins",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

SubscriptionPlugin.belongsTo(Plugin, {
  foreignKey: "plugin_id",
  as: "plugin",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Plugin.hasMany(SubscriptionPlugin, {
  foreignKey: "plugin_id",
  as: "subscriptionPlugins",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default SubscriptionPlugin;
