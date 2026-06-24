import { DataTypes, Model } from 'sequelize';
import sequelize from '../config.js';
import Profile from './Profile.model.js';
import Period from './Period.model.js';
import type { TaxEstimateRowAttributes } from '../../types/tax-estimate-persistence.types.js';
import type { TaxEstimateResult } from '../../types/tax-estimate.types.js';

type TaxEstimateCreationAttributes = Omit<
  TaxEstimateRowAttributes,
  'id' | 'created_at' | 'updated_at' | 'computed_at'
> & {
  id?: string;
  computed_at?: Date;
};

class TaxEstimate
  extends Model<TaxEstimateRowAttributes, TaxEstimateCreationAttributes>
  implements TaxEstimateRowAttributes
{
  declare id: string;
  declare profile_id: string;
  declare regimen: string;
  declare ejercicio: number;
  declare mes: number;
  declare tipo_persona: TaxEstimateRowAttributes['tipo_persona'];
  declare period_id: string | null;
  declare payload: TaxEstimateResult;
  declare computed_at: Date;
  declare created_at: Date;
  declare updated_at: Date;
}

TaxEstimate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'profiles', key: 'id' },
    },
    regimen: {
      type: DataTypes.STRING(3),
      allowNull: false,
    },
    ejercicio: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tipo_persona: {
      type: DataTypes.ENUM('FISICA', 'MORAL'),
      allowNull: false,
    },
    period_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'periods', key: 'id' },
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    computed_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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
    tableName: 'tax_estimates',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

TaxEstimate.belongsTo(Profile, {
  foreignKey: 'profile_id',
  as: 'profile',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Profile.hasMany(TaxEstimate, {
  foreignKey: 'profile_id',
  as: 'tax_estimates',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

TaxEstimate.belongsTo(Period, {
  foreignKey: 'period_id',
  as: 'period',
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
});

export default TaxEstimate;
