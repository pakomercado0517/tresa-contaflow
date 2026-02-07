'use strict';

/**
 * Catálogo oficial de Regímenes Fiscales (c_RegimenFiscal) del SAT.
 * Fuente: Anexo 20 CFDI 4.0 - Vigencia desde 2022-01-01
 * https://www.sat.gob.mx/consulta/21269/conoce-los-regimenes-fiscales
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sat_regimenes_fiscales', {
      clave: {
        type: Sequelize.STRING(10),
        primaryKey: true,
        allowNull: false,
        comment: 'Clave del régimen fiscal (catálogo SAT c_RegimenFiscal)',
      },
      descripcion: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Descripción oficial del régimen fiscal',
      },
      aplica_persona_fisica: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Aplica a personas físicas',
      },
      aplica_persona_moral: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Aplica a personas morales',
      },
      vigente: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Si el régimen está vigente según el SAT',
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

    await queryInterface.addIndex('sat_regimenes_fiscales', ['aplica_persona_fisica'], {
      name: 'sat_regimenes_fiscales_pf_idx',
    });
    await queryInterface.addIndex('sat_regimenes_fiscales', ['aplica_persona_moral'], {
      name: 'sat_regimenes_fiscales_pm_idx',
    });
    await queryInterface.addIndex('sat_regimenes_fiscales', ['vigente'], {
      name: 'sat_regimenes_fiscales_vigente_idx',
    });

    // Datos del catálogo c_RegimenFiscal SAT (Anexo 20 CFDI 4.0)
    const regimenes = [
      // Personas Morales
      { clave: '601', descripcion: 'General de Ley Personas Morales', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '603', descripcion: 'Personas Morales con Fines no Lucrativos', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '607', descripcion: 'Régimen de Enajenación o Adquisición de Bienes', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '609', descripcion: 'Consolidación', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '620', descripcion: 'Sociedades Cooperativas de Producción que optan por Diferir sus Ingresos', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '623', descripcion: 'Opcional para Grupos de Sociedades', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '624', descripcion: 'Coordinados', aplica_persona_fisica: false, aplica_persona_moral: true },
      { clave: '628', descripcion: 'Hidrocarburos', aplica_persona_fisica: false, aplica_persona_moral: true },
      // Personas Físicas
      { clave: '605', descripcion: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '606', descripcion: 'Arrendamiento', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '608', descripcion: 'Demás ingresos', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '611', descripcion: 'Ingresos por Dividendos (socios y accionistas)', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '612', descripcion: 'Personas Físicas con Actividades Empresariales y Profesionales', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '614', descripcion: 'Ingresos por intereses', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '615', descripcion: 'Régimen de los ingresos por obtención de premios', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '616', descripcion: 'Sin obligaciones fiscales', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '621', descripcion: 'Incorporación Fiscal', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '625', descripcion: 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '629', descripcion: 'De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales', aplica_persona_fisica: true, aplica_persona_moral: false },
      { clave: '630', descripcion: 'Enajenación de acciones en bolsa de valores', aplica_persona_fisica: true, aplica_persona_moral: false },
      // Aplican a ambos (622 y 626)
      { clave: '622', descripcion: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', aplica_persona_fisica: true, aplica_persona_moral: true },
      { clave: '626', descripcion: 'Régimen Simplificado de Confianza (RESICO)', aplica_persona_fisica: true, aplica_persona_moral: true },
    ];

    const now = new Date();
    await queryInterface.bulkInsert(
      'sat_regimenes_fiscales',
      regimenes.map((r) => ({
        clave: r.clave,
        descripcion: r.descripcion,
        aplica_persona_fisica: r.aplica_persona_fisica,
        aplica_persona_moral: r.aplica_persona_moral,
        vigente: true,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sat_regimenes_fiscales');
  },
};
