import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";

export interface PluginAttributes {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_available: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PluginCreationAttributes
  extends Omit<
      PluginAttributes,
      "id" | "created_at" | "updated_at" | "description" | "is_available"
    >,
    Partial<Pick<PluginAttributes, "description" | "is_available">> {}

class Plugin
  extends Model<PluginAttributes, PluginCreationAttributes>
  implements PluginAttributes
{
  declare id: string;
  declare name: string;
  declare display_name: string;
  declare description: string | null;
  declare is_available: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

Plugin.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    display_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: "plugins",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["name"] },
      { fields: ["is_available"] },
    ],
  }
);

export default Plugin;
