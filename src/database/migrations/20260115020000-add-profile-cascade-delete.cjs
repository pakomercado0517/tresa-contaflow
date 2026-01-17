'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "invoices"
      DROP CONSTRAINT IF EXISTS "invoices_profile_id_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_profile_id_fkey"
      FOREIGN KEY ("profile_id")
      REFERENCES "profiles" ("id")
      ON UPDATE CASCADE
      ON DELETE CASCADE;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "expenses"
      DROP CONSTRAINT IF EXISTS "expenses_profile_id_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_profile_id_fkey"
      FOREIGN KEY ("profile_id")
      REFERENCES "profiles" ("id")
      ON UPDATE CASCADE
      ON DELETE CASCADE;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "invoices"
      DROP CONSTRAINT IF EXISTS "invoices_profile_id_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "invoices"
      ADD CONSTRAINT "invoices_profile_id_fkey"
      FOREIGN KEY ("profile_id")
      REFERENCES "profiles" ("id")
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE "expenses"
      DROP CONSTRAINT IF EXISTS "expenses_profile_id_fkey";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "expenses"
      ADD CONSTRAINT "expenses_profile_id_fkey"
      FOREIGN KEY ("profile_id")
      REFERENCES "profiles" ("id")
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
    `);
  },
};
