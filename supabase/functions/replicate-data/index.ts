import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { table, type, record, old_record } = await req.json();

    if (!table || !type) {
      return new Response(
        JSON.stringify({ error: "Missing table or type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const destUrl = Deno.env.get("DEST_SUPABASE_URL");
    const destKey = Deno.env.get("DEST_SUPABASE_SERVICE_ROLE_KEY");

    if (!destUrl || !destKey) {
      console.error("Missing DEST_SUPABASE_URL or DEST_SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Destination not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const destSupabase = createClient(destUrl, destKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let result;

    if (type === "DELETE") {
      const id = old_record?.id;
      if (!id) {
        console.error("DELETE without old_record.id", { table, old_record });
        return new Response(
          JSON.stringify({ error: "Missing old_record.id for DELETE" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await destSupabase.from(table).delete().eq("id", id);
      if (error) {
        console.error(`DELETE error on ${table}:`, error);
        result = { action: "DELETE", error: error.message };
      } else {
        result = { action: "DELETE", id };
      }
    } else {
      // INSERT or UPDATE → upsert
      if (!record) {
        return new Response(
          JSON.stringify({ error: "Missing record for INSERT/UPDATE" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error } = await destSupabase.from(table).upsert(record, { onConflict: "id" });
      if (error) {
        console.error(`UPSERT error on ${table}:`, error);
        result = { action: "UPSERT", error: error.message };
      } else {
        result = { action: "UPSERT", id: record.id };
      }
    }

    console.log(`Replicated ${type} on ${table}:`, result);

    return new Response(JSON.stringify(result), {
      status: result.error ? 500 : 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Replication error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
