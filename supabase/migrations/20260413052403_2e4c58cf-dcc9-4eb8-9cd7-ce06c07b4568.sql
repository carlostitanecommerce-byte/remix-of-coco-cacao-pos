
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Generic replication function
CREATE OR REPLACE FUNCTION public.replicate_to_destination()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload jsonb;
  edge_function_url text;
  anon_key text;
BEGIN
  edge_function_url := rtrim(current_setting('app.settings.supabase_url', true), '/') 
    || '/functions/v1/replicate-data';
  
  -- Fallback: use env var if app.settings not available
  IF edge_function_url IS NULL OR edge_function_url = '/functions/v1/replicate-data' THEN
    edge_function_url := 'https://kswzpteyqiughimtmxal.supabase.co/functions/v1/replicate-data';
  END IF;

  anon_key := coalesce(
    current_setting('app.settings.supabase_anon_key', true),
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzd3pwdGV5cWl1Z2hpbXRteGFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMzUyOTAsImV4cCI6MjA5MTYxMTI5MH0.Sc6hqMScaKZTi4cBrGXDx_fPZoa6V4bYefSoxkkyZtI'
  );

  payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'type', TG_OP,
    'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END
  );

  -- Fire-and-forget HTTP POST via pg_net
  PERFORM extensions.http_post(
    url := edge_function_url,
    body := payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    )::jsonb
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Create replication triggers for all tables
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'areas_coworking', 'audit_logs', 'cajas', 'categorias_maestras',
    'compras_insumos', 'configuracion_ventas', 'coworking_reservaciones',
    'coworking_session_upsells', 'coworking_sessions', 'detalle_ventas',
    'insumos', 'kds_order_items', 'kds_orders', 'mermas',
    'movimientos_caja', 'productos', 'profiles', 'recetas',
    'solicitudes_cancelacion', 'solicitudes_cancelacion_sesiones',
    'tarifas_coworking', 'tarifa_amenities_incluidos', 'tarifa_upsells',
    'user_roles', 'ventas'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE TRIGGER replicate_%I
       AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.replicate_to_destination();',
      tbl, tbl
    );
  END LOOP;
END;
$$;
