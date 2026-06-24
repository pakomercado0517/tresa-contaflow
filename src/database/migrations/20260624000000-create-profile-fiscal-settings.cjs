'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('profile_fiscal_settings', {
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
      ejercicio: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Año fiscal del ejercicio',
      },
      coeficiente_utilidad: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: true,
        comment: 'Coeficiente de utilidad régimen 601',
      },
      coeficiente_utilidad_ejercicio_anterior: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: true,
        comment: 'Coeficiente para pagos provisionales ene-feb',
      },
      isr_pagos_provisionales_acum: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      saldo_a_favor_isr: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      saldo_a_favor_iva: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      perdidas_fiscales_pendientes: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      ptu_pagada_acum: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
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

    await queryInterface.addIndex('profile_fiscal_settings', ['profile_id', 'ejercicio'], {
      unique: true,
      name: 'profile_fiscal_settings_profile_ejercicio_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('profile_fiscal_settings');
  },
};
