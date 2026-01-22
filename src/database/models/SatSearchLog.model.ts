import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import User from "./User.model.js";

interface SatSearchLogAttributes {
  id: string;
  user_id: string;
  search_type: "basic" | "ai_similarity" | "ai_search";
  query: string | null;
  results_count: number | null;
  mes: number;
  año: number;
  created_at: Date;
}

interface SatSearchLogCreationAttributes
  extends Omit<SatSearchLogAttributes, "id" | "created_at" | "query" | "results_count"> {
  query?: string | null;
  results_count?: number | null;
}

class SatSearchLog
  extends Model<SatSearchLogAttributes, SatSearchLogCreationAttributes>
  implements SatSearchLogAttributes
{
  declare id: string;
  declare user_id: string;
  declare search_type: "basic" | "ai_similarity" | "ai_search";
  declare query: string | null;
  declare results_count: number | null;
  declare mes: number;
  declare año: number;
  declare created_at: Date;
}

SatSearchLog.init(
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
    search_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "Tipo de búsqueda: basic, ai_similarity, ai_search",
    },
    query: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Query de búsqueda utilizado",
    },
    results_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Número de resultados retornados",
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Mes de la búsqueda (1-12)",
    },
    año: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "Año de la búsqueda",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "sat_search_logs",
    timestamps: false,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["user_id", "año", "mes", "search_type"] },
      { fields: ["created_at"] },
    ],
  }
);

// Relaciones
SatSearchLog.belongsTo(User, { foreignKey: "user_id", as: "user" });
User.hasMany(SatSearchLog, { foreignKey: "user_id", as: "satSearchLogs" });

export default SatSearchLog;
export type { SatSearchLogAttributes, SatSearchLogCreationAttributes };
