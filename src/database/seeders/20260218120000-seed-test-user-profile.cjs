'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const testUserId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
    const testProfileId = crypto.randomUUID();

    const passwordHash = await bcrypt.hash('Prueba123!', 10);

    await queryInterface.bulkInsert('users', [
      {
        id: testUserId,
        email: 'prueba@contafy.test',
        password_hash: passwordHash,
        nombre: 'Usuario',
        apellido: 'Prueba Contafy',
        telefono: null,
        email_verified: true,
        email_verification_token: null,
        email_verification_expires: null,
        password_reset_token: null,
        password_reset_expires: null,
        trial_used: false,
        tour_version: null,
        tour_completed_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);

    await queryInterface.bulkInsert('profiles', [
      {
        id: testProfileId,
        user_id: testUserId,
        nombre: 'Perfil de Prueba Contafy',
        rfc: 'TST010101TSA',
        tipo_persona: 'MORAL',
        regimenes_fiscales: JSON.stringify(['601']),
        validaciones_habilitadas: JSON.stringify({}),
        frozen: false,
        frozen_reason: null,
        frozen_at: null,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('profiles', { rfc: 'TST010101TSA' }, {});
    await queryInterface.bulkDelete('users', { email: 'prueba@contafy.test' }, {});
  },
};
