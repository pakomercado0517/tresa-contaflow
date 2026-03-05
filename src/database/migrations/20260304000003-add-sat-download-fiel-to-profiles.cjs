'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('profiles', 'fiel_cer_encrypted', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('profiles', 'fiel_key_encrypted', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('profiles', 'fiel_password_encrypted', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('profiles', 'sat_download_last_sync_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('profiles', 'sat_download_sync_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('profiles', 'sat_download_sync_enabled');
    await queryInterface.removeColumn('profiles', 'sat_download_last_sync_at');
    await queryInterface.removeColumn('profiles', 'fiel_password_encrypted');
    await queryInterface.removeColumn('profiles', 'fiel_key_encrypted');
    await queryInterface.removeColumn('profiles', 'fiel_cer_encrypted');
  },
};
