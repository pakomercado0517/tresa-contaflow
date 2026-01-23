'use strict';

const fs = require('fs');
const path = require('path');

/** @type {import('sequelize-cli').Seeder} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const jsonFilePath = process.env.SAT_CATALOG_JSON_PATH || path.join(__dirname, '../../data/sat-product-services.json');
    
    // Verificar que el archivo existe
    if (!fs.existsSync(jsonFilePath)) {
      console.warn(`⚠️  Archivo JSON no encontrado en: ${jsonFilePath}`);
      console.warn('Por favor, coloca el archivo JSON del catálogo SAT en la ruta especificada.');
      console.warn('O configura la variable de entorno SAT_CATALOG_JSON_PATH con la ruta correcta.');
      throw new Error(`Archivo JSON no encontrado: ${jsonFilePath}`);
    }

    console.log(`📂 Cargando catálogo SAT desde: ${jsonFilePath}`);
    
    // Leer y parsear el JSON
    const jsonContent = fs.readFileSync(jsonFilePath, 'utf-8');
    const catalogData = JSON.parse(jsonContent);

    if (!Array.isArray(catalogData)) {
      throw new Error('El archivo JSON debe contener un array de objetos');
    }

    console.log(`📊 Total de registros a cargar: ${catalogData.length}`);

    // Función para convertir fecha de formato "DD-MM-YYYY" a Date
    const parseDate = (dateString) => {
      if (!dateString || dateString.trim() === '') {
        return null;
      }
      
      // Formato esperado: "DD-MM-YYYY"
      const [day, month, year] = dateString.split('-');
      if (!day || !month || !year) {
        return null;
      }
      
      // Crear fecha en formato YYYY-MM-DD para PostgreSQL
      const date = new Date(`${year}-${month}-${day}`);
      if (isNaN(date.getTime())) {
        console.warn(`⚠️  Fecha inválida: ${dateString}, usando null`);
        return null;
      }
      
      return date;
    };

    // Transformar datos del JSON al formato de la BD
    const transformedData = catalogData.map((item) => {
      return {
        id: item.id,
        descripcion: item.descripcion || '',
        incluir_iva_trasladado: item.incluirIVATrasladado || 'Opcional',
        incluir_ieps_trasladado: item.incluirIEPSTrasladado || 'Opcional',
        complemento_que_debe_incluir: item.complementoQueDebeIncluir && item.complementoQueDebeIncluir.trim() !== '' 
          ? item.complementoQueDebeIncluir 
          : null,
        fecha_inicio_vigencia: parseDate(item.fechaInicioVigencia),
        fecha_fin_vigencia: parseDate(item.fechaFinVigencia),
        estimulo_franja_fronteriza: item.estimuloFranjaFronteriza || '',
        palabras_similares: item.palabrasSimilares && item.palabrasSimilares.trim() !== '' 
          ? item.palabrasSimilares 
          : null,
        created_at: new Date(),
        updated_at: new Date(),
      };
    });

    // Validar que no haya IDs duplicados
    const ids = transformedData.map(item => item.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      throw new Error(`IDs duplicados encontrados: ${duplicates.join(', ')}`);
    }

    // Limpiar tabla antes de insertar (opcional, comentar si quieres mantener datos existentes)
    console.log('🗑️  Limpiando tabla existente...');
    await queryInterface.bulkDelete('sat_product_services', {}, {});

    // Insertar en lotes para optimizar rendimiento
    const BATCH_SIZE = 1000; // Ajustar según el tamaño de los registros
    let inserted = 0;
    let errors = 0;

    console.log(`🚀 Insertando datos en lotes de ${BATCH_SIZE}...`);

    for (let i = 0; i < transformedData.length; i += BATCH_SIZE) {
      const batch = transformedData.slice(i, i + BATCH_SIZE);
      
      try {
        await queryInterface.bulkInsert('sat_product_services', batch, {
          ignoreDuplicates: true, // Ignorar duplicados si existen
        });
        inserted += batch.length;
        console.log(`✅ Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${inserted}/${transformedData.length} registros insertados`);
      } catch (error) {
        errors++;
        console.error(`❌ Error en lote ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
        // Continuar con el siguiente lote
      }
    }

    console.log(`\n✨ Proceso completado:`);
    console.log(`   - Registros insertados: ${inserted}`);
    console.log(`   - Errores: ${errors}`);
    console.log(`   - Total procesado: ${transformedData.length}`);
  },

  async down(queryInterface, Sequelize) {
    // Eliminar todos los registros
    await queryInterface.bulkDelete('sat_product_services', {}, {});
    console.log('🗑️  Catálogo SAT eliminado');
  },
};
