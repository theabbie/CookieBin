const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "method_not_allowed" });

  const id = (req.query.id || "").toString();
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "invalid_id" });

  // Fetch + atomically bump the view counter in one RPC call
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cookie_dump_hit`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dump_id: id }),
  });

  const rows = await r.json();
  if (!r.ok) return res.status(502).json({ error: "db_error" });
  if (!Array.isArray(rows) || !rows[0])
    return res.status(404).json({ error: "not_found" });

  return res.status(200).json(rows[0]);
};
