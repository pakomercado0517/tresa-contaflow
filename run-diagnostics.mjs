import { readFileSync } from 'fs';
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  logging: false,
});

// Consultas críticas para diagnóstico
const criticalQueries = {
  '1. Verificar si el UUID existe': `
    SELECT 
      id,
      profile_id,
      uuid,
      fecha_emision,
      rfc_emisor,
      rfc_receptor,
      created_at
    FROM payment_complements
    WHERE uuid = 'DD1C79DD-1ECA-4CFC-832E-EA3407C92C28';
  `,
  
  '2. Ver todos los índices en payment_complements': `
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE tablename = 'payment_complements'
    ORDER BY indexname;
  `,
  
  '3. Ver constraints únicos': `
    SELECT
      con.conname AS constraint_name,
      CASE 
        WHEN con.contype = 'u' THEN 'UNIQUE'
        WHEN con.contype = 'p' THEN 'PRIMARY KEY'
        WHEN con.contype = 'f' THEN 'FOREIGN KEY'
        ELSE 'OTHER'
      END AS constraint_type,
      pg_get_constraintdef(con.oid) AS constraint_definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'payment_complements'
      AND con.contype = 'u'
    ORDER BY con.conname;
  `,
  
  '4. Verificar índices duplicados sobre uuid': `
    SELECT 
      COUNT(*) as total_indices_uuid,
      STRING_AGG(indexname, ', ') as nombres_indices
    FROM pg_indexes
    WHERE tablename = 'payment_complements'
      AND indexdef LIKE '%uuid%';
  `,
  
  '5. Ver detalles de índices sobre uuid': `
    SELECT 
      i.indexname,
      i.indexdef,
      idx.indisunique as is_unique
    FROM pg_indexes i
    JOIN pg_class c ON c.relname = i.indexname
    JOIN pg_index idx ON idx.indexrelid = c.oid
    WHERE i.tablename = 'payment_complements'
      AND i.indexdef LIKE '%uuid%';
  `,
  
  '6. Verificar UUIDs duplicados en datos': `
    SELECT 
      uuid,
      COUNT(*) as cantidad,
      STRING_AGG(id::text, ', ') as ids
    FROM payment_complements
    GROUP BY uuid
    HAVING COUNT(*) > 1
    ORDER BY cantidad DESC;
  `,
  
  '7. Buscar UUID con diferentes formatos': `
    SELECT 
      id,
      uuid,
      LENGTH(uuid) as longitud,
      UPPER(uuid) as uuid_uppercase
    FROM payment_complements
    WHERE uuid LIKE '%DD1C79DD%'
       OR UPPER(uuid) = UPPER('DD1C79DD-1ECA-4CFC-832E-EA3407C92C28');
  `,
};

async function runDiagnostics() {
  try {
    console.log('🔌 Conectando a la base de datos...\n');
    await sequelize.authenticate();
    console.log('✅ Conectado exitosamente\n');
    console.log('='.repeat(70));
    console.log('DIAGNÓSTICO: Error UUID Duplicado - payment_complements');
    console.log('='.repeat(70));
    console.log('UUID problemático: DD1C79DD-1ECA-4CFC-832E-EA3407C92C28\n');

    for (const [title, query] of Object.entries(criticalQueries)) {
      console.log('\n' + '─'.repeat(70));
      console.log(`📊 ${title}`);
      console.log('─'.repeat(70));
      
      try {
        const [results] = await sequelize.query(query.trim());
        
        if (Array.isArray(results) && results.length === 0) {
          console.log('   ℹ️  No se encontraron resultados');
        } else {
          // Formatear resultados de forma legible
          console.table(results);
          
          // Si es la consulta de índices duplicados, mostrar advertencia
          if (title.includes('duplicados') && results[0]?.total_indices_uuid > 1) {
            console.log('\n   ⚠️  ADVERTENCIA: Se encontraron múltiples índices sobre uuid!');
            console.log('   Esto podría ser la causa del problema.');
          }
        }
      } catch (error) {
        console.error(`   ❌ Error ejecutando consulta: ${error.message}`);
        if (error.message.includes('permission denied')) {
          console.log('   ⚠️  No tienes permisos para ejecutar esta consulta');
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Diagnóstico completado');
    console.log('='.repeat(70));
    console.log('\n📝 Revisa los resultados, especialmente:');
    console.log('   - Sección 2: Si hay múltiples índices sobre uuid');
    console.log('   - Sección 3: Si hay constraints duplicados');
    console.log('   - Sección 4: Confirmación de índices duplicados');
    console.log('   - Sección 6: Si hay UUIDs duplicados en los datos\n');

  } catch (error) {
    console.error('\n❌ Error de conexión:', error.message);
    console.log('\n💡 Verifica que:');
    console.log('   1. DATABASE_URL esté correcta en .env');
    console.log('   2. La base de datos esté accesible');
    console.log('   3. Las credenciales sean correctas\n');
  } finally {
    await sequelize.close();
    console.log('🔌 Conexión cerrada\n');
  }
}

runDiagnostics();
