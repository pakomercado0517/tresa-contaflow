'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('profiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      nombre: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      rfc: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      tipo_persona: {
        type: Sequelize.ENUM('FISICA', 'MORAL'),
        allowNull: false,
      },
      regimen_fiscal: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Clave SAT del régimen fiscal (ej: 601, 603, etc.)',
      },
      validaciones_habilitadas: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('profiles', ['user_id']);
    await queryInterface.addIndex('profiles', ['user_id', 'rfc'], {
      unique: true,
      name: 'profiles_user_id_rfc_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('profiles');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_profiles_tipo_persona";');
  },
};
