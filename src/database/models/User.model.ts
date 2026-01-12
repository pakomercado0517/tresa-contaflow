import { DataTypes, Model } from "sequelize";
import sequelize from "../config";

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
  created_at: Date;
  updated_at: Date;
}

interface UserCreationAttributes
  extends Omit<UserAttributes, "id" | "created_at" | "updated_at">,
    Partial<Pick<UserAttributes, "email_verified">> {}

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

