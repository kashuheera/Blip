import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_STAGES = [25, 50, 100];
const DEFAULT_DURATION_SEC = 30;
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MODE = 'read';
const DEFAULT_WRITE_RATIO = 0.2;
const ENV_PATH = path.resolve(process.cwd(), 'app', '.env');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const [key, ...rest] = line.split('=');
    if (!key) {
      continue;
    }
    const value = rest.join('=').trim();
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
      process.env[key] = value;
    }
  }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const opts = {
    stages: DEFAULT_STAGES.slice(),
    durationSec: DEFAULT_DURATION_SEC,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    city: 'Lahore',
    mode: DEFAULT_MODE,
    writeRatio: DEFAULT_WRITE_RATIO,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--stages' && args[i + 1]) {
      opts.stages = args[i + 1]
        .split(',')
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0);
      i += 1;
    } else if (arg === '--duration' && args[i + 1]) {
      const value = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(value) && value > 0) {
        opts.durationSec = value;
      }
      i += 1;
    } else if (arg === '--timeout' && args[i + 1]) {
      const value = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(value) && value > 0) {
        opts.timeoutMs = value;
      }
      i += 1;
    } else if (arg === '--city' && args[i + 1]) {
      opts.city = args[i + 1].trim();
      i += 1;
    } else if (arg === '--mode' && args[i + 1]) {
      opts.mode = args[i + 1].trim().toLowerCase();
      i += 1;
    } else if (arg === '--write-ratio' && args[i + 1]) {
      const value = Number.parseFloat(args[i + 1]);
      if (Number.isFinite(value) && value >= 0 && value <= 1) {
        opts.writeRatio = value;
      }
      i += 1;
    }
  }
  if (opts.stages.length === 0) {
    opts.stages = DEFAULT_STAGES.slice();
  }
  return opts;
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
};

const percentile = (values, pct) => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * pct));
  return sorted[index];
};

const summarize = (label, durations, errorCount) => {
  const total = durations.length + errorCount;
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const p99 = percentile(durations, 0.99);
  const avg =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;
  return {
    label,
    total,
    ok: durations.length,
    errorCount,
    errorRate: total > 0 ? (errorCount / total) * 100 : 0,
    avg,
    p50,
    p95,
    p99,
  };
};

const formatSummary = (summary) =>
  `${summary.label} | req: ${summary.total} ok: ${summary.ok} err: ${
    summary.errorCount
  } (${summary.errorRate.toFixed(2)}%) avg: ${summary.avg.toFixed(1)}ms p50: ${summary.p50.toFixed(
    1
  )}ms p95: ${summary.p95.toFixed(1)}ms p99: ${summary.p99.toFixed(1)}ms`;

const runStage = async ({
  concurrency,
  durationSec,
  timeoutMs,
  requests,
  baseHeaders,
  writeRatio,
}) => {
  const stopAt = performance.now() + durationSec * 1000;
  const stats = new Map();
  for (const request of requests) {
    stats.set(request.name, { durations: [], errors: 0 });
  }
  const readRequests = requests.filter((request) => request.kind !== 'write');
  const writeRequests = requests.filter((request) => request.kind === 'write');

  const worker = async () => {
    while (performance.now() < stopAt) {
      const useWrite = writeRequests.length > 0 && Math.random() < writeRatio;
      const pool = useWrite ? writeRequests : readRequests;
      const request = pool[Math.floor(Math.random() * pool.length)];
      const start = performance.now();
      try {
        const headers = {
          ...baseHeaders,
          ...(request.headers ?? {}),
        };
        const options = {
          method: request.method ?? 'GET',
          headers,
        };
        if (request.body) {
          options.body = JSON.stringify(request.body());
        }
        const res = await fetchWithTimeout(request.url, options, timeoutMs);
        if (!res.ok) {
          stats.get(request.name).errors += 1;
        } else {
          await res.arrayBuffer();
          stats.get(request.name).durations.push(performance.now() - start);
        }
      } catch {
        stats.get(request.name).errors += 1;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return stats;
};

const getAuthToken = async ({ supabaseUrl, supabaseAnonKey, email, password }) => {
  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    },
    DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Auth failed (${res.status}): ${errorText}`);
  }
  const payload = await res.json();
  return {
    accessToken: payload.access_token,
    userId: payload.user?.id ?? null,
  };
};

const pickRoomId = async ({ supabaseUrl, headers }) => {
  const res = await fetchWithTimeout(
    `${supabaseUrl}/rest/v1/rooms?select=id&limit=1`,
    { headers },
    DEFAULT_TIMEOUT_MS
  );
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }
  return typeof data[0]?.id === 'string' ? data[0].id : null;
};

const main = async () => {
  loadEnvFile(ENV_PATH);
  const opts = parseArgs();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL/EXPO_PUBLIC_SUPABASE_URL or anon key.');
    process.exit(1);
  }

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };

  const cityFilter = opts.city ? `&city=eq.${encodeURIComponent(opts.city)}` : '';
  const readRequests = [
    {
      name: 'map_businesses',
      url: `${supabaseUrl}/rest/v1/businesses?select=id,name,category,latitude,longitude,verified,city${cityFilter}&limit=50`,
    },
    {
      name: 'map_rooms',
      url: `${supabaseUrl}/rest/v1/rooms?select=id,title,latitude,longitude,category,radius_meters&limit=50`,
    },
    {
      name: 'feed_posts',
      url: `${supabaseUrl}/rest/v1/posts?select=id,created_at&order=created_at.desc&limit=20`,
    },
  ];

  let writeRequests = [];
  const mode = opts.mode === 'mixed' ? 'mixed' : 'read';
  let authToken = null;
  let authUserId = null;
  let roomId = null;

  if (mode === 'mixed') {
    writeRequests.push({
      name: 'write_bug_report',
      kind: 'write',
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/bug_reports`,
      headers: { Prefer: 'return=minimal' },
      body: () => ({
        user_id: null,
        email: null,
        title: 'Load test report',
        body: `Load test ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        app_version: 'load-test',
        platform: 'script',
        route: 'load-test',
      }),
    });

    const email = process.env.LOAD_TEST_EMAIL ?? '';
    const password = process.env.LOAD_TEST_PASSWORD ?? '';
    if (email && password) {
      try {
        const auth = await getAuthToken({ supabaseUrl, supabaseAnonKey, email, password });
        authToken = auth.accessToken;
        authUserId = auth.userId;
      } catch (error) {
        console.warn('Auth token fetch failed. Continuing with public writes only.');
      }
    }

    if (authToken && authUserId) {
      const authedHeaders = {
        Authorization: `Bearer ${authToken}`,
        apikey: supabaseAnonKey,
      };
      roomId = await pickRoomId({ supabaseUrl, headers: authedHeaders });

      writeRequests.push({
        name: 'write_post',
        kind: 'write',
        method: 'POST',
        url: `${supabaseUrl}/rest/v1/posts`,
        headers: { Authorization: `Bearer ${authToken}`, Prefer: 'return=minimal' },
        body: () => ({
          user_id: authUserId,
          author_handle: 'load_test',
          body: `Load test post ${Math.random().toString(36).slice(2, 8)}`,
          area_key: 'lahore_demo',
        }),
      });

      if (roomId) {
        writeRequests.push({
          name: 'write_room_message',
          kind: 'write',
          method: 'POST',
          url: `${supabaseUrl}/rest/v1/room_messages`,
          headers: { Authorization: `Bearer ${authToken}`, Prefer: 'return=minimal' },
          body: () => ({
            room_id: roomId,
            user_id: authUserId,
            author_handle: 'load_test',
            body: `Load test msg ${Math.random().toString(36).slice(2, 8)}`,
          }),
        });
      }
    }
  }

  const requests = [...readRequests, ...writeRequests];

  console.log('BLIP load test starting...');
  console.log(`Mode: ${mode} (write ratio ${opts.writeRatio})`);
  console.log(`Stages: ${opts.stages.join(', ')} users, duration: ${opts.durationSec}s each`);
  console.log(`City filter: ${opts.city || 'none'}`);
  if (mode === 'mixed' && authToken) {
    console.log('Auth writes: enabled (posts + room messages).');
  } else if (mode === 'mixed') {
    console.log('Auth writes: disabled (public bug report writes only).');
  }

  for (const concurrency of opts.stages) {
    console.log(`\nStage ${concurrency} virtual users for ${opts.durationSec}s`);
    const stats = await runStage({
      concurrency,
      durationSec: opts.durationSec,
      timeoutMs: opts.timeoutMs,
      requests,
      baseHeaders: headers,
      writeRatio: mode === 'mixed' ? opts.writeRatio : 0,
    });
    for (const request of requests) {
      const { durations, errors } = stats.get(request.name);
      const summary = summarize(request.name, durations, errors);
      console.log(formatSummary(summary));
    }
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
