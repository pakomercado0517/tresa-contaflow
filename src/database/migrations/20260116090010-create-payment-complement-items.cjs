'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_complement_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      complement_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'payment_complements',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      profile_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'profiles',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      factura_uuid: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      fecha_pago: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      forma_pago: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      moneda_pago: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      tipo_cambio_pago: {
        type: Sequelize.DECIMAL(15, 6),
        allowNull: false,
        defaultValue: 1,
      },
      monto_pago: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      num_operacion: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      moneda_dr: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      tipo_cambio_dr: {
        type: Sequelize.DECIMAL(15, 6),
        allowNull: false,
        defaultValue: 1,
      },
      metodo_pago_dr: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      num_parcialidad: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      imp_saldo_ant: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      imp_pagado: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      imp_saldo_insoluto: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('payment_complement_items', ['profile_id']);
    await queryInterface.addIndex('payment_complement_items', ['factura_uuid']);
    await queryInterface.addIndex('payment_complement_items', ['fecha_pago']);
    await queryInterface.addIndex('payment_complement_items', ['complement_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_complement_items');
  },
};
