'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'nombre', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('users', 'apellido', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('users', 'telefono', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'telefono');
    await queryInterface.removeColumn('users', 'apellido');
    await queryInterface.removeColumn('users', 'nombre');
  },
};

