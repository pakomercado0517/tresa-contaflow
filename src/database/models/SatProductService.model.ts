import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import type {
  SATProductServiceAttributes,
  SATProductServiceCreationAttributes,
} from "../../types/sat.types.js";

class SatProductService
  extends Model<SATProductServiceAttributes, SATProductServiceCreationAttributes>
  implements SATProductServiceAttributes
{
  declare id: string;
  declare descripcion: string;
  declare incluir_iva_trasladado: string;
  declare incluir_ieps_trasladado: string;
  declare complemento_que_debe_incluir: string | null;
  declare fecha_inicio_vigencia: Date;
  declare fecha_fin_vigencia: Date | null;
  declare estimulo_franja_fronteriza: string;
  declare palabras_similares: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

SatProductService.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      comment: "Clave del producto/servicio del SAT",
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Descripción del producto o servicio",
    },
    incluir_iva_trasladado: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Indica si incluye IVA trasladado (Sí, No, Opcional)",
    },
    incluir_ieps_trasladado: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Indica si incluye IEPS trasladado (Sí, No, Opcional)",
    },
    complemento_que_debe_incluir: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Complemento que debe incluir el producto/servicio",
    },
    fecha_inicio_vigencia: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "Fecha de inicio de vigencia del producto/servicio",
    },
    fecha_fin_vigencia: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Fecha de fin de vigencia (null si está vigente)",
    },
    estimulo_franja_fronteriza: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Código de estímulo franja fronteriza",
    },
    palabras_similares: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Palabras similares para búsquedas mejoradas",
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
    tableName: "sat_product_services",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["id"], unique: true },
      {
        fields: ["descripcion"],
        using: "gin",
        operator: "gin_trgm_ops",
        name: "sat_product_services_descripcion_gin_idx",
      },
      {
        fields: ["palabras_similares"],
        using: "gin",
        operator: "gin_trgm_ops",
        name: "sat_product_services_palabras_similares_gin_idx",
      },
      { fields: ["incluir_iva_trasladado"] },
      { fields: ["incluir_ieps_trasladado"] },
      { fields: ["fecha_inicio_vigencia"] },
      { fields: ["fecha_fin_vigencia"] },
    ],
  }
);

export default SatProductService;
export type { SATProductServiceAttributes, SATProductServiceCreationAttributes };
