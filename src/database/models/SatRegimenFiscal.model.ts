import { DataTypes, Model } from 'sequelize';
import sequelize from '../config.js';
import type {
  SatRegimenFiscalAttributes,
  SatRegimenFiscalCreationAttributes,
} from '../../types/sat.types.js';

/**
 * Catálogo oficial de Regímenes Fiscales del SAT (c_RegimenFiscal).
 * Usado para que el frontend muestre opciones válidas al configurar regimenes_fiscales del perfil.
 */
class SatRegimenFiscal
  extends Model<SatRegimenFiscalAttributes, SatRegimenFiscalCreationAttributes>
  implements SatRegimenFiscalAttributes
{
  declare clave: string;
  declare descripcion: string;
  declare aplica_persona_fisica: boolean;
  declare aplica_persona_moral: boolean;
  declare vigente: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

SatRegimenFiscal.init(
  {
    clave: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false,
      comment: 'Clave del régimen fiscal (catálogo SAT c_RegimenFiscal)',
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Descripción oficial del régimen fiscal',
    },
    aplica_persona_fisica: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Aplica a personas físicas',
    },
    aplica_persona_moral: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Aplica a personas morales',
    },
    vigente: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Si el régimen está vigente según el SAT',
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
    tableName: 'sat_regimenes_fiscales',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['aplica_persona_fisica'], name: 'sat_regimenes_fiscales_pf_idx' },
      { fields: ['aplica_persona_moral'], name: 'sat_regimenes_fiscales_pm_idx' },
      { fields: ['vigente'], name: 'sat_regimenes_fiscales_vigente_idx' },
    ],
  }
);

export default SatRegimenFiscal;
export type { SatRegimenFiscalAttributes, SatRegimenFiscalCreationAttributes };
