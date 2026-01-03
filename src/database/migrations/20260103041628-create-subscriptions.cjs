'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      stripe_customer_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true,
      },
      stripe_subscription_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true,
      },
      plan: {
        type: Sequelize.ENUM('FREE', 'BASIC', 'PRO', 'ENTERPRISE'),
        defaultValue: 'FREE',
        allowNull: false,
      },
      plan_price: {
        type: Sequelize.DECIMAL(10, 2),
        defaultValue: 0,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE', 'UNPAID', 'TRIALING'),
        defaultValue: 'ACTIVE',
        allowNull: false,
      },
      current_period_start: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      current_period_end: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancel_at_period_end: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      canceled_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('subscriptions', ['user_id']);
    await queryInterface.addIndex('subscriptions', ['stripe_customer_id']);
    await queryInterface.addIndex('subscriptions', ['stripe_subscription_id']);
    await queryInterface.addIndex('subscriptions', ['status']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('subscriptions');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_subscriptions_plan";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_subscriptions_status";');
  },
};
