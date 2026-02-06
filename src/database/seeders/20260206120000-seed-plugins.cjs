'use strict';

const crypto = require('crypto');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'plugins',
      [
        {
          id: crypto.randomUUID(),
          name: 'payroll',
          display_name: 'Procesamiento de Nómina',
          description: 'Carga y procesamiento de CFDI de nómina.',
          is_available: true,
          created_at: now,
          updated_at: now,
        },
        {
          id: crypto.randomUUID(),
          name: 'credit_notes',
          display_name: 'Notas de Crédito',
          description: 'Manejo de notas de crédito y cancelaciones (próximamente).',
          is_available: false,
          created_at: now,
          updated_at: now,
        },
      ],
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('plugins', {
      name: ['payroll', 'credit_notes'],
    }, {});
  },
};
