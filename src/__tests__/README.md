# Tests - Tresa Contafy

Este directorio contiene los tests principales del backend.

## ⚠️ Estado Actual

Los tests están **completamente implementados** y configurados.

### Configuración de Base de Datos

- **BD de desarrollo**: `.env` → Railway (desarrollo)
- **BD de tests**: `.env.test` → Railway (tests exclusiva)
- Las migraciones se ejecutan automáticamente antes de correr tests

## ✅ Tests Implementados

1. **auth.test.ts** - Autenticación completa
   - Registro de usuario
   - Login
   - Refresh token
   - Logout
   - Validaciones

2. **profiles.test.ts** - CRUD de perfiles
   - Crear perfil
   - Listar perfiles
   - Obtener por ID
   - Actualizar perfil
   - Eliminar perfil
   - Ownership checks

3. **invoices.test.ts** - Facturas y métricas
   - Listar facturas
   - Obtener por ID
   - Eliminar factura
   - Métricas del dashboard
   - Cálculos de total facturado/pagado

4. **expenses.test.ts** - CRUD de gastos
   - Crear gasto manual
   - Listar gastos
   - Obtener por ID
   - Actualizar gasto
   - Eliminar gasto
   - Filtros por categoría

5. **subscription.test.ts** - Suscripciones
   - Obtener suscripción
   - Validaciones de checkout
   - Validaciones de portal

## 🚀 Ejecutar Tests

```bash
# Ejecutar todos los tests (incluye migraciones automáticas)
pnpm test

# Solo tests (sin migraciones)
pnpm test:only

# Ejecutar migraciones en BD de tests manualmente
pnpm test:migrate

# Modo watch
pnpm test:watch

# Con coverage
pnpm test:coverage

# UI de Vitest
pnpm test:ui
```

## ⚙️ Configuración Requerida

1. **Base de Datos de Tests**: 
   - Configurar `DATABASE_URL` en `.env.test` apuntando a una BD exclusiva para tests
   - La BD puede ser local o remota (Railway)
   - **IMPORTANTE**: Usar una BD separada para evitar pérdida de datos de desarrollo

2. **Variables de Entorno**: 
   - Los tests usan `.env.test` para todas las configuraciones
   - Las migraciones se ejecutan automáticamente antes de los tests

3. **Primera ejecución**:
   ```bash
   # Las migraciones se ejecutan automáticamente con pnpm test
   # O ejecutarlas manualmente primero:
   pnpm test:migrate
   ```

## 📝 Notas

- Los tests limpian la BD antes y después de ejecutarse
- Los tests verifican ownership (seguridad)
- Los tests incluyen casos válidos e inválidos
- Los tests de Stripe requieren configuración adicional (se omiten si no está disponible)
- **`pnpm test`** ejecuta migraciones automáticamente antes de los tests
- **`pnpm test:only`** ejecuta tests sin migraciones (útil para iteraciones rápidas)

## 🏗️ Modelos actualizados (Fase 1)

Los tests ahora incluyen:
- **AccruedExpense** (antes Expense): tabla `accrued_expenses` con campos `iva_amount`, `retencion_iva_amount`, `retencion_isr_amount`, `is_paid`
- **Invoice**: con campos `iva_amount`, `retencion_iva_amount`, `retencion_isr_amount`
- **Period**: nueva tabla `periods`
- **ManualIncome**: nueva tabla `manual_incomes`

## 🔧 Arquitectura de Tests

1. **setup.ts**: Carga `.env.test` con prioridad (no sobrescribe con `.env`)
2. **test-with-migrations.mjs**: Ejecuta migraciones en BD de tests antes de Vitest
3. **test-db.ts**: Limpia todas las tablas entre tests (incluyendo nuevas tablas)
4. **Vitest**: Ejecuta tests secuencialmente para evitar conflictos de BD
