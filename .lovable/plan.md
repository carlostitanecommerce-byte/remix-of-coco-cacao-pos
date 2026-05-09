## Problema

Al hacer clic en "Registrar salida" en `/coworking`, el handler llama a la RPC `freeze_checkout_coworking`. La función Postgres falla con:

```
column reference "fecha_salida_real" is ambiguous
```

Causa: el `RETURNS TABLE(... fecha_salida_real ...)` declara una variable de salida con el mismo nombre que la columna de `coworking_sessions`. En el `UPDATE`, la cláusula `AND fecha_salida_real IS NULL` no está calificada y Postgres no sabe si te refieres a la columna o a la variable de retorno → aborta y el frontend no avanza.

## Fix

Migración que reemplaza `freeze_checkout_coworking` calificando la columna en el `WHERE` del `UPDATE`:

```sql
CREATE OR REPLACE FUNCTION public.freeze_checkout_coworking(p_session_id uuid)
RETURNS TABLE(id uuid, fecha_salida_real timestamp with time zone, was_frozen_now boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := (now() AT TIME ZONE 'America/Mexico_City') AT TIME ZONE 'America/Mexico_City';
  v_existing timestamptz;
BEGIN
  SELECT s.fecha_salida_real INTO v_existing
  FROM public.coworking_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT p_session_id, v_existing, false;
    RETURN;
  END IF;

  UPDATE public.coworking_sessions AS s
  SET fecha_salida_real = v_now
  WHERE s.id = p_session_id
    AND s.fecha_salida_real IS NULL;

  RETURN QUERY SELECT p_session_id, v_now, true;
END;
$function$;
```

No requiere cambios de frontend.

## Validación

1. En `/coworking`, abrir una sesión activa y dar clic en "Registrar salida".
2. Verificar en consola que ya no aparece `freeze_checkout_coworking failed` y que se abre el modal de checkout con el resumen.
3. Repetir el clic: la segunda llamada debe devolver `was_frozen_now=false` con la misma `fecha_salida_real` (idempotencia preservada).