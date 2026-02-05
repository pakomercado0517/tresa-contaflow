-- ============================================
-- CONSULTAS DE DIAGNÓSTICO: Error UUID Duplicado
-- Tabla: payment_complements
-- UUID problemático: DD1C79DD-1ECA-4CFC-832E-EA3407C92C28
-- ============================================

-- ============================================
-- 1. VERIFICAR SI EL UUID EXISTE EN LA TABLA
-- ============================================
-- Buscar el UUID exacto (case-sensitive)
SELECT 
    id,
    profile_id,
    uuid,
    fecha_emision,
    rfc_emisor,
    rfc_receptor,
    created_at,
    updated_at
FROM payment_complements
WHERE uuid = 'DD1C79DD-1ECA-4CFC-832E-EA3407C92C28';

-- Buscar el UUID con case-insensitive (por si hay diferencia de mayúsculas/minúsculas)
SELECT 
    id,
    profile_id,
    uuid,
    fecha_emision,
    rfc_emisor,
    rfc_receptor,
    created_at,
    updated_at
FROM payment_complements
WHERE UPPER(uuid) = UPPER('DD1C79DD-1ECA-4CFC-832E-EA3407C92C28');

-- Buscar el UUID con LIKE (por si hay espacios o caracteres adicionales)
SELECT 
    id,
    profile_id,
    uuid,
    LENGTH(uuid) as uuid_length,
    fecha_emision,
    rfc_emisor,
    rfc_receptor,
    created_at,
    updated_at
FROM payment_complements
WHERE uuid LIKE '%DD1C79DD-1ECA-4CFC-832E-EA3407C92C28%';

-- Buscar variaciones del UUID (sin guiones, con espacios, etc.)
SELECT 
    id,
    profile_id,
    uuid,
    REPLACE(uuid, '-', '') as uuid_sin_guiones,
    TRIM(uuid) as uuid_sin_espacios,
    LENGTH(uuid) as longitud,
    fecha_emision
FROM payment_complements
WHERE REPLACE(UPPER(uuid), '-', '') = REPLACE(UPPER('DD1C79DD-1ECA-4CFC-832E-EA3407C92C28'), '-', '');

-- ============================================
-- 2. VERIFICAR ÍNDICES Y CONSTRAINTS
-- ============================================
-- Ver todos los índices en la tabla payment_complements
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'payment_complements'
ORDER BY indexname;

-- Ver todos los constraints (incluyendo unique constraints)
SELECT
    con.conname AS constraint_name,
    con.contype AS constraint_type,
    CASE 
        WHEN con.contype = 'u' THEN 'UNIQUE'
        WHEN con.contype = 'p' THEN 'PRIMARY KEY'
        WHEN con.contype = 'f' THEN 'FOREIGN KEY'
        WHEN con.contype = 'c' THEN 'CHECK'
        ELSE 'OTHER'
    END AS constraint_type_name,
    pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE rel.relname = 'payment_complements'
ORDER BY con.contype, con.conname;

-- Ver específicamente el constraint único sobre uuid
SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS constraint_definition,
    a.attname AS column_name
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
WHERE rel.relname = 'payment_complements'
  AND con.contype = 'u'
  AND a.attname = 'uuid';

-- ============================================
-- 3. VERIFICAR SI HAY ÍNDICES DUPLICADOS
-- ============================================
-- Contar cuántos índices hay sobre la columna uuid
SELECT 
    COUNT(*) as total_indices_uuid,
    STRING_AGG(indexname, ', ') as nombres_indices
FROM pg_indexes
WHERE tablename = 'payment_complements'
  AND indexdef LIKE '%uuid%';

-- Ver detalles de cada índice relacionado con uuid
SELECT 
    i.indexname,
    i.indexdef,
    idx.indisunique as is_unique,
    idx.indisprimary as is_primary
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
JOIN pg_index idx ON idx.indexrelid = c.oid
WHERE i.tablename = 'payment_complements'
  AND i.indexdef LIKE '%uuid%';

-- ============================================
-- 4. VERIFICAR ESTADO DEL ÍNDICE (CORRUPCIÓN)
-- ============================================
-- Verificar si el índice está corrupto o necesita REINDEX
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans_realizados,
    idx_tup_read as tuplas_leidas,
    idx_tup_fetch as tuplas_obtenidas
FROM pg_stat_user_indexes
WHERE tablename = 'payment_complements'
  AND indexname LIKE '%uuid%';

-- Ver el tamaño del índice
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename = 'payment_complements'
  AND indexname LIKE '%uuid%';

-- ============================================
-- 5. VERIFICAR TRANSACCIONES ACTIVAS
-- ============================================
-- Ver si hay transacciones activas que puedan estar bloqueando
SELECT 
    pid,
    usename,
    application_name,
    state,
    query_start,
    state_change,
    wait_event_type,
    wait_event,
    query
FROM pg_stat_activity
WHERE state = 'active'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- Ver locks en la tabla payment_complements
SELECT 
    l.locktype,
    l.database,
    l.relation::regclass,
    l.page,
    l.tuple,
    l.virtualxid,
    l.transactionid,
    l.mode,
    l.granted,
    a.usename,
    a.query,
    a.query_start,
    age(now(), a.query_start) AS "age"
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'payment_complements'::regclass::oid
   OR l.relation::regclass::text LIKE '%payment_complements%';

-- ============================================
-- 6. VERIFICAR DATOS EN LA TABLA
-- ============================================
-- Contar total de registros
SELECT COUNT(*) as total_registros FROM payment_complements;

-- Ver si hay UUIDs duplicados (debería ser 0 si el constraint funciona)
SELECT 
    uuid,
    COUNT(*) as cantidad,
    STRING_AGG(id::text, ', ') as ids,
    STRING_AGG(profile_id::text, ', ') as profile_ids
FROM payment_complements
GROUP BY uuid
HAVING COUNT(*) > 1
ORDER BY cantidad DESC;

-- Ver los últimos 10 registros insertados
SELECT 
    id,
    profile_id,
    uuid,
    fecha_emision,
    created_at
FROM payment_complements
ORDER BY created_at DESC
LIMIT 10;

-- ============================================
-- 7. VERIFICAR EL FORMATO DEL UUID EN LA BD
-- ============================================
-- Ver todos los UUIDs y sus longitudes (deberían ser 36 caracteres con guiones)
SELECT 
    uuid,
    LENGTH(uuid) as longitud,
    LENGTH(TRIM(uuid)) as longitud_sin_espacios,
    CASE 
        WHEN uuid ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$' THEN 'Formato válido'
        ELSE 'Formato inválido'
    END as formato_valido
FROM payment_complements
WHERE uuid LIKE '%DD1C79DD%'
ORDER BY created_at DESC;

-- ============================================
-- 8. VERIFICAR EN OTRAS TABLAS RELACIONADAS
-- ============================================
-- Verificar si el UUID existe en invoices (por si acaso)
SELECT 
    id,
    profile_id,
    uuid,
    tipo,
    fecha,
    created_at
FROM invoices
WHERE uuid = 'DD1C79DD-1ECA-4CFC-832E-EA3407C92C28';

-- Verificar si el UUID existe en accrued_expenses
SELECT 
    id,
    profile_id,
    uuid,
    tipo,
    fecha,
    created_at
FROM accrued_expenses
WHERE uuid = 'DD1C79DD-1ECA-4CFC-832E-EA3407C92C28';

-- ============================================
-- 9. VERIFICAR LA ESTRUCTURA DE LA TABLA
-- ============================================
-- Ver la definición completa de la tabla
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default,
    character_maximum_length
FROM information_schema.columns
WHERE table_name = 'payment_complements'
ORDER BY ordinal_position;

-- ============================================
-- 10. CONSULTA PARA LIMPIAR (SOLO SI ES NECESARIO)
-- ============================================
-- ⚠️ CUIDADO: Solo ejecutar si confirmas que el registro no debería existir
-- Descomentar solo si necesitas eliminar el registro problemático:

-- DELETE FROM payment_complements 
-- WHERE uuid = 'DD1C79DD-1ECA-4CFC-832E-EA3407C92C28';

-- O si necesitas reconstruir el índice (requiere permisos de superusuario):
-- REINDEX INDEX CONCURRENTLY payment_complements_uuid_key;

-- ============================================
-- INSTRUCCIONES DE USO:
-- ============================================
-- 1. Ejecuta las consultas de las secciones 1-9 en orden
-- 2. Revisa los resultados de cada sección
-- 3. Presta especial atención a:
--    - Sección 2: Si hay múltiples índices/constraints sobre uuid
--    - Sección 3: Si hay índices duplicados
--    - Sección 4: Si el índice está corrupto
--    - Sección 5: Si hay transacciones bloqueando
--    - Sección 6: Si hay UUIDs duplicados en los datos
-- 4. Comparte los resultados para determinar la causa exacta
-- ============================================
