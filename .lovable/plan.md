

## Plan: Proteger `.env` y preparar `.gitignore` para repo público

### Problema Crítico
El `.env` contiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Aunque la publishable key es pública por diseño, es buena práctica no incluir `.env` en repos públicos para evitar exponer configuración del proyecto.

### Cambio Requerido
Actualizar `.gitignore` agregando las siguientes líneas:

```text
# Environment variables
.env
.env.*
!.env.example

# Supabase local
supabase/.branches/
supabase/.temp/

# Testing & Cache
coverage/
.vitest/
.eslintcache
*.tsbuildinfo

# Temp files
tmp/
*.tmp
```

### Archivo opcional: `.env.example`
Crear un `.env.example` como referencia (sin valores reales):

```
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
VITE_SUPABASE_URL="https://your-project.supabase.co"
```

### Nota sobre seguridad
La `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) es pública por diseño y se expone en el bundle del frontend. La protección real viene de las políticas RLS en la base de datos. Aun así, mantener `.env` fuera del repo es una buena práctica profesional.

