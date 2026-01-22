'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sat_search_logs', {
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
      search_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Tipo de búsqueda: basic, ai_similarity, ai_search',
      },
      query: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Query de búsqueda utilizado',
      },
      results_count: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Número de resultados retornados',
      },
      mes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Mes de la búsqueda (1-12)',
      },
      año: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Año de la búsqueda',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Índices para búsquedas rápidas
    await queryInterface.addIndex('sat_search_logs', ['user_id'], {
      name: 'sat_search_logs_user_id_idx',
    });

    await queryInterface.addIndex('sat_search_logs', ['user_id', 'año', 'mes', 'search_type'], {
      name: 'sat_search_logs_user_month_type_idx',
    });

    await queryInterface.addIndex('sat_search_logs', ['created_at'], {
      name: 'sat_search_logs_created_at_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sat_search_logs');
  },
};
