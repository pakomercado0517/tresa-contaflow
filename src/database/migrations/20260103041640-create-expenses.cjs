'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('expenses', {
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
      tipo_origen: {
        type: Sequelize.ENUM('XML', 'MANUAL'),
        allowNull: false,
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
      concepto: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      categoria: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      uuid: {
        type: Sequelize.STRING,
        unique: true,
        allowNull: true,
        comment: 'UUID del CFDI (solo para XML)',
      },
      tipo: {
        type: Sequelize.ENUM('PUE', 'PPD', 'COMPLEMENTO_PAGO'),
        allowNull: true,
      },
      rfc_emisor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      nombre_emisor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      regimen_fiscal_emisor: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Clave SAT del régimen fiscal del emisor',
      },
      rfc_receptor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      nombre_receptor: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      regimen_fiscal_receptor: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Clave SAT del régimen fiscal del receptor',
      },
      pagos: {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false,
      },
      complemento_pago: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      validacion: {
        type: Sequelize.JSONB,
        defaultValue: {},
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

    await queryInterface.addIndex('expenses', ['profile_id']);
    await queryInterface.addIndex('expenses', ['uuid']);
    await queryInterface.addIndex('expenses', ['fecha']);
    await queryInterface.addIndex('expenses', ['mes', 'año']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('expenses');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_expenses_tipo_origen";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_expenses_tipo";');
  },
};
