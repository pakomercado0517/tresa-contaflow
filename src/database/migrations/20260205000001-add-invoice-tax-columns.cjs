'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // subtotal ya existe en invoices, no se agrega

    // Agregar columnas de impuestos
    await queryInterface.addColumn('invoices', 'iva_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.sequelize.query(`
      UPDATE invoices SET iva_amount = iva WHERE iva_amount = 0;
    `);

    await queryInterface.addColumn('invoices', 'retencion_iva_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn('invoices', 'retencion_isr_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('invoices', 'retencion_isr_amount');
    await queryInterface.removeColumn('invoices', 'retencion_iva_amount');
    await queryInterface.removeColumn('invoices', 'iva_amount');
  },
};
