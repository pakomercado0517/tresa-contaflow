'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('discount_codes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      stripe_promotion_code_id: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      stripe_coupon_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      max_redemptions: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      times_redeemed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      metadata: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('discount_codes', ['code']);
    await queryInterface.addIndex('discount_codes', ['stripe_promotion_code_id']);
    await queryInterface.addIndex('discount_codes', ['active']);
    await queryInterface.addIndex('discount_codes', ['created_by']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('discount_codes');
  },
};
