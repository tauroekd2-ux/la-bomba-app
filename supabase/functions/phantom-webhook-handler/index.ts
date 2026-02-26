// Supabase Edge Function: phantom-webhook-handler
// Recibe webhooks de Helius (Solana USDC) y Alchemy (Base/Polygon USDC).
// Valida depósito USDC a dirección maestra, identifica usuario por wallet_address, acredita y notifica.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// USDC mints / contract addresses (mainnet)
const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase();
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c1369".toLowerCase();

function getEnv(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

interface HeliusTokenTransfer {
  fromUserAccount?: string;
  toUserAccount?: string;
  mint?: string;
  tokenAmount?: number;
  rawAmount?: string;
}

interface HeliusTx {
  signature?: string;
  tokenTransfers?: HeliusTokenTransfer[];
  type?: string;
}

interface HeliusPayload {
  webhookId?: string;
  transactionType?: string;
  transactions?: HeliusTx[];
  accountData?: unknown[];
}

interface AlchemyActivity {
  fromAddress?: string;
  toAddress?: string;
  value?: number;
  asset?: string;
  contractAddress?: string;
  category?: string;
  metadata?: { blockNum?: string; logIndex?: string };
}

interface AlchemyPayload {
  webhookId?: string;
  id?: string;
  createdAt?: string;
  type?: string;
  activity?: AlchemyActivity[];
  network?: string;
}

function notifyDepositEmail(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  monto: number,
  red: string
): void {
  const url = `${supabaseUrl}/functions/v1/send-deposit-email`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ user_id: userId, monto, red }),
  }).catch((e) => console.error("send-deposit-email error:", e));
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

  let supabaseUrl: string;
  let supabaseServiceKey: string;
  let masterSolana: string;
  let masterBase: string;
  let masterPolygon: string;

  try {
    supabaseUrl = getEnv("SUPABASE_URL");
    supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    masterSolana = (getEnv("PHANTOM_MASTER_WALLET_SOLANA") || "").trim();
    const evmFallback = (Deno.env.get("PHANTOM_MASTER_WALLET_EVM") || "").trim().toLowerCase();
    masterBase = (Deno.env.get("PHANTOM_MASTER_WALLET_BASE") || "").trim().toLowerCase() || evmFallback;
    masterPolygon = (Deno.env.get("PHANTOM_MASTER_WALLET_POLYGON") || "").trim().toLowerCase() || evmFallback;
  } catch (e) {
    console.error("Config error:", e);
    return new Response(
      JSON.stringify({ error: "Server config missing" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();

    // --- Helius (Solana): aceptar body como array (Enhanced) o body.transactions ---
    const heliusTxs = Array.isArray(body)
      ? (body as HeliusTx[])
      : (body as HeliusPayload).transactions;
    if (Array.isArray(heliusTxs)) {
      if (heliusTxs.length === 0) {
        return new Response(JSON.stringify({ ok: true, source: "helius", credited: 0 }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let credited = 0;
      for (const tx of heliusTxs) {
        const sig = tx.signature || (tx as Record<string, string>).signature;
        const transfers = tx.tokenTransfers || (tx as Record<string, unknown>).tokenTransfers || [];
        for (const t of transfers) {
          const mint = (t.mint || (t as Record<string, string>).mint || "").toString();
          if (mint !== USDC_SOLANA_MINT) continue;
          const toAddr = (t.toUserAccount || (t as Record<string, string>).toUserAccount || "").toString().trim();
          const fromAddr = (t.fromUserAccount || (t as Record<string, string>).fromUserAccount || "").toString().trim();
          if (toAddr !== masterSolana) continue;
          let amount = 0;
          if (typeof t.tokenAmount === "number") amount = t.tokenAmount;
          else if (t.rawAmount) amount = Number(t.rawAmount) / 1e6;
          else {
            const raw = (t as Record<string, { tokenAmount?: string; decimals?: number }>).rawTokenAmount;
            if (raw?.tokenAmount != null) {
              const dec = raw.decimals ?? 6;
              amount = Number(raw.tokenAmount) / Math.pow(10, dec);
            }
          }
          if (amount <= 0) continue;

          const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .eq("wallet_address", fromAddr)
            .limit(1)
            .maybeSingle();

          if (!profile?.id) {
            console.warn("Helius: no profile for wallet", fromAddr, "(masterTo:", toAddr === masterSolana ? "ok" : "no", ")");
            continue;
          }

          const { data: rpc, error } = await supabase.rpc("acreditar_deposito_phantom", {
            p_tx_hash: sig || `solana-${Date.now()}-${fromAddr}`,
            p_red: "solana",
            p_wallet_from: fromAddr,
            p_wallet_to: toAddr,
            p_monto: amount,
            p_user_id: profile.id,
          });
          if (error) {
            console.error("Helius acreditar error:", error);
            continue;
          }
          if (rpc?.ok) {
            credited += 1;
            console.log("Helius deposit credited:", profile.id, amount);
            notifyDepositEmail(supabaseUrl, supabaseServiceKey, profile.id, amount, "solana");
          } else console.warn("Helius acreditar RPC no ok:", rpc);
        }
      }
      return new Response(JSON.stringify({ ok: true, source: "helius", credited }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Alchemy (Base / Polygon) ---
    const alchemy = body as AlchemyPayload;
    const activity = alchemy.activity || (body as Record<string, unknown>).activity;
    if (Array.isArray(activity)) {
      const network = (alchemy.network || (body as Record<string, string>).network || "").toLowerCase();
      const chainId = (body as Record<string, string>).chainId;
      const isBase = network.includes("base") || chainId === "8453";
      const isPolygon = network.includes("polygon") || chainId === "137";
      if (!isBase && !isPolygon) {
        return new Response(JSON.stringify({ error: "Unsupported chain (solo Base/Polygon)" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let credited = 0;
      const reasons: string[] = [];
      for (const a of activity) {
        const toAddr = (a.toAddress || (a as Record<string, string>).toAddress || "").toLowerCase();
        const fromAddr = (a.fromAddress || (a as Record<string, string>).fromAddress || "").toLowerCase();
        const contract = (a.contractAddress || (a as Record<string, string>).contractAddress || "").toLowerCase();
        const red = isBase ? "base" : "polygon";
        const masterEvmForChain = red === "base" ? masterBase : masterPolygon;
        if (!masterEvmForChain) {
          reasons.push("master_wallet_no_configurada_" + red);
          continue;
        }
        if (toAddr !== masterEvmForChain) {
          reasons.push("destino_no_es_maestra_esperada");
          continue;
        }
        const isUsdc = contract === USDC_BASE || contract === USDC_POLYGON;
        if (!isUsdc) {
          reasons.push("no_es_contrato_usdc");
          continue;
        }

        // Alchemy: value suele venir ya en unidades humanas (decimals aplicados)
        let amount = 0;
        if (typeof a.value === "number") amount = a.value;
        else if ((a as Record<string, string>).value) {
          const v = Number((a as Record<string, string>).value);
          amount = v > 1e10 ? v / 1e6 : v; // si parece raw (6 decimals), convertir
        }
        if (amount <= 0) {
          reasons.push("monto_invalido");
          continue;
        }
        const txHash = (a.metadata as Record<string, string>)?.hash || (a as Record<string, string>).hash || `evm-${red}-${Date.now()}-${fromAddr}`;

        const column = red === "base" ? "wallet_address_base" : "wallet_address_polygon";
        let { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq(column, fromAddr)
          .limit(1)
          .maybeSingle();
        if (!profile?.id) {
          const { data: profileEvm } = await supabase
            .from("profiles")
            .select("id")
            .eq("wallet_address_evm", fromAddr)
            .limit(1)
            .maybeSingle();
          profile = profileEvm;
        }
        if (!profile?.id) {
          reasons.push("no_perfil_para_wallet_" + fromAddr.slice(0, 12) + "..._vincula_en_cajero");
          console.warn("Alchemy: no profile for wallet", fromAddr, "red:", red);
          continue;
        }

        const { data: rpc, error } = await supabase.rpc("acreditar_deposito_phantom", {
          p_tx_hash: txHash,
          p_red: red,
          p_wallet_from: fromAddr,
          p_wallet_to: toAddr,
          p_monto: amount,
          p_user_id: profile.id,
        });
        if (error) {
          reasons.push("rpc_error_" + (error.message || "unknown"));
          console.error("Alchemy acreditar error:", error);
          continue;
        }
        if (rpc?.ok) {
          credited += 1;
          console.log("Alchemy deposit credited:", profile.id, amount);
          notifyDepositEmail(supabaseUrl, supabaseServiceKey, profile.id, amount, red);
        } else {
          const err = (rpc as { error?: string })?.error || "unknown";
          reasons.push("rpc_no_ok_" + err);
          console.warn("Alchemy acreditar RPC no ok:", rpc);
        }
      }
      const payload: Record<string, unknown> = { ok: true, source: "alchemy", credited };
      if (credited === 0 && reasons.length > 0) payload.reasons = reasons;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

Deno.serve(handler);
