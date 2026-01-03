'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      stripe_event_id: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: false,
      },
      stripe_event_type: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      event_data: {
        type: Sequelize.JSONB,
        allowNull: false,
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('payment_events', ['stripe_event_id']);
    await queryInterface.addIndex('payment_events', ['stripe_event_type']);
    await queryInterface.addIndex('payment_events', ['user_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('payment_events');
  },
};
