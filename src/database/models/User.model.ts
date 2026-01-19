import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";

interface UserAttributes {
  id: string;
  email: string;
  password_hash: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  email_verified: boolean;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
  password_reset_token: string | null;
  password_reset_expires: Date | null;
  trial_used: boolean;
  tour_version: string | null;
  tour_completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UserCreationAttributes
  extends Omit<UserAttributes, "id" | "created_at" | "updated_at" | "email_verified" | "trial_used" | "tour_version" | "tour_completed_at"> {
  email_verified?: boolean;
  trial_used?: boolean;
  tour_version?: string | null;
  tour_completed_at?: Date | null;
}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare password_hash: string;
  declare nombre: string | null;
  declare apellido: string | null;
  declare telefono: string | null;
  declare email_verified: boolean;
  declare email_verification_token: string | null;
  declare email_verification_expires: Date | null;
  declare password_reset_token: string | null;
  declare password_reset_expires: Date | null;
  declare trial_used: boolean;
  declare tour_version: string | null;
  declare tour_completed_at: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    apellido: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    telefono: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    email_verification_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email_verification_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    password_reset_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    password_reset_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    trial_used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    tour_version: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: null,
    },
    tour_completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
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
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default User;
export type { UserAttributes, UserCreationAttributes };

