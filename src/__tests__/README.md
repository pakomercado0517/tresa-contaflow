# Tests - Tresa ContaFlow

Este directorio contiene los tests principales del backend.

## ⚠️ Estado Actual

Los tests están **completamente implementados** pero requieren configuración de base de datos.

### Error Actual

```
TypeError: Cannot read properties of undefined (reading 'define')
```

**Causa**: `sequelize` es `undefined` cuando se inicializan los modelos. Esto ocurre porque `DATABASE_URL` no está disponible o hay un problema de resolución de módulos ES.

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
# Ejecutar todos los tests
pnpm test

# Modo watch
pnpm test:watch

# Con coverage
pnpm test:coverage

# UI de Vitest
pnpm test:ui
```

## ⚙️ Configuración Requerida

1. **Base de Datos**: Asegurar que `DATABASE_URL` esté en `.env` o `.env.test`
2. **Variables de Entorno**: Los tests usan las mismas variables que el servidor

## 📝 Notas

- Los tests limpian la BD antes y después de ejecutarse
- Los tests verifican ownership (seguridad)
- Los tests incluyen casos válidos e inválidos
- Los tests de Stripe requieren configuración adicional (se omiten si no está disponible)

## 🔧 Solución al Error Actual

El error `sequelize is undefined` se puede resolver:

1. **Asegurar DATABASE_URL**: Verificar que esté en `.env`
2. **Usar BD de pruebas**: Configurar una BD separada para tests
3. **Ajustar Vitest**: Puede requerir configuración adicional de módulos ES

Los tests están listos, solo necesitan configuración de entorno.
