# Tresa ContaFlow

Sistema de control financiero mediante procesamiento de facturas XML (CFDI México). Micro-SaaS que permite gestionar facturas, gastos y complementos de pago de manera eficiente.

## 🚀 Características

- ✅ Autenticación JWT con verificación de email
- ✅ Gestión de múltiples perfiles (RFCs) por usuario
- ✅ Procesamiento de archivos XML CFDI (México)
- ✅ Validaciones fiscales automáticas
- ✅ Matching de complementos de pago con facturas PPD
- ✅ Sistema de suscripciones con Stripe (próximamente)
- ✅ API REST completa

## 📋 Requisitos

- Node.js 18+
- PostgreSQL 12+
- pnpm (recomendado) o npm

## 🛠️ Instalación

1. Clona el repositorio:

```bash
git clone <repository-url>
cd tresa-contaflow
```

2. Instala las dependencias:

```bash
pnpm install
```

3. Configura las variables de entorno:
   Crea un archivo `.env` en la raíz del proyecto:

```env
# Servidor
NODE_ENV=development
PORT=3001

# Base de datos
DATABASE_URL=postgresql://usuario:password@localhost:5432/tresa_contaflow

# JWT
JWT_SECRET=tu-secret-key-muy-segura
JWT_REFRESH_SECRET=tu-refresh-secret-key-muy-segura

# Email (Brevo)
BREVO_API_KEY=tu-api-key-brevo
BREVO_FROM_EMAIL=noreply@tudominio.com
BREVO_FROM_NAME=Tresa ContaFlow

# App URL (para links de verificación)
APP_URL=http://localhost:3000
```

4. Ejecuta las migraciones:

```bash
pnpm db:migrate
```

5. Inicia el servidor de desarrollo:

```bash
pnpm dev
```

El servidor estará disponible en `http://localhost:3001`

## 📚 Scripts Disponibles

- `pnpm dev` - Inicia el servidor en modo desarrollo
- `pnpm build` - Compila TypeScript a JavaScript
- `pnpm start` - Inicia el servidor en modo producción (ejecuta `dist/index.js`)
- `pnpm test` - Ejecuta los tests
- `pnpm test:watch` - Ejecuta los tests en modo watch
- `pnpm test:coverage` - Ejecuta los tests con cobertura
- `pnpm db:migrate` - Ejecuta las migraciones pendientes
- `pnpm db:migrate:undo` - Revierte la última migración
- `pnpm db:migrate:status` - Muestra el estado de las migraciones
- `pnpm db:migrate:generate <nombre>` - Genera una nueva migración

## 🏗️ Estructura del Proyecto

```
tresa-contaflow/
├── src/
│   ├── controllers/     # Controladores de la API
│   ├── database/
│   │   ├── models/      # Modelos de Sequelize
│   │   └── migrations/  # Migraciones de base de datos
│   ├── middlewares/     # Middlewares de Express
│   ├── routes/          # Rutas de la API
│   ├── services/        # Servicios (email, etc.)
│   ├── utils/           # Utilidades (JWT, validaciones, etc.)
│   ├── index.ts         # Punto de entrada
│   └── server.ts        # Configuración de Express
├── postman/             # Colección de Postman para pruebas
├── package.json
└── tsconfig.json
```

## 🔌 API Endpoints

### Autenticación

- `POST /api/auth/register` - Registro de nuevo usuario
- `POST /api/auth/login` - Inicio de sesión
- `POST /api/auth/logout` - Cerrar sesión
- `POST /api/auth/refresh` - Renovar access token
- `POST /api/auth/verify-email` - Verificar email

### Perfiles (RFCs)

- `GET /api/profiles` - Listar todos los perfiles del usuario
- `GET /api/profiles/:id` - Obtener un perfil específico
- `POST /api/profiles` - Crear un nuevo perfil
- `PUT /api/profiles/:id` - Actualizar un perfil
- `DELETE /api/profiles/:id` - Eliminar un perfil

## 🧪 Pruebas

Se incluye una colección de Postman en la carpeta `postman/` para probar los endpoints de la API.

1. Importa `postman-collection.json` en Postman
2. Configura la variable `base_url` si es necesario
3. Realiza el flujo: Register → Login → Usar endpoints protegidos

## 🗄️ Base de Datos

El proyecto usa PostgreSQL con Sequelize como ORM. Las tablas principales son:

- `users` - Usuarios del sistema
- `profiles` - Perfiles RFC por usuario
- `invoices` - Facturas (ingresos)
- `expenses` - Gastos
- `subscriptions` - Suscripciones de usuarios
- `payment_events` - Eventos de pago de Stripe

## 🔒 Seguridad

- Passwords hasheados con bcrypt (10 salt rounds)
- JWT para autenticación (access token: 15min, refresh token: 7 días)
- Validación de entrada con express-validator
- Verificación de email obligatoria
- Row-Level Security por user_id
- **Helmet.js** para headers de seguridad HTTP
- **Rate limiting** para protección contra ataques de fuerza bruta
- **CORS** configurado según entorno
- Manejo centralizado de errores

## 📝 Tecnologías

- **Backend**: Node.js, Express, TypeScript
- **Base de datos**: PostgreSQL, Sequelize
- **Autenticación**: JWT, bcrypt
- **Email**: Brevo (Sendinblue)
- **Validación**: express-validator
- **Testing**: Postman Collection

## 🚀 Despliegue a Producción

### Requisitos Previos

1. **Variables de Entorno**: Configura todas las variables de entorno necesarias (ver `.env.example`)
2. **Base de Datos**: PostgreSQL configurado con SSL habilitado
3. **Secrets Seguros**: Genera secrets únicos y seguros para JWT (usa `openssl rand -base64 32`)

### Pasos para Desplegar

```bash
# 1. Instalar dependencias
pnpm install --production=false

# 2. Compilar TypeScript
pnpm build

# 3. Ejecutar migraciones
pnpm db:migrate

# 4. Iniciar en producción
NODE_ENV=production pnpm start
```

### Endpoints Importantes

- `GET /health` - Health check endpoint para monitoreo
- `GET /` - Endpoint raíz con información básica

### Configuración de Producción

- **CORS**: Configura `FRONTEND_URL` o `APP_URL` en las variables de entorno
- **Rate Limiting**: Configurado automáticamente (más estricto en producción)
- **Logging**: Formato `combined` en producción (vs `dev` en desarrollo)
- **Error Handling**: Errores no exponen detalles en producción

Para más detalles, consulta [PRODUCTION_READINESS.md](./docs/PRODUCTION_READINESS.md)

## 🚧 Estado del Proyecto

Este proyecto está en desarrollo activo. Las siguientes funcionalidades están implementadas:

- ✅ Autenticación y autorización
- ✅ CRUD de perfiles (RFCs)
- ✅ Estructura de base de datos completa
- ✅ Integración con Brevo para emails
- ✅ Procesamiento de XML CFDI
- ✅ Integración con Stripe
- ✅ Sistema de suscripciones
- ✅ Seguridad mejorada (Helmet, Rate Limiting, CORS)
- ✅ Health check endpoint
- ✅ Manejo centralizado de errores

Próximas funcionalidades:

- 🔄 Logging estructurado (Winston/Pino)
- 🔄 Monitoreo y alertas
- 🔄 Documentación de API (Swagger/OpenAPI)
- 🔄 Frontend Next.js

## 📄 Licencia

Este proyecto es privado y confidencial.

## 👥 Autor

Tresa ContaFlow
