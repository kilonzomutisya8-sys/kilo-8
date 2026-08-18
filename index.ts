// =========================================================
// Kilo Auto Spares Ltd — "Download image into Supabase"
// ---------------------------------------------------------
// Called from the Admin "Find Missing Images" screen whenever
// you paste/drag an image link instead of a local file. Browsers
// won't let a webpage silently download bytes from another site
// (that's a security restriction, not a bug) — but this function
// runs on Supabase's servers, so it can fetch the image and save
// it straight into your product-images storage bucket. From then
// on the product's photo is served from YOUR storage, not the
// original site, so hotlink-protection on the original site can
// no longer break the image on your product pages.
//
// Deploy: Supabase Dashboard → Edge Functions → Deploy a new
// function → name it exactly "fetch-external-image" → paste this
// file's contents → Deploy. No extra secrets needed — SUPABASE_URL
// and SUPABASE_ANON_KEY are provided automatically by Supabase.
// =========================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a product photo, keeps storage/costs sane

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Request body must be JSON like { "url": "https://..." }.' }, 400);
  }

  const sourceUrl = (body.url || '').trim();
  if (!sourceUrl) {
    return jsonResponse({ error: 'Missing "url".' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return jsonResponse({ error: 'That is not a valid URL.' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return jsonResponse({ error: 'Only http/https links are allowed.' }, 400);
  }

  let imgRes: Response;
  try {
    imgRes = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KiloAutoSparesImageFetcher/1.0)' },
    });
  } catch (err) {
    return jsonResponse({ error: `Could not reach that link (${err instanceof Error ? err.message : 'network error'}).` }, 502);
  }

  if (!imgRes.ok) {
    return jsonResponse({
      error: `The source site refused the request (HTTP ${imgRes.status}). It may be blocking automated downloads — save the image to your computer and use the Upload button instead.`,
    }, 502);
  }

  const contentType = (imgRes.headers.get('content-type') || '').split(';')[0].trim();
  if (!contentType.startsWith('image/')) {
    return jsonResponse({ error: `That link did not return an image (got "${contentType || 'unknown content type'}").` }, 400);
  }

  const bytes = await imgRes.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    return jsonResponse({ error: 'That image is larger than 8MB — try a smaller version of it.' }, 400);
  }

  const ext = (contentType.split('/')[1] || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  const path = `${Date.now()}-external.${ext}`;

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');

  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/product-images/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': contentType,
    },
    body: bytes,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text().catch(() => '');
    return jsonResponse({ error: `Downloaded the image but could not save it to storage (HTTP ${uploadRes.status}). ${detail}` }, 502);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
  return jsonResponse({ url: publicUrl });
});
