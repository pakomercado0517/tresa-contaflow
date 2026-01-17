import { DataTypes, Model } from "sequelize";
import sequelize from "../config.js";
import Profile from "./Profile.model.js";
import PaymentComplement from "./PaymentComplement.model.js";

import type {
  PaymentComplementItemAttributes,
  PaymentComplementItemCreationAttributes,
} from "../../types/payment.types.js";

class PaymentComplementItem
  extends Model<PaymentComplementItemAttributes, PaymentComplementItemCreationAttributes>
  implements PaymentComplementItemAttributes
{
  declare id: string;
  declare complement_id: string;
  declare profile_id: string;
  declare factura_uuid: string;
  declare fecha_pago: Date;
  declare forma_pago: string;
  declare moneda_pago: string;
  declare tipo_cambio_pago: number;
  declare monto_pago: number;
  declare num_operacion: string | null;
  declare moneda_dr: string;
  declare tipo_cambio_dr: number;
  declare metodo_pago_dr: string;
  declare num_parcialidad: number;
  declare imp_saldo_ant: number;
  declare imp_pagado: number;
  declare imp_saldo_insoluto: number;
  declare created_at: Date;
  declare updated_at: Date;
}

PaymentComplementItem.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    complement_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "payment_complements",
        key: "id",
      },
    },
    profile_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "profiles",
        key: "id",
      },
    },
    factura_uuid: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fecha_pago: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    forma_pago: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    moneda_pago: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tipo_cambio_pago: {
      type: DataTypes.DECIMAL(15, 6),
      allowNull: false,
      defaultValue: 1,
    },
    monto_pago: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    num_operacion: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    moneda_dr: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    tipo_cambio_dr: {
      type: DataTypes.DECIMAL(15, 6),
      allowNull: false,
      defaultValue: 1,
    },
    metodo_pago_dr: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    num_parcialidad: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    imp_saldo_ant: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    imp_pagado: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
    },
    imp_saldo_insoluto: {
      type: DataTypes.DECIMAL(15, 2),
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
    tableName: "payment_complement_items",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["profile_id"] },
      { fields: ["factura_uuid"] },
      { fields: ["fecha_pago"] },
      { fields: ["complement_id"] },
    ],
  }
);

PaymentComplementItem.belongsTo(Profile, {
  foreignKey: "profile_id",
  as: "profile",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Profile.hasMany(PaymentComplementItem, {
  foreignKey: "profile_id",
  as: "payment_complement_items",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

PaymentComplementItem.belongsTo(PaymentComplement, {
  foreignKey: "complement_id",
  as: "complement",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

PaymentComplement.hasMany(PaymentComplementItem, {
  foreignKey: "complement_id",
  as: "items",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

export default PaymentComplementItem;
export type { PaymentComplementItemAttributes, PaymentComplementItemCreationAttributes };
