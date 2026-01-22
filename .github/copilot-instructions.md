## alwaysApply: true

# Reglas de Desarrollo - Finance Reports SaaS

> **⚠️ IMPORTANTE**: Este proyecto utiliza **pnpm** como gestor de paquetes exclusivamente. Está **PROHIBIDO** usar `npm` o `yarn`. Ver sección "Gestión de Dependencias" para más detalles.

## 🎯 Principios Fundamentales

### 1. Tipado Robusto

**❌ PROHIBIDO:**

- Usar `any` en cualquier parte del código
- Usar tipos genéricos sin restricciones (`<T>` sin extends)
- Usar `unknown` sin type guards apropiados
- Omitir tipos en funciones, variables o parámetros

**✅ REQUERIDO:**

- TypeScript en modo `strict`
- Todas las funciones deben tener tipos explícitos de retorno
- Todas las variables deben tener tipos explícitos o inferencia clara
- Usar type guards cuando sea necesario
- Validar tipos en runtime con Zod cuando corresponda

**Ejemplo Correcto:**

```typescript
// ✅ Bien
function parseXML(file: File): Promise<CFDI> {
  // ...
}

// ❌ Mal
function parseXML(file: any): Promise<any> {
  // ...
}
```

### 2. Código Simple pero Eficaz

**❌ EVITAR:**

- Sobre-ingeniería innecesaria
- Patrones complejos cuando una solución simple funciona
- Abstracciones prematuras
- Optimizaciones prematuras sin necesidad

**✅ PREFERIR:**

- Soluciones directas y claras
- Código legible sobre código "inteligente"
- Refactorizar cuando sea necesario, no antes
- Optimizar solo cuando haya problemas reales de rendimiento

**Principio:**

> "Haz que funcione, hazlo bien, hazlo rápido" - en ese orden

### 3. Estilos Modernos, Minimalistas y Semi-Elegantes

**Directrices de Diseño:**

- **Minimalista**: Eliminar elementos innecesarios, espacio en blanco generoso
- **Semi-elegante**: Balance entre profesionalismo y accesibilidad
- **Moderno**: Usar componentes Shadcn/ui, Tailwind CSS 4, diseño actual

**Paleta de Colores:**

- Colores neutros como base (grises, blancos)
- Un color primario para acentos (azul recomendado)
- Contraste adecuado para accesibilidad
- Evitar colores muy saturados o llamativos

**Componentes:**

- Usar componentes de Shadcn/ui como base
- Personalizar solo cuando sea necesario
- Mantener consistencia visual en toda la app

### 4. Arquitectura Modular

#### Estructura de Carpetas por Ruta

**Regla Principal:**
Cada ruta en `/app` debe tener su propia carpeta `components/` para subcomponentes específicos.

**Estructura Requerida:**

```
/app
├── components/              # Componentes globales compartidos
│   ├── ui/                  # Componentes UI base (Shadcn)
│   └── layout/              # Componentes de layout
│
├── (routes)/
│   ├── upload/
│   │   ├── components/      # ✅ Subcomponentes específicos de upload
│   │   │   ├── file-dropzone.tsx
│   │   │   └── file-list.tsx
│   │   └── page.tsx         # ✅ Debe ser legible, sin lógica compleja
│   │
│   ├── dashboard/
│   │   ├── components/      # ✅ Subcomponentes específicos de dashboard
│   │   │   ├── metrics-cards.tsx
│   │   │   ├── invoice-table.tsx
│   │   │   └── filters.tsx
│   │   └── page.tsx
│   │
│   └── reports/
│       ├── components/      # ✅ Subcomponentes específicos de reports
│       │   ├── report-viewer.tsx
│       │   └── export-button.tsx
│       └── page.tsx
```

**Reglas de `page.tsx`:**

- Máximo 100-150 líneas
- Solo lógica de composición y orquestación
- Toda lógica compleja debe ir en componentes separados
- Toda lógica de negocio debe ir en `/lib` (frontend) o `/src` (backend)

**Ejemplo de `page.tsx` Correcto:**

```typescript
// ✅ Bien - Legible y modular
import { FileDropzone } from "./components/file-dropzone";
import { FileList } from "./components/file-list";
import { useInvoiceStore } from "@/store/invoice-store";

export default function UploadPage() {
  const { invoices, isLoading } = useInvoiceStore();

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Cargar Facturas</h1>
      <FileDropzone />
      <FileList invoices={invoices} isLoading={isLoading} />
    </div>
  );
}
```

### 5. Centralización de Tipos e Interfaces

**Regla Absoluta:**
TODAS las interfaces, tipos, enums y tipos utilitarios deben estar en `/lib/types/` (frontend) o `/src/types/` (backend)

**❌ PROHIBIDO:**

- Crear interfaces dentro de archivos de componentes
- Crear interfaces dentro de archivos de lógica
- Duplicar definiciones de tipos

**✅ REQUERIDO:**

- Exportar todos los tipos desde `/lib/types/index.ts` (frontend) o `/src/types/index.ts` (backend)
- Importar tipos desde los archivos centralizados
- Organizar tipos por dominio en subcarpetas si es necesario

**Estructura de `/lib/types/` (Frontend):**

```
/lib/types/
├── index.ts                 # Exportaciones centralizadas
├── cfdi.types.ts            # Tipos relacionados con CFDI
├── report.types.ts          # Tipos relacionados con reportes
├── store.types.ts           # Tipos para stores de Zustand
├── subscription.types.ts    # Tipos relacionados con suscripciones
└── common.types.ts          # Tipos comunes/utilitarios
```

**Estructura de `/src/types/` (Backend):**

```
/src/types/
├── index.ts                 # Exportaciones centralizadas
├── user.types.ts            # Tipos de usuario
├── profile.types.ts         # Tipos de perfil
├── invoice.types.ts         # Tipos de factura
├── subscription.types.ts    # Tipos de suscripción
└── common.types.ts          # Tipos comunes
```

**Ejemplo Correcto:**

```typescript
// ✅ /lib/types/cfdi.types.ts
export interface CFDI {
  uuid: string;
  fecha: Date;
  // ...
}

// ✅ /lib/types/index.ts
export type { CFDI } from './cfdi.types';
export type { Reporte } from './report.types';

// ✅ Componente usando el tipo
import type { CFDI } from '@/lib/types';

export function InvoiceCard({ invoice }: { invoice: CFDI }) {
  // ...
}
```

## 📁 Convenciones de Nombres

### Archivos y Carpetas

- **Componentes**: PascalCase (`InvoiceCard.tsx`)
- **Utilidades**: camelCase (`parseXML.ts`)
- **Tipos**: camelCase con sufijo `.types.ts` (`cfdi.types.ts`)
- **Constantes**: UPPER_SNAKE_CASE en archivos (`constants.ts`)
- **Hooks**: camelCase con prefijo `use` (`useInvoiceStore.ts`)
- **Backend Routes**: camelCase con sufijo `.routes.ts` (`auth.routes.ts`)
- **Backend Controllers**: camelCase con sufijo `.controller.ts` (`invoice.controller.ts`)
- **Backend Services**: camelCase con sufijo `.service.ts` (`invoice.service.ts`)
- **Backend Models**: PascalCase (sequelize genera automáticamente)

### Variables y Funciones

- **Variables**: camelCase (`totalFacturado`)
- **Funciones**: camelCase (`parseXML`, `generateReport`)
- **Constantes**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Tipos/Interfaces**: PascalCase (`CFDI`, `Reporte`)

### Componentes React

- **Componentes**: PascalCase (`InvoiceCard`)
- **Props**: camelCase con tipo explícito
- **Hooks personalizados**: Prefijo `use` (`useInvoiceStore`)

## 📦 Gestión de Dependencias

### Package Manager: pnpm

**⚠️ REGLA ABSOLUTA - CRÍTICA:**
Este proyecto utiliza **pnpm** como gestor de paquetes exclusivamente. Está **PROHIBIDO** usar `npm` o `yarn`.

**❌ PROHIBIDO:**

- ❌ Usar `npm install`, `npm add`, `npm remove`, `npm run`, etc.
- ❌ Usar `yarn add`, `yarn install`, `yarn`, etc.
- ❌ Mezclar gestores de paquetes
- ❌ Crear archivos `package-lock.json` o `yarn.lock`

**✅ REQUERIDO:**

- Usar `pnpm add` para instalar dependencias
- Usar `pnpm add -D` para dependencias de desarrollo
- Usar `pnpm remove` para eliminar dependencias
- Usar `pnpm install` para instalar dependencias del proyecto
- Usar `pnpm` para ejecutar scripts (equivalente a `npm run`)

**Comandos Comunes:**

```bash
# ✅ Instalar dependencia de producción
pnpm add fast-xml-parser

# ✅ Instalar dependencia de desarrollo
pnpm add -D @types/node

# ✅ Eliminar dependencia
pnpm remove package-name

# ✅ Instalar todas las dependencias
pnpm install

# ✅ Ejecutar script
pnpm dev
pnpm build
pnpm lint
```

**Razones:**

- Mejor rendimiento y uso de espacio en disco
- Manejo más estricto de dependencias
- Compatibilidad con workspaces
- Consistencia en el equipo

## 🔧 Reglas de Código Específicas

### TypeScript

- ✅ Siempre usar tipos explícitos en funciones públicas
- ✅ Usar `type` para uniones y `interface` para objetos
- ✅ Preferir `const` sobre `let`, evitar `var`
- ✅ Usar `as const` para literales cuando sea necesario
- ❌ Nunca usar `@ts-ignore` o `@ts-expect-error` sin comentario explicativo

### React (Frontend)

- ✅ Componentes funcionales únicamente
- ✅ Usar hooks personalizados para lógica reutilizable
- ✅ Separar lógica de presentación
- ✅ Usar `useCallback` y `useMemo` solo cuando sea necesario
- ❌ Evitar prop drilling (usar Zustand o Context cuando sea necesario)

### Express (Backend)

- ✅ Usar controllers para manejar requests/responses
- ✅ Usar services para lógica de negocio
- ✅ Usar middleware para validación y autenticación
- ✅ Separar rutas en archivos específicos
- ✅ Usar async/await, evitar callbacks
- ✅ Manejar errores con middleware de error centralizado

### Sequelize (Backend)

- ✅ Definir modelos en archivos separados
- ✅ Usar migrations para cambios en schema
- ✅ Usar seeders para datos iniciales
- ✅ Validaciones en modelos cuando sea posible
- ✅ Usar transacciones para operaciones críticas

### Imports

- ✅ Agrupar imports: externos, internos, tipos
- ✅ Usar path aliases (`@/lib`, `@/components` en frontend, `@/src` en backend)
- ✅ Importar tipos con `import type`

**Ejemplo Frontend:**

```typescript
// Externos
import { useState } from 'react';
import { useInvoiceStore } from '@/store/invoice-store';

// Tipos
import type { CFDI } from '@/lib/types';

// Componentes
import { Button } from '@/components/ui/button';
```

**Ejemplo Backend:**

```typescript
// Externos
import express from 'express';
import { z } from 'zod';

// Internos
import { InvoiceService } from '@/services/invoice.service';
import { authenticateToken } from '@/middleware/auth.middleware';

// Tipos
import type { Request, Response } from 'express';
import type { CreateInvoiceDto } from '@/types/invoice.types';
```

### Manejo de Errores

- ✅ Usar try-catch en operaciones async
- ✅ Proporcionar mensajes de error claros al usuario
- ✅ Loggear errores en consola para desarrollo
- ✅ Validar datos de entrada con Zod (backend) o Zod (frontend)
- ✅ Usar códigos de estado HTTP apropiados (backend)
- ✅ Middleware de error centralizado (backend)

**Ejemplo Backend:**

```typescript
// Controller
export async function createInvoice(req: Request, res: Response) {
  try {
    const invoice = await InvoiceService.create(req.body, req.user.id);
    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      logger.error('Error creating invoice:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
```

### Comentarios

- ✅ Comentar código complejo o no obvio
- ✅ Usar JSDoc para funciones públicas
- ❌ Evitar comentarios obvios que repiten el código

## 🚫 Anti-Patrones Prohibidos

1. **`any` en cualquier forma**
2. **Interfaces dentro de archivos de componentes/lógica**
3. **`page.tsx` con más de 150 líneas**
4. **Lógica de negocio en componentes**
5. **Duplicación de tipos**
6. **Sobre-ingeniería sin necesidad**
7. **Optimizaciones prematuras**
8. **Usar npm o yarn en lugar de pnpm**
9. **Lógica de negocio en controllers (debe ir en services)**
10. **Queries SQL crudas (usar Sequelize ORM)**

## ✅ Checklist de Revisión

Antes de considerar un componente/feature completo:

- [ ] ¿Todos los tipos están en `/lib/types/` o `/src/types/`?
- [ ] ¿No hay ningún `any` en el código?
- [ ] ¿El `page.tsx` es legible y tiene menos de 150 líneas?
- [ ] ¿Los subcomponentes están en la carpeta `components/` de la ruta?
- [ ] ¿El código es simple y directo?
- [ ] ¿Los estilos son minimalistas y modernos?
- [ ] ¿Hay manejo de errores apropiado?
- [ ] ¿Los imports están organizados correctamente?
- [ ] ¿Se usó `pnpm add` en lugar de `npm install` para nuevas dependencias?
- [ ] ¿La lógica de negocio está en services (backend)?
- [ ] ¿Las validaciones están con Zod?

## 📚 Referencias

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Shadcn/ui Components](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand Documentation](https://docs.pmnd.rs/zustand/)
- [Express.js Documentation](https://expressjs.com/)
- [Sequelize Documentation](https://sequelize.org/)
- [Stripe Documentation](https://stripe.com/docs)
- [Brevo Documentation](https://developers.brevo.com/)
- [pnpm Documentation](https://pnpm.io/)

---

**Última actualización**: 2026
**Versión**: 1.0.0
