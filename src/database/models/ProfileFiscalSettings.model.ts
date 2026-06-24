import { DataTypes, Model } from 'sequelize';
import sequelize from '../config.js';
import Profile from './Profile.model.js';
import type {
  ProfileFiscalSettingsAttributes,
} from '../../types/profile-fiscal.types.js';

type ProfileFiscalSettingsCreationAttributes = Omit<
  ProfileFiscalSettingsAttributes,
  'id' | 'created_at' | 'updated_at'
> & {
  id?: string;
};

class ProfileFiscalSettings
  extends Model<ProfileFiscalSettingsAttributes, ProfileFiscalSettingsCreationAttributes>
  implements ProfileFiscalSettingsAttributes
{
  declare id: string;
  declare profile_id: string;
  declare ejercicio: number;
  declare coeficiente_utilidad: number | null;
  declare coeficiente_utilidad_ejercicio_anterior: number | null;
  declare isr_pagos_provisionales_acum: number;
  declare saldo_a_favor_isr: number;
  declare saldo_a_favor_iva: number;
  declare perdidas_fiscales_pendientes: number;
  declare ptu_pagada_acum: number;
  declare created_at: Date;
  declare updated_at: Date;
}

ProfileFiscalSettings.init(
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
    ejercicio: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    coeficiente_utilidad: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    coeficiente_utilidad_ejercicio_anterior: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    isr_pagos_provisionales_acum: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    saldo_a_favor_isr: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    saldo_a_favor_iva: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    perdidas_fiscales_pendientes: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
    },
    ptu_pagada_acum: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
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
    tableName: 'profile_fiscal_settings',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

ProfileFiscalSettings.belongsTo(Profile, {
  foreignKey: 'profile_id',
  as: 'profile',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});
Profile.hasMany(ProfileFiscalSettings, {
  foreignKey: 'profile_id',
  as: 'fiscal_settings',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE',
});

export default ProfileFiscalSettings;
