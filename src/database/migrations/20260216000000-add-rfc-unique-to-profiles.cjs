'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Remover el índice único (user_id, rfc) que permitía RFCs duplicados entre usuarios
    await queryInterface.removeIndex('profiles', 'profiles_user_id_rfc_unique');

    // Agregar índice único global en rfc: un RFC solo puede existir en una cuenta
    await queryInterface.addIndex('profiles', ['rfc'], {
      unique: true,
      name: 'profiles_rfc_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    // Remover índice único en rfc
    await queryInterface.removeIndex('profiles', 'profiles_rfc_unique');

    // Restaurar índice único (user_id, rfc)
    await queryInterface.addIndex('profiles', ['user_id', 'rfc'], {
      unique: true,
      name: 'profiles_user_id_rfc_unique',
    });
  },
};
