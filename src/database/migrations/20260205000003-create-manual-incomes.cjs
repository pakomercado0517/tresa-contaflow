'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('manual_incomes', {
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
      concept: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      subtotal: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      iva_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
      fecha: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      is_paid: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      payment_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('manual_incomes', ['profile_id']);
    await queryInterface.addIndex('manual_incomes', ['period_id']);
    await queryInterface.addIndex('manual_incomes', ['is_paid']);
    await queryInterface.addIndex('manual_incomes', ['fecha']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('manual_incomes');
  },
};
