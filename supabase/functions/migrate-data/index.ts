import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sourceUrl = Deno.env.get("SOURCE_SUPABASE_URL")!;
    const sourceKey = Deno.env.get("SOURCE_SERVICE_ROLE_KEY")!;
    const destUrl = Deno.env.get("SUPABASE_URL")!;
    const destKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const source = createClient(sourceUrl, sourceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const dest = createClient(destUrl, destKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const log: Record<string, number | string> = {};

    // Helper to fetch all rows (handles >1000 rows)
    async function fetchAll(client: any, table: string) {
      const rows: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await client
          .from(table)
          .select("*")
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`Read ${table}: ${error.message}`);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return rows;
    }

    // Helper to insert in batches
    async function insertAll(table: string, rows: any[]) {
      if (rows.length === 0) {
        log[table] = 0;
        return;
      }
      const batchSize = 500;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await dest.from(table).upsert(batch, { onConflict: "id" });
        if (error) throw new Error(`Insert ${table} batch ${i}: ${error.message}`);
      }
      log[table] = rows.length;
    }

    // No trigger disable needed - triggers are missing in this project

    // Step 1: Independent base tables
    const tables1 = [
      "categorias_maestras",
      "areas_coworking",
      "configuracion_ventas",
      "insumos",
      "productos",
    ];
    for (const t of tables1) {
      const rows = await fetchAll(source, t);
      await insertAll(t, rows);
    }

    // Step 2: Tables depending on step 1
    const tables2 = ["tarifas_coworking", "recetas"];
    for (const t of tables2) {
      const rows = await fetchAll(source, t);
      await insertAll(t, rows);
    }

    // Step 3: Tables depending on step 2
    const tables3 = ["tarifa_upsells", "tarifa_amenities_incluidos"];
    for (const t of tables3) {
      const rows = await fetchAll(source, t);
      await insertAll(t, rows);
    }

    // Skip profiles and user_roles - they require auth.users entries
    log["profiles"] = "SKIPPED (FK to auth.users)";
    log["user_roles"] = "SKIPPED (FK to auth.users)";

    // Step 5: Transactional parent tables
    const tables5 = ["cajas", "coworking_sessions", "coworking_reservaciones"];
    for (const t of tables5) {
      const rows = await fetchAll(source, t);
      await insertAll(t, rows);
    }

    // Ventas - need to handle folio sequence
    const ventas = await fetchAll(source, "ventas");
    await insertAll("ventas", ventas);

    // Step 6: Transactional child tables
    const tables6 = ["detalle_ventas", "movimientos_caja", "compras_insumos", "mermas"];
    for (const t of tables6) {
      const rows = await fetchAll(source, t);
      await insertAll(t, rows);
    }

    // Step 7
    const tables7 = [
      "coworking_session_upsells",
      "solicitudes_cancelacion",
      "solicitudes_cancelacion_sesiones",
    ];
    for (const t of tables7) {
      const rows = await fetchAll(source, t);
      await insertAll(t, rows);
    }

    // Step 8: KDS
    const kdsOrders = await fetchAll(source, "kds_orders");
    await insertAll("kds_orders", kdsOrders);
    const kdsItems = await fetchAll(source, "kds_order_items");
    await insertAll("kds_order_items", kdsItems);

    // Step 9: Audit logs
    const auditLogs = await fetchAll(source, "audit_logs");
    await insertAll("audit_logs", auditLogs);

    return new Response(JSON.stringify({ success: true, counts: log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
