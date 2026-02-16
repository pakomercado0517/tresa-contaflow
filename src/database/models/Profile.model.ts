import { DataTypes, Model } from 'sequelize';
import sequelize from '../config.js';
import User from './User.model.js';

type TipoPersona = 'FISICA' | 'MORAL';
type FrozenReason = 'plan_limit' | 'user_suspension' | 'payment_issue';

interface ProfileAttributes {
  id: string;
  user_id: string;
  nombre: string;
  rfc: string;
  tipo_persona: TipoPersona;
  regimenes_fiscales: string[];
  validaciones_habilitadas: Record<string, unknown>;
  frozen: boolean;
  frozen_reason: FrozenReason | null;
  frozen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ProfileCreationAttributes extends Omit<
  ProfileAttributes,
  | 'id'
  | 'created_at'
  | 'updated_at'
  | 'regimenes_fiscales'
  | 'validaciones_habilitadas'
  | 'frozen'
  | 'frozen_reason'
  | 'frozen_at'
> {
  regimenes_fiscales?: string[];
  validaciones_habilitadas?: object;
  frozen?: boolean;
  frozen_reason?: FrozenReason | null;
  frozen_at?: Date | null;
}

class Profile
  extends Model<ProfileAttributes, ProfileCreationAttributes>
  implements ProfileAttributes
{
  declare id: string;
  declare user_id: string;
  declare nombre: string;
  declare rfc: string;
  declare tipo_persona: TipoPersona;
  declare regimenes_fiscales: string[];
  declare validaciones_habilitadas: Record<string, unknown>;
  declare frozen: boolean;
  declare frozen_reason: FrozenReason | null;
  declare frozen_at: Date | null;
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
        model: 'users',
        key: 'id',
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
      type: DataTypes.ENUM('FISICA', 'MORAL'),
      allowNull: false,
    },
    regimenes_fiscales: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    validaciones_habilitadas: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
    },
    frozen: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    frozen_reason: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    frozen_at: {
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
    tableName: 'profiles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['user_id'] },
      { unique: true, fields: ['rfc'], name: 'profiles_rfc_unique' },
    ],
  }
);

// Relaciones
Profile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Profile, { foreignKey: 'user_id', as: 'profiles' });

export default Profile;
export type { ProfileAttributes, ProfileCreationAttributes, TipoPersona };
