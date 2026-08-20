const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY;

const MAX_SITE_LEN = 200;
const MAX_CONTENT_LEN = 100 * 1024; // 100 KB

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function verifyRecaptcha(token, ip) {
  if (!token || typeof token !== "string") return false;
  const body = new URLSearchParams({
    secret: RECAPTCHA_SECRET,
    response: token,
  });
  if (ip) body.set("remoteip", ip);
  const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!r.ok) return false;
  const data = await r.json();
  return data.success === true;
}

async function supabase(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  return r;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const r = await supabase(
      "/cookie_dumps?select=id,site,views,created_at&order=created_at.desc&limit=50"
    );
    const rows = await r.json();
    return res.status(r.ok ? 200 : 502).json(r.ok ? rows : { error: "db_error" });
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (!body || typeof body !== "object")
      return res.status(400).json({ error: "invalid_body" });

    const { site, content, token } = body;

    if (
      typeof site !== "string" || !site.trim() || site.length > MAX_SITE_LEN ||
      typeof content !== "string" || !content.trim() || content.length > MAX_CONTENT_LEN
    )
      return res.status(400).json({ error: "invalid_fields" });

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const human = await verifyRecaptcha(token, ip);
    if (!human) return res.status(403).json({ error: "recaptcha_failed" });

    const r = await supabase("/cookie_dumps", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ site: site.trim(), content }),
    });
    const rows = await r.json();
    if (!r.ok || !Array.isArray(rows) || !rows[0])
      return res.status(502).json({ error: "db_error" });

    return res.status(201).json({
      id: rows[0].id,
      site: rows[0].site,
      created_at: rows[0].created_at,
    });
  }

  return res.status(405).json({ error: "method_not_allowed" });
};
