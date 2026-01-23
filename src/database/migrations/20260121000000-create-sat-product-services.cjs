'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sat_product_services', {
      id: {
        type: Sequelize.STRING,
        primaryKey: true,
        allowNull: false,
        comment: 'Clave del producto/servicio del SAT',
      },
      descripcion: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Descripción del producto o servicio',
      },
      incluir_iva_trasladado: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Indica si incluye IVA trasladado (Sí, No, Opcional)',
      },
      incluir_ieps_trasladado: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Indica si incluye IEPS trasladado (Sí, No, Opcional)',
      },
      complemento_que_debe_incluir: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Complemento que debe incluir el producto/servicio',
      },
      fecha_inicio_vigencia: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Fecha de inicio de vigencia del producto/servicio',
      },
      fecha_fin_vigencia: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Fecha de fin de vigencia (null si está vigente)',
      },
      estimulo_franja_fronteriza: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Código de estímulo franja fronteriza',
      },
      palabras_similares: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Palabras similares para búsquedas mejoradas',
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

    // Índice único en id
    await queryInterface.addIndex('sat_product_services', ['id'], {
      unique: true,
      name: 'sat_product_services_id_unique',
    });

    // Índices para búsquedas
    await queryInterface.addIndex('sat_product_services', ['incluir_iva_trasladado'], {
      name: 'sat_product_services_iva_idx',
    });

    await queryInterface.addIndex('sat_product_services', ['incluir_ieps_trasladado'], {
      name: 'sat_product_services_ieps_idx',
    });

    await queryInterface.addIndex('sat_product_services', ['fecha_inicio_vigencia'], {
      name: 'sat_product_services_fecha_inicio_idx',
    });

    await queryInterface.addIndex('sat_product_services', ['fecha_fin_vigencia'], {
      name: 'sat_product_services_fecha_fin_idx',
    });

    // Habilitar extensión pg_trgm para búsquedas de texto mejoradas (si no está habilitada)
    await queryInterface.sequelize.query(
      'CREATE EXTENSION IF NOT EXISTS pg_trgm;',
      { raw: true }
    );

    // Índices GIN para búsqueda full-text en descripcion y palabras_similares
    await queryInterface.sequelize.query(
      `CREATE INDEX sat_product_services_descripcion_gin_idx 
       ON sat_product_services USING gin (descripcion gin_trgm_ops);`,
      { raw: true }
    );

    await queryInterface.sequelize.query(
      `CREATE INDEX sat_product_services_palabras_similares_gin_idx 
       ON sat_product_services USING gin (palabras_similares gin_trgm_ops) 
       WHERE palabras_similares IS NOT NULL;`,
      { raw: true }
    );
  },

  async down(queryInterface, Sequelize) {
    // Eliminar índices GIN primero
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS sat_product_services_descripcion_gin_idx;',
      { raw: true }
    );

    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS sat_product_services_palabras_similares_gin_idx;',
      { raw: true }
    );

    // Eliminar tabla (los índices se eliminan automáticamente)
    await queryInterface.dropTable('sat_product_services');
  },
};
