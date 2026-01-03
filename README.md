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
- `pnpm start` - Inicia el servidor en modo producción
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

## 📝 Tecnologías

- **Backend**: Node.js, Express, TypeScript
- **Base de datos**: PostgreSQL, Sequelize
- **Autenticación**: JWT, bcrypt
- **Email**: Brevo (Sendinblue)
- **Validación**: express-validator
- **Testing**: Postman Collection

## 🚧 Estado del Proyecto

Este proyecto está en desarrollo activo. Las siguientes funcionalidades están implementadas:

- ✅ Autenticación y autorización
- ✅ CRUD de perfiles (RFCs)
- ✅ Estructura de base de datos completa
- ✅ Integración con Brevo para emails

Próximas funcionalidades:

- 🔄 Parser XML CFDI
- 🔄 Upload de archivos XML
- 🔄 Validaciones fiscales
- 🔄 Matching de complementos de pago
- 🔄 Integración con Stripe
- 🔄 Frontend Next.js

## 📄 Licencia

Este proyecto es privado y confidencial.

## 👥 Autor

Tresa ContaFlow
