import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('ANALYTICS_SERVICE_ROLE_KEY') ??
  '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const decodeJwtPayload = (token: string) => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const json = atob(padded);
    return JSON.parse(json) as { sub?: string };
  } catch {
    return null;
  }
};

const buildModerationInput = (text?: string, imageUrl?: string) => {
  const input: Record<string, unknown>[] = [];
  if (text && text.trim().length > 0) {
    input.push({ type: 'text', text: text.trim() });
  }
  if (imageUrl && imageUrl.trim().length > 0) {
    input.push({ type: 'image_url', image_url: { url: imageUrl.trim() } });
  }
  return input;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'missing_supabase_env' }, 500);
  }
  if (!OPENAI_API_KEY) {
    return jsonResponse({ error: 'missing_openai_key' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token ? decodeJwtPayload(token) : null;
  const userId = payload?.sub ?? null;
  if (!userId) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: {
    content_type?: string;
    content_id?: string | null;
    text?: string;
    image_url?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const contentType = typeof body.content_type === 'string' ? body.content_type : 'unknown';
  const contentId =
    typeof body.content_id === 'string' && body.content_id.trim().length > 0
      ? body.content_id.trim()
      : null;
  const input = buildModerationInput(body.text, body.image_url);
  if (input.length === 0) {
    return jsonResponse({ error: 'no_input' }, 400);
  }

  const moderationResponse = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input,
    }),
  });

  if (!moderationResponse.ok) {
    return jsonResponse({ error: 'moderation_failed' }, 502);
  }

  const data = await moderationResponse.json();
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  const flagged = Boolean(result?.flagged);
  const categories = result?.categories ?? null;
  const model = typeof data?.model === 'string' ? data.model : 'omni-moderation-latest';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await supabase.from('moderation_events').insert({
    user_id: userId,
    content_type: contentType,
    content_id: contentId,
    status: flagged ? 'flagged' : 'allowed',
    model,
    categories,
  });

  return jsonResponse({
    allowed: !flagged,
    flagged,
    categories,
    model,
  });
});
