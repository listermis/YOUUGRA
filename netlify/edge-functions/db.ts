// Reverse-proxy к Supabase REST через Netlify Edge.
//
// Зачем: домен *.supabase.co заблокирован в РФ (DNS + IP). Браузер обращается
// к /db/*  на самом сайте, а этот код (выполняется в дата-центре Netlify, не в
// РФ) уже ходит в Supabase и подставляет ключ.
//
//   /db/youugra_state?id=eq.main&select=data
//        →  https://<project>.supabase.co/rest/v1/youugra_state?id=eq.main&select=data
//
// Ключ ниже — публикуемый (publishable / anon), он и так лежит в app.js в
// открытом виде; здесь он только для того, чтобы клиенту не нужно было слать
// заголовки самому.

const SUPABASE_URL = "https://ympdquhyyywxgazhlvet.supabase.co";
const SUPABASE_KEY = "sb_publishable_yzyzkIxCZKW1q3EDr4mYrA_BPrV_c_z";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Prefer, apikey, Authorization",
  "Access-Control-Max-Age": "86400",
};

export default async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(request.url);
  const rest = url.pathname.replace(/^\/db\/?/, "");
  const target = `${SUPABASE_URL}/rest/v1/${rest}${url.search}`;

  const headers = new Headers();
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Authorization", `Bearer ${SUPABASE_KEY}`);
  headers.set("Accept", "application/json");
  const prefer = request.headers.get("Prefer");
  if (prefer) headers.set("Prefer", prefer);
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "proxy_upstream_failed", detail: String(err) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // Тело Netlify уже отдал расжатым — снимаем заголовки сжатия/длины, иначе
  // браузер попытается расжать простой текст и сломается.
  const out = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(CORS)) out.set(k, v);
  out.delete("content-encoding");
  out.delete("content-length");

  return new Response(upstream.body, { status: upstream.status, headers: out });
};

export const config = { path: "/db/*" };
