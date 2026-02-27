// Edge Function: envía email al usuario cuando se le acredita un depósito.
// Se invoca desde Database Webhook (INSERT en deposit_notifications) o con body { user_id, monto, red }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function getEnv(key: string): string | undefined {
  return Deno.env.get(key);
}

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: { user_id?: string; monto?: number; red?: string };
}

interface DirectPayload {
  user_id?: string;
  monto?: number;
  red?: string;
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = getEnv("RESEND_API_KEY");
  const appName = "LA BOMBA";
  const rawFrom = getEnv("RESEND_FROM") || `${appName} <onboarding@resend.dev>`;
  const fromEmail = rawFrom.includes("<") ? rawFrom : `${appName} <${rawFrom.trim()}>`;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase config");
    return new Response(JSON.stringify({ error: "Server config missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return new Response(JSON.stringify({ ok: true, skipped: "no_resend_key" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let user_id: string | undefined;
  let monto: number = 0;
  let red: string | undefined;

  try {
    const body = await req.json();
    const webhook = body as WebhookPayload;
    const direct = body as DirectPayload;

    if (webhook.record && (webhook.record.user_id || webhook.record.monto !== undefined)) {
      user_id = webhook.record.user_id;
      monto = Number(webhook.record.monto) || 0;
      red = webhook.record.red;
    } else if (direct.user_id) {
      user_id = direct.user_id;
      monto = Number(direct.monto) || 0;
      red = direct.red;
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!user_id || monto <= 0) {
    return new Response(JSON.stringify({ error: "Missing user_id or monto" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", user_id)
    .single();

  if (profileError || !profile?.email) {
    console.warn("No email for user", user_id, profileError?.message);
    return new Response(JSON.stringify({ ok: true, skipped: "no_email" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const nombre = profile.full_name || "Usuario";
  const redLabel = red ? ` (${red})` : "";
  const subject = `Depósito acreditado en ${appName}`;
  const html = `
    <p style="font-weight:bold;font-size:1.1em;margin-bottom:1em;">${appName}</p>
    <p>Hola ${nombre},</p>
    <p>Tu depósito ha sido acreditado.</p>
    <p><strong>+$${monto.toFixed(2)}</strong>${redLabel} ya están en tu saldo.</p>
    <p>Puedes usarlos para jugar en la app.</p>
    <p>— ${appName}</p>
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [profile.email],
        subject,
        html: html.trim(),
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : "Resend request failed";
    console.error("Resend fetch error:", msg);
    return new Response(
      JSON.stringify({ error: "Email send failed", details: msg }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errText = await res.text();
    console.error("Resend error:", res.status, errText);
    return new Response(
      JSON.stringify({ error: "Email send failed", details: errText }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const data = await res.json();
  return new Response(JSON.stringify({ ok: true, id: data.id }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(handler);
