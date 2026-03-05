import { DataTypes, Model } from 'sequelize';
import sequelize from '../config.js';
import User from './User.model.js';
import Profile from './Profile.model.js';

export interface PublicReportTokenAttributes {
  id: string;
  token: string;
  profile_id: string;
  user_id: string;
  expires_at: Date;
  is_active: boolean;
  created_at: Date;
}

interface PublicReportTokenCreationAttributes
  extends Omit<PublicReportTokenAttributes, 'id' | 'created_at'> {
  id?: string;
  created_at?: Date;
}

class PublicReportToken
  extends Model<PublicReportTokenAttributes, PublicReportTokenCreationAttributes>
  implements PublicReportTokenAttributes
{
  declare id: string;
  declare token: string;
  declare profile_id: string;
  declare user_id: string;
  declare expires_at: Date;
  declare is_active: boolean;
  declare created_at: Date;
}

PublicReportToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'profiles',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'public_report_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      { fields: ['token'] },
      { fields: ['profile_id'] },
      { fields: ['user_id'] },
    ],
  }
);

// Relaciones
PublicReportToken.belongsTo(Profile, { foreignKey: 'profile_id', as: 'profile' });
PublicReportToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Profile.hasMany(PublicReportToken, { foreignKey: 'profile_id', as: 'publicReportTokens' });
User.hasMany(PublicReportToken, { foreignKey: 'user_id', as: 'publicReportTokens' });

export default PublicReportToken;
export type { PublicReportTokenCreationAttributes };
