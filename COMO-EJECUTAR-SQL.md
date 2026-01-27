# Cómo Ejecutar el Archivo SQL de Diagnóstico

Este documento explica diferentes formas de ejecutar el archivo `diagnostic-queries.sql` en tu base de datos PostgreSQL.

## 📋 Información de tu Base de Datos

Según tu `.env`, estás usando Railway:
- **Host**: `yamanote.proxy.rlwy.net`
- **Puerto**: `57592`
- **Base de datos**: `railway`
- **Usuario**: `postgres`
- **Requiere SSL**: Sí (Railway)

---

## 🔧 Opción 1: Usando psql (Línea de Comandos)

### Requisitos
- Tener PostgreSQL instalado localmente (incluye `psql`)
- O usar Railway CLI

### Paso 1: Conectarte a la base de datos

**Desde tu terminal (bash/cmd):**

```bash
# Opción A: Usando la URL completa (Windows)
psql "postgresql://postgres:eHulqypbpBEsmAIupMUpEAUhNZpJuZpI@yamanote.proxy.rlwy.net:57592/railway?sslmode=require"

# Opción B: Usando variables de entorno (más seguro)
# Primero carga las variables desde .env
export DATABASE_URL="postgresql://postgres:eHulqypbpBEsmAIupMUpEAUhNZpJuZpI@yamanote.proxy.rlwy.net:57592/railway?sslmode=require"
psql "$DATABASE_URL"
```

### Paso 2: Ejecutar el archivo SQL

Una vez conectado, puedes ejecutar el archivo de dos formas:

**Opción A: Desde psql (copiar y pegar)**
```sql
-- Copia y pega las consultas que necesites del archivo diagnostic-queries.sql
-- Ejecuta sección por sección
```

**Opción B: Ejecutar el archivo completo desde la terminal**
```bash
# Desde fuera de psql, ejecuta:
psql "postgresql://postgres:eHulqypbpBEsmAIupMUpEAUhNZpJuZpI@yamanote.proxy.rlwy.net:57592/railway?sslmode=require" -f diagnostic-queries.sql

# O si ya tienes la variable DATABASE_URL:
psql "$DATABASE_URL" -f diagnostic-queries.sql
```

---

## 🖥️ Opción 2: Usando Herramientas GUI

### 2.1 pgAdmin

1. **Descargar e instalar**: [https://www.pgadmin.org/download/](https://www.pgadmin.org/download/)

2. **Agregar servidor**:
   - Click derecho en "Servers" → "Create" → "Server"
   - **General tab**: Nombre: "Railway"
   - **Connection tab**:
     - Host: `yamanote.proxy.rlwy.net`
     - Port: `57592`
     - Database: `railway`
     - Username: `postgres`
     - Password: `eHulqypbpBEsmAIupMUpEAUhNZpJuZpI`
   - **SSL tab**:
     - SSL mode: `Require`

3. **Ejecutar SQL**:
   - Conecta al servidor
   - Click derecho en la base de datos `railway` → "Query Tool"
   - Abre el archivo `diagnostic-queries.sql`
   - Ejecuta las consultas (puedes seleccionar secciones específicas)

### 2.2 DBeaver

1. **Descargar e instalar**: [https://dbeaver.io/download/](https://dbeaver.io/download/)

2. **Crear conexión**:
   - Click en "New Database Connection"
   - Selecciona "PostgreSQL"
   - **Main tab**:
     - Host: `yamanote.proxy.rlwy.net`
     - Port: `57592`
     - Database: `railway`
     - Username: `postgres`
     - Password: `eHulqypbpBEsmAIupMUpEAUhNZpJuZpI`
   - **SSL tab**:
     - Enable SSL: ✅
     - SSL Mode: `require`

3. **Ejecutar SQL**:
   - Conecta a la base de datos
   - Click derecho en la conexión → "SQL Editor" → "New SQL Script"
   - Abre el archivo `diagnostic-queries.sql`
   - Selecciona las consultas que quieras ejecutar y presiona `Ctrl+Enter` (o `Cmd+Enter` en Mac)

### 2.3 TablePlus (Mac/Windows)

1. **Descargar**: [https://tableplus.com/](https://tableplus.com/)

2. **Crear conexión**:
   - Click en "Create a new connection"
   - Selecciona "PostgreSQL"
   - Completa:
     - Name: `Railway`
     - Host: `yamanote.proxy.rlwy.net`
     - Port: `57592`
     - User: `postgres`
     - Password: `eHulqypbpBEsmAIupMUpEAUhNZpJuZpI`
     - Database: `railway`
     - SSL: `Require`

3. **Ejecutar SQL**:
   - Conecta a la base de datos
   - Click en "New Query"
   - Abre el archivo `diagnostic-queries.sql`
   - Ejecuta las consultas

---

## 💻 Opción 3: Desde Railway Dashboard

Si tienes acceso al dashboard de Railway:

1. Ve a tu proyecto en [Railway](https://railway.app)
2. Selecciona tu servicio de PostgreSQL
3. Click en "Query" o "Data" tab
4. Copia y pega las consultas del archivo SQL
5. Ejecuta sección por sección

---

## 🚀 Opción 4: Usar el Script Node.js Incluido (RECOMENDADO)

**Ya está creado el archivo `run-diagnostics.mjs`** que ejecuta las consultas más importantes automáticamente.

### Ejecutar el script:

```bash
# Desde la raíz del proyecto
node run-diagnostics.mjs
```

Este script:
- ✅ Se conecta automáticamente usando tu `.env`
- ✅ Ejecuta las 7 consultas más críticas
- ✅ Muestra los resultados formateados
- ✅ Identifica problemas automáticamente

**Es la forma más rápida y fácil de diagnosticar el problema.**

---

## 🛠️ Opción 5: Crear un Script Node.js Personalizado

Si prefieres crear tu propio script:

```javascript
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

async function runDiagnostics() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos');

    // Leer el archivo SQL
    const sql = readFileSync('diagnostic-queries.sql', 'utf8');
    
    // Dividir por secciones (cada sección termina con --)
    const sections = sql.split(/^-- =+$/m).filter(s => s.trim());
    
    console.log(`\n📊 Encontradas ${sections.length} secciones\n`);
    
    // Ejecutar cada sección
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const lines = section.split('\n');
      const title = lines.find(l => l.trim().startsWith('--')) || `Sección ${i + 1}`;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(title);
      console.log('='.repeat(60));
      
      // Extraer solo las consultas SQL (ignorar comentarios)
      const queries = section
        .split(';')
        .map(q => q.trim())
        .filter(q => q && !q.startsWith('--') && !q.match(/^\/\*/));
      
      for (const query of queries) {
        if (query) {
          try {
            const [results] = await sequelize.query(query);
            console.log('\n📋 Resultados:');
            console.table(results);
          } catch (error) {
            console.error('❌ Error en consulta:', error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await sequelize.close();
  }
}

runDiagnostics();
```

### Ejecutar:

```bash
node run-diagnostics.js
```

---

## 📝 Recomendación: Ejecutar Sección por Sección

**No ejecutes todo el archivo de una vez.** Te recomiendo:

1. **Empezar con la Sección 1** (verificar si el UUID existe)
2. **Luego la Sección 2** (verificar índices y constraints) - **MUY IMPORTANTE**
3. **Sección 3** (índices duplicados) - **MUY IMPORTANTE**
4. **Sección 6** (datos duplicados)

### Ejemplo de ejecución paso a paso:

```sql
-- 1. Primero verifica si el UUID existe
SELECT * FROM payment_complements 
WHERE uuid = 'DD1C79DD-1ECA-4CFC-832E-EA3407C92C28';

-- 2. Luego verifica los índices (ESTA ES LA MÁS IMPORTANTE)
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'payment_complements'
ORDER BY indexname;

-- 3. Verifica constraints
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'payment_complements';
```

---

## ⚠️ Notas Importantes

1. **No ejecutes la Sección 10** (consultas de limpieza) a menos que estés seguro de lo que haces
2. **Guarda los resultados** de cada sección para compartirlos
3. **Ejecuta las consultas en orden** para entender mejor el problema
4. **La Sección 2 y 3 son críticas** - probablemente ahí está el problema

---

## 🆘 Si tienes problemas de conexión

### Error: "SSL required"
Asegúrate de incluir `?sslmode=require` en la URL de conexión.

### Error: "Connection refused"
Verifica que:
- El host y puerto sean correctos
- No haya firewall bloqueando la conexión
- Railway no haya cambiado las credenciales

### Error: "Password authentication failed"
Verifica que la contraseña en `.env` sea correcta.

---

## 📤 Compartir Resultados

Una vez que ejecutes las consultas, comparte los resultados de:
- **Sección 1**: Si encontró el UUID o no
- **Sección 2**: Lista de índices y constraints
- **Sección 3**: Si hay índices duplicados
- **Sección 6**: Si hay UUIDs duplicados en los datos

Con esa información podremos identificar la causa exacta del problema.
