'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Renombrar tabla expenses -> accrued_expenses
    await queryInterface.renameTable('expenses', 'accrued_expenses');

    // 2. Agregar nuevas columnas
    await queryInterface.addColumn('accrued_expenses', 'iva_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.sequelize.query(`
      UPDATE accrued_expenses SET iva_amount = iva WHERE iva_amount = 0;
    `);
    await queryInterface.addColumn('accrued_expenses', 'retencion_iva_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('accrued_expenses', 'retencion_isr_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn('accrued_expenses', 'is_paid', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // 4. Agregar índices en tipo_origen e is_paid
    await queryInterface.addIndex('accrued_expenses', ['tipo_origen']);
    await queryInterface.addIndex('accrued_expenses', ['is_paid']);
  },

  async down(queryInterface) {
    // Quitar índices
    await queryInterface.removeIndex('accrued_expenses', ['tipo_origen']);
    await queryInterface.removeIndex('accrued_expenses', ['is_paid']);

    // Quitar columnas agregadas
    await queryInterface.removeColumn('accrued_expenses', 'is_paid');
    await queryInterface.removeColumn('accrued_expenses', 'retencion_isr_amount');
    await queryInterface.removeColumn('accrued_expenses', 'retencion_iva_amount');
    await queryInterface.removeColumn('accrued_expenses', 'iva_amount');

    // Renombrar tabla accrued_expenses -> expenses
    await queryInterface.renameTable('accrued_expenses', 'expenses');
  },
};
