'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('subscription_plugins', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      subscription_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'subscriptions',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      plugin_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'plugins',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('subscription_plugins', ['subscription_id']);
    await queryInterface.addIndex('subscription_plugins', ['plugin_id']);
    await queryInterface.addIndex('subscription_plugins', ['subscription_id', 'plugin_id'], {
      unique: true,
      name: 'subscription_plugins_subscription_id_plugin_id_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('subscription_plugins');
  },
};
