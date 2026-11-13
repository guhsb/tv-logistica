// Painel de Logística Freedom na TV - função NOVA do Supabase (Edge Function "paineis-logistica").
// É separada da "paineis-tv": mexer aqui não afeta as telas Geral e Fechamento.
// Busca no site relatorios.cbfreedom.com.br:
//   /logistics/billing/daily    -> faturado do dia por tipo de pedido (Venda, Bonificação, ...)
//   /logistics/pending/orders   -> pedidos ainda sem nota fiscal (com motivo, classificação e conferência)
//
// LOGIN: a própria TV pede o e-mail e a senha do site uma vez e manda junto (POST, por HTTPS).
// Não precisa cadastrar nenhum segredo no Supabase. O login precisa ter acesso à Logística no site.
// IMPORTANTE: ao criar a função, desligue "Verify JWT" (a TV não manda token do Supabase).

const BASE = "https://relatorios.cbfreedom.com.br/api/v1";
const DESDE = "2026-10-31";   // a contagem de pedidos em aberto começa neste dia
const CACHE_MS = 60_000;      // cada login consulta o site no máximo a cada 60 segundos
const CACHE = new Map<string, { t: number; dados: unknown }>();
const FALHAS = new Map<string, { n: number; t: number }>(); // proteção contra chute de senha

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-chave, authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

const n = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

class ErroLogin extends Error {}

// Data de hoje no horário de Brasília (AAAA-MM-DD)
function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

async function hash(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Login no site (sessão por cookie) e função para buscar
async function entrar(email: string, senha: string) {
  const rl = await fetch(BASE + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: email, password: senha, remember: true }),
  });
  if (rl.status === 400 || rl.status === 401 || rl.status === 422) { await rl.body?.cancel(); throw new ErroLogin("e-mail ou senha incorretos"); }
  if (!rl.ok) { await rl.body?.cancel(); throw new Error("login no site falhou (HTTP " + rl.status + ")"); }
  const cookie = rl.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  await rl.body?.cancel();
  const get = async (caminho: string) => {
    const r = await fetch(BASE + caminho, { headers: { Cookie: cookie } });
    if (r.status === 403) { await r.body?.cancel(); throw new Error("este login não tem acesso à Logística"); }
    if (!r.ok) { await r.body?.cancel(); throw new Error("erro ao buscar " + caminho.split("?")[0] + " (HTTP " + r.status + ")"); }
    return await r.json();
  };
  const sair = async () => { try { const r = await fetch(BASE + "/auth/logout", { method: "POST", headers: { Cookie: cookie } }); await r.body?.cancel(); } catch { /* */ } };
  return { get, sair };
}
type Sessao = Awaited<ReturnType<typeof entrar>>;

const SITUACAO: Record<string, string> = {
  SEM_REGISTRO: "sem_registro",
  EM_ANDAMENTO: "em_conferencia",
  FINALIZADA: "conferido_nao_faturado",
};

// ---------------- LOGÍSTICA ----------------
async function logistica({ get }: Sessao) {
  const hoje = hojeBrasil();
  const [pend, fat] = await Promise.all([get("/logistics/pending/orders"), get("/logistics/billing/daily")]);

  // 1) Faturado de hoje: Venda em destaque, os outros tipos (bonificação etc.) e o total
  const dias: any[] = fat.days || [];
  const dia = dias.find((d) => String(d.invoice_date).slice(0, 10) === hoje) ||
    (fat.selected_day && String(fat.selected_day.invoice_date).slice(0, 10) === hoje ? fat.selected_day : null);
  const tipos: any[] = dia?.types || [];
  const vendas = tipos.filter((t) => t.order_type_code === "V").reduce((a, t) => a + n(t.value), 0);
  const outros = tipos
    .filter((t) => t.order_type_code !== "V")
    .map((t) => ({ nome: t.order_type_label, valor: n(t.value), notas: n(t.order_count) }))
    .sort((a, b) => b.valor - a.valor);
  const total = dia ? n(dia.total_value) : 0;

  // 2) Pedidos em aberto por dia: ainda sem nota fiscal (não finalizados), SEM MOTIVO, desde 31/10
  const porDia = new Map<string, any[]>();
  for (const i of (pend.items || [])) {
    if (i.effective_classification === "FINALIZADO") continue;
    if (String(i.reason ?? "").trim() !== "") continue; // pedido com motivo não conta
    const d = String(i.order_date || "").slice(0, 10);
    if (!d || d < DESDE) continue;
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d)!.push({
      pedido: i.order_number,
      cliente: i.customer || "—",
      valor: n(i.value),
      situacao: SITUACAO[i.conference_status] || "sem_registro",
    });
  }
  const abertos = [...porDia.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([d, pedidos]) => ({ dia: d, pedidos: pedidos.sort((a, b) => b.valor - a.valor) }));

  return {
    tipo: "logistica",
    atualizado_em: new Date().toISOString(),
    periodo: { hoje, desde: DESDE },
    faturado: { vendas, outros, total },
    abertos,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "?";

  // O login vem da TV (POST com e-mail e senha)
  let email = "", senha = "";
  if (req.method === "POST") {
    try { const b = await req.json(); email = String(b.email || "").trim(); senha = String(b.senha || ""); } catch { /* */ }
  }
  if (!email || !senha) return json({ erro: "faça o login na TV", login: true }, 401);

  // muitas senhas erradas seguidas do mesmo lugar: espera 10 minutos
  const f = FALHAS.get(ip);
  if (f && f.n >= 8 && Date.now() - f.t < 10 * 60_000) return json({ erro: "muitas tentativas de login erradas; espere 10 minutos", login: true }, 429);

  const k = await hash(email.toLowerCase() + "\n" + senha);
  const c = CACHE.get(k);
  if (c && Date.now() - c.t < CACHE_MS) return json(c.dados);
  try {
    const s = await entrar(email, senha);
    let dados;
    try { dados = await logistica(s); } finally { await s.sair(); }
    FALHAS.delete(ip);
    CACHE.set(k, { t: Date.now(), dados });
    if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value!);
    return json(dados);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof ErroLogin) {
      const g = FALHAS.get(ip); FALHAS.set(ip, { n: (g && Date.now() - g.t < 10 * 60_000 ? g.n : 0) + 1, t: Date.now() });
      return json({ erro: msg, login: true }, 401);
    }
    if (c) return json({ ...(c.dados as object), aviso: "não consegui atualizar agora: " + msg });
    return json({ erro: msg }, 502);
  }
});
