'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Añadir columna regimenes_fiscales (array de claves SAT)
    await queryInterface.addColumn('profiles', 'regimenes_fiscales', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: Sequelize.literal("'[]'::jsonb"),
    });

    // Migrar datos: regimen_fiscal no nulo -> [regimen_fiscal], nulo -> []
    await queryInterface.sequelize.query(`
      UPDATE profiles
      SET regimenes_fiscales = jsonb_build_array(regimen_fiscal)
      WHERE regimen_fiscal IS NOT NULL AND regimen_fiscal != '';
    `);
    await queryInterface.sequelize.query(`
      UPDATE profiles
      SET regimenes_fiscales = '[]'::jsonb
      WHERE regimen_fiscal IS NULL OR regimen_fiscal = '';
    `);

    // Eliminar columna regimen_fiscal
    await queryInterface.removeColumn('profiles', 'regimen_fiscal');
  },

  async down(queryInterface, Sequelize) {
    // Restaurar columna regimen_fiscal
    await queryInterface.addColumn('profiles', 'regimen_fiscal', {
      type: Sequelize.STRING,
      allowNull: true,
      comment: 'Clave SAT del régimen fiscal (ej: 601, 603, etc.)',
    });

    // Migrar: primer elemento del array -> regimen_fiscal, array vacío -> null
    await queryInterface.sequelize.query(`
      UPDATE profiles
      SET regimen_fiscal = regimenes_fiscales->>0
      WHERE jsonb_array_length(regimenes_fiscales) > 0;
    `);
    await queryInterface.sequelize.query(`
      UPDATE profiles
      SET regimen_fiscal = NULL
      WHERE jsonb_array_length(regimenes_fiscales) = 0;
    `);

    await queryInterface.removeColumn('profiles', 'regimenes_fiscales');
  },
};
