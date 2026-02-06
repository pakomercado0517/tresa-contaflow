'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payrolls', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
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
      period_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'periods',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      uuid: {
        type: Sequelize.STRING(36),
        allowNull: false,
        unique: true,
      },
      employee_rfc: {
        type: Sequelize.STRING(13),
        allowNull: false,
      },
      fecha_pago: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      percepciones_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      deducciones_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      neto_pagado: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      xml_path: {
        type: Sequelize.STRING(500),
        allowNull: true,
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

    await queryInterface.addIndex('payrolls', ['profile_id']);
    await queryInterface.addIndex('payrolls', ['period_id']);
    await queryInterface.addIndex('payrolls', ['uuid']);
    await queryInterface.addIndex('payrolls', ['fecha_pago']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payrolls');
  },
};
