// 익명 댓글 작성: x-forwarded-for에서 IP를 읽어 앞 2자리로 마스킹 후 저장.
// service_role로 insert(RLS 우회). 배포 시 --no-verify-jwt 로 익명 호출 허용.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function maskIp(raw: string): string | null {
  const ip = (raw || "").trim();
  if (!ip) return null;
  if (ip.includes(".")) {
    const p = ip.split(".");
    return `${p[0]}.${p[1]}`;
  }
  if (ip.includes(":")) {
    const p = ip.split(":").filter(Boolean);
    return `${p[0] ?? ""}:${p[1] ?? ""}`;
  }
  return null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const slug = String(payload.slug ?? "");
  const body = String(payload.body ?? "").trim();
  const parent_id = (payload.parent_id as string | null) ?? null;
  let name = String(payload.author_name ?? "").trim().slice(0, 20);
  if (!slug || !body || body.length > 4000) return json({ error: "invalid input" }, 400);
  if (!name) name = "ㅇㅇ";

  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = maskIp(fwd.split(",")[0] ?? "");

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin
    .from("comments")
    .insert({ slug, parent_id, user_id: null, author_name: name, ip, body })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json(data, 200);
});
