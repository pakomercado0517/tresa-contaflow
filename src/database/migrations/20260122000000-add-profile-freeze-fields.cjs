'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Agregar columnas para feature Profile Freeze
    await queryInterface.addColumn('profiles', 'frozen', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Indica si el perfil está congelado',
    });

    await queryInterface.addColumn('profiles', 'frozen_reason', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Razón por la cual el perfil fue congelado',
    });

    await queryInterface.addColumn('profiles', 'frozen_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Fecha y hora en que el perfil fue congelado',
    });

    // Agregar constraint para validar frozen_reason
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
      ADD CONSTRAINT chk_frozen_reason
      CHECK (
        frozen_reason IS NULL OR 
        frozen_reason IN ('plan_limit', 'user_suspension', 'payment_issue')
      );
    `);

    // Crear índices para optimizar queries
    await queryInterface.addIndex('profiles', ['frozen'], {
      name: 'idx_profiles_frozen',
    });

    await queryInterface.addIndex('profiles', ['user_id', 'frozen'], {
      name: 'idx_profiles_user_frozen',
    });

    await queryInterface.addIndex('profiles', ['frozen_at'], {
      name: 'idx_profiles_frozen_at',
      where: { frozen: true },
    });
  },

  async down(queryInterface, Sequelize) {
    // Eliminar índices
    await queryInterface.removeIndex('profiles', 'idx_profiles_frozen_at');
    await queryInterface.removeIndex('profiles', 'idx_profiles_user_frozen');
    await queryInterface.removeIndex('profiles', 'idx_profiles_frozen');

    // Eliminar constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE profiles
      DROP CONSTRAINT IF EXISTS chk_frozen_reason;
    `);

    // Eliminar columnas
    await queryInterface.removeColumn('profiles', 'frozen_at');
    await queryInterface.removeColumn('profiles', 'frozen_reason');
    await queryInterface.removeColumn('profiles', 'frozen');
  },
};
