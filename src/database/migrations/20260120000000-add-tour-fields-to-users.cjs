'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'tour_version', {
      type: Sequelize.STRING(50),
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addColumn('users', 'tour_completed_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'tour_completed_at');
    await queryInterface.removeColumn('users', 'tour_version');
  },
};
