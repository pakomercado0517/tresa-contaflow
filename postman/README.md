# Colección Postman - Tresa Contafy API

Esta carpeta contiene la colección de Postman para probar la API de Tresa Contafy.

## 📋 Configuración Inicial

### 1. Importar la colección

1. Abre Postman
2. Click en **Import**
3. Selecciona el archivo `postman-collection.json`
4. La colección se importará con todas las variables configuradas

### 2. Variables de la Colección

La colección incluye las siguientes variables que se actualizan automáticamente:

- `base_url` - URL base de la API (default: `http://localhost:3001`)
- `accessToken` - Token de acceso JWT (se guarda automáticamente al hacer login)
- `refreshToken` - Token de refresh JWT (se guarda automáticamente al hacer login)
- `userId` - ID del usuario autenticado
- `userEmail` - Email del usuario autenticado

### 3. Configurar Variables

Si tu servidor corre en otro puerto o URL, puedes cambiar la variable `base_url`:

1. Click derecho en la colección → **Edit**
2. Ve a la pestaña **Variables**
3. Modifica `base_url` según tu configuración

## 🚀 Uso

### Flujo de Autenticación

1. **Register** - Crea un nuevo usuario
   - Cambia el email y password en el body si es necesario
   - El usuario se crea con suscripción FREE automáticamente

2. **Login** - Inicia sesión
   - Los tokens se guardan automáticamente en las variables de la colección
   - Puedes ver los tokens en la consola de Postman

3. **Refresh Token** - Renueva el access token
   - Usa el refresh token guardado automáticamente
   - Actualiza el access token en las variables

4. **Test Protected Route** - Prueba una ruta protegida
   - Usa el access token guardado automáticamente
   - El header Authorization se agrega automáticamente

5. **Logout** - Cierra sesión
   - Limpia los tokens de las variables

## 🔄 Actualización Automática de Tokens

La colección está configurada para:

- ✅ Guardar automáticamente `accessToken` y `refreshToken` al hacer login
- ✅ Actualizar `accessToken` al hacer refresh
- ✅ Limpiar tokens al hacer logout
- ✅ Usar automáticamente el token en las rutas protegidas

## 📝 Notas

- Los tokens se guardan en las **variables de la colección**, no en variables de entorno
- Si necesitas usar diferentes usuarios, puedes crear variables de entorno en Postman
- Los scripts de test se ejecutan automáticamente después de cada request

## 🔧 Personalización

Para agregar más endpoints:

1. Agrega un nuevo item en el array `item` de la colección
2. Para rutas protegidas, agrega el header:
   ```json
   {
     "key": "Authorization",
     "value": "Bearer {{accessToken}}"
   }
   ```

