import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANALYTICS_SERVICE_ROLE_KEY = Deno.env.get('ANALYTICS_SERVICE_ROLE_KEY') ?? '';

const ALLOWED_EVENTS = new Set([
  'appeal_submit',
  'auth_sign_in',
  'auth_sign_up',
  'business_verification_requested',
  'business_view',
  'bug_report_submit',
  'chat_request_sent',
  'filter_toggle',
  'phone_verification',
  'push_permission',
  'identity_switch',
  'location_permission',
  'message_send',
  'onboarding_completed',
  'order_place',
  'place_save',
  'place_view',
  'post_bookmark',
  'post_comment',
  'post_create',
  'post_reaction',
  'post_repost',
  'post_share',
  'post_view',
  'report_submit',
  'review_submit',
  'room_join',
  'screen_view',
  'search_query',
  'session_start',
  'signup_confirmed',
]);

const MAX_EVENTS = 50;
const MAX_PROP_KEYS = 24;
const MAX_STRING_LENGTH = 200;
const MAX_ARRAY_LENGTH = 12;

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

const sanitizePrimitive = (value: unknown) => {
  if (typeof value === 'string') {
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value === null) {
    return null;
  }
  return undefined;
};

const sanitizeProps = (input: unknown) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {} as Record<string, unknown>;
  }
  const output: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_PROP_KEYS) {
      break;
    }
    if (typeof key !== 'string' || key.length > 64) {
      continue;
    }
    if (Array.isArray(value)) {
      const sanitized = value
        .slice(0, MAX_ARRAY_LENGTH)
        .map((item) => sanitizePrimitive(item))
        .filter((item) => item !== undefined);
      output[key] = sanitized;
      count += 1;
      continue;
    }
    const primitive = sanitizePrimitive(value);
    if (primitive !== undefined) {
      output[key] = primitive;
      count += 1;
    }
  }
  return output;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }
  if (!SUPABASE_URL || !ANALYTICS_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'missing_env' }, 500);
  }
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token ? decodeJwtPayload(token) : null;
  const userId = payload?.sub ?? null;
  if (!userId) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: { events?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const incoming = Array.isArray(body.events) ? body.events : [];
  if (incoming.length === 0) {
    return jsonResponse({ error: 'no_events' }, 400);
  }

  const rows = [] as {
    user_id: string;
    session_id: string;
    event_name: string;
    event_props: Record<string, unknown>;
  }[];

  for (const raw of incoming.slice(0, MAX_EVENTS)) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const record = raw as {
      name?: unknown;
      session_id?: unknown;
      ts?: unknown;
      anon_id?: unknown;
      props?: unknown;
    };
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    if (!name || !ALLOWED_EVENTS.has(name)) {
      continue;
    }
    const sessionId = typeof record.session_id === 'string' ? record.session_id.trim() : '';
    if (!sessionId) {
      continue;
    }
    const eventProps = sanitizeProps(record.props);
    if (typeof record.anon_id === 'string' && record.anon_id.trim()) {
      eventProps.anon_id = record.anon_id.trim();
    }
    if (typeof record.ts === 'number') {
      eventProps.client_ts = record.ts;
    }
    rows.push({
      user_id: userId,
      session_id: sessionId,
      event_name: name,
      event_props: eventProps,
    });
  }

  if (rows.length === 0) {
    return jsonResponse({ error: 'no_valid_events' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, ANALYTICS_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await supabase.from('analytics_events').insert(rows);
  if (error) {
    return jsonResponse({ error: 'insert_failed' }, 500);
  }

  return jsonResponse({ inserted: rows.length });
});
