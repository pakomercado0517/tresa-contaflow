'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_complements', {
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
      uuid: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      fecha_emision: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      rfc_emisor: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      rfc_receptor: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      complemento_data: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('payment_complements', ['profile_id']);
    await queryInterface.addIndex('payment_complements', ['uuid']);
    await queryInterface.addIndex('payment_complements', ['fecha_emision']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_complements');
  },
};
