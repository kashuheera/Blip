import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('ANALYTICS_SERVICE_ROLE_KEY') ??
  '';
const FCM_SERVER_KEY = Deno.env.get('FCM_SERVER_KEY') ?? '';
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') ?? '';
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') ?? '';
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') ?? '';
const APNS_KEY = Deno.env.get('APNS_KEY') ?? '';

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

const base64UrlEncode = (input: string) =>
  btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');

const pemToArrayBuffer = (pem: string) => {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const raw = atob(cleaned);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    buffer[i] = raw.charCodeAt(i);
  }
  return buffer.buffer;
};

let apnsTokenCache: { token: string; expiresAt: number } | null = null;

const getApnsJwt = async () => {
  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (apnsTokenCache && apnsTokenCache.expiresAt > now + 30) {
    return apnsTokenCache.token;
  }

  const header = { alg: 'ES256', kid: APNS_KEY_ID };
  const payload = { iss: APNS_TEAM_ID, iat: now };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const keyData = pemToArrayBuffer(APNS_KEY.replace(/\\n/g, '\n'));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigBytes = new Uint8Array(signature);
  let sig = '';
  for (let i = 0; i < sigBytes.length; i += 1) {
    sig += String.fromCharCode(sigBytes[i]);
  }
  const encodedSig = base64UrlEncode(sig);
  const token = `${signingInput}.${encodedSig}`;
  apnsTokenCache = { token, expiresAt: now + 50 * 60 };
  return token;
};

const sendFcm = async (token: string, payload: Record<string, unknown>) => {
  if (!FCM_SERVER_KEY) {
    return { ok: false, error: 'missing_fcm_key' };
  }
  const response = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      priority: 'high',
      notification: payload.notification,
      data: payload.data,
    }),
  });
  return { ok: response.ok };
};

const sendApns = async (token: string, payload: Record<string, unknown>) => {
  if (!APNS_BUNDLE_ID) {
    return { ok: false, error: 'missing_apns_bundle' };
  }
  const jwt = await getApnsJwt();
  if (!jwt) {
    return { ok: false, error: 'missing_apns_key' };
  }
  const response = await fetch(`https://api.push.apple.com/3/device/${token}`, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
    },
    body: JSON.stringify({
      aps: {
        alert: payload.notification,
        sound: 'default',
      },
      data: payload.data ?? {},
    }),
  });
  return { ok: response.ok };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'missing_supabase_env' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token ? decodeJwtPayload(token) : null;
  const senderId = payload?.sub ?? null;
  if (!senderId) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  let body: {
    user_ids?: unknown;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.filter((id): id is string => typeof id === 'string')
    : [];
  if (userIds.length === 0) {
    return jsonResponse({ error: 'no_recipients' }, 400);
  }
  const title = typeof body.title === 'string' ? body.title : 'BLIP';
  const messageBody = typeof body.body === 'string' ? body.body : '';
  const data = body.data ?? {};

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .in('user_id', userIds);

  const payloadEnvelope = {
    notification: { title, body: messageBody },
    data,
  };

  let sent = 0;
  let failed = 0;
  for (const entry of tokens ?? []) {
    const tokenValue = typeof entry.token === 'string' ? entry.token : '';
    if (!tokenValue) {
      continue;
    }
    const platform = typeof entry.platform === 'string' ? entry.platform : '';
    const isIos = platform === 'ios' || platform === 'apns';
    const result = isIos ? await sendApns(tokenValue, payloadEnvelope) : await sendFcm(tokenValue, payloadEnvelope);
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return jsonResponse({ sent, failed, recipients: userIds.length });
});
