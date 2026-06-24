'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tax_estimates', {
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
      regimen: {
        type: Sequelize.STRING(3),
        allowNull: false,
      },
      ejercicio: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      mes: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      tipo_persona: {
        type: Sequelize.ENUM('FISICA', 'MORAL'),
        allowNull: false,
      },
      period_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'periods',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      computed_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
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

    await queryInterface.addIndex('tax_estimates', ['profile_id', 'regimen', 'ejercicio', 'mes'], {
      unique: true,
      name: 'tax_estimates_profile_regimen_ejercicio_mes_unique',
    });

    await queryInterface.addIndex('tax_estimates', ['profile_id', 'ejercicio', 'regimen'], {
      name: 'tax_estimates_profile_ejercicio_regimen_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tax_estimates');
  },
};
