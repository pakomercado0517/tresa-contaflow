'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoices', {
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
        unique: true,
        allowNull: false,
        comment: 'UUID del CFDI',
      },
      fecha: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      mes: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      año: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      total: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      subtotal: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      iva: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
      },
      tipo: {
        type: Sequelize.ENUM('PUE', 'PPD', 'COMPLEMENTO_PAGO'),
        allowNull: false,
      },
      rfc_emisor: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      nombre_emisor: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      regimen_fiscal_emisor: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Clave SAT del régimen fiscal del emisor',
      },
      rfc_receptor: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      nombre_receptor: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      regimen_fiscal_receptor: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Clave SAT del régimen fiscal del receptor',
      },
      concepto: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      pagos: {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false,
        comment: 'Array de pagos parciales (para PPD)',
      },
      complemento_pago: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Datos de complemento de pago',
      },
      validacion: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false,
        comment: 'Estado de validación',
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

    await queryInterface.addIndex('invoices', ['profile_id']);
    await queryInterface.addIndex('invoices', ['uuid']);
    await queryInterface.addIndex('invoices', ['fecha']);
    await queryInterface.addIndex('invoices', ['mes', 'año']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('invoices');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_tipo";');
  },
};
