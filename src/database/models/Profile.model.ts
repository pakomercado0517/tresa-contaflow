import { DataTypes, Model } from "sequelize";
import sequelize from "../config";
import User from "./User.model.js";

type TipoPersona = "FISICA" | "MORAL";

interface ProfileAttributes {
  id: string;
  user_id: string;
  nombre: string;
  rfc: string;
  tipo_persona: TipoPersona;
  regimen_fiscal: string | null;
  validaciones_habilitadas: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface ProfileCreationAttributes
  extends Omit<ProfileAttributes, "id" | "created_at" | "updated_at">,
    Partial<Pick<ProfileAttributes, "regimen_fiscal" | "validaciones_habilitadas">> {}

class Profile extends Model<ProfileAttributes, ProfileCreationAttributes> implements ProfileAttributes {
  declare id: string;
  declare user_id: string;
  declare nombre: string;
  declare rfc: string;
  declare tipo_persona: TipoPersona;
  declare regimen_fiscal: string | null;
  declare validaciones_habilitadas: Record<string, unknown>;
  declare created_at: Date;
  declare updated_at: Date;
}

Profile.init(
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
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rfc: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tipo_persona: {
      type: DataTypes.ENUM("FISICA", "MORAL"),
      allowNull: false,
    },
    regimen_fiscal: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    validaciones_habilitadas: {
      type: DataTypes.JSONB,
      defaultValue: {},
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
    tableName: "profiles",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"] },
      { unique: true, fields: ["user_id", "rfc"] },
    ],
  }
);

// Relaciones
Profile.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(Profile, { foreignKey: "user_id", as: "profiles" });

export default Profile;
export type { ProfileAttributes, ProfileCreationAttributes, TipoPersona };

