import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";

interface PeriodAttributes {
  id: string;
  profile_id: string;
  start_date: Date;
  end_date: Date;
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PeriodCreationAttributes
  extends Omit<PeriodAttributes, "id" | "created_at" | "updated_at" | "name"> {
  name?: string | null;
}

class Period
  extends Model<PeriodAttributes, PeriodCreationAttributes>
  implements PeriodAttributes
{
  declare id: string;
  declare profile_id: string;
  declare start_date: Date;
  declare end_date: Date;
  declare name: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Period.init(
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
    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
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
    tableName: "periods",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["profile_id"] }],
  }
);

Period.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Profile.hasMany(Period, {
  foreignKey: "profile_id",
  as: "periods",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default Period;
export type { PeriodAttributes, PeriodCreationAttributes };
