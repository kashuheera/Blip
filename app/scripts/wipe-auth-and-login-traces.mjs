import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadEnvFile(path.join(root, '.env.secrets'));
loadEnvFile(path.join(root, 'supabase', '.env.local'));
loadEnvFile(path.join(root, 'app', '.env'));

const projectRef = process.env.SUPABASE_PROJECT_REF ?? '';
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  (projectRef ? `https://${projectRef}.supabase.co` : '');
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.ANALYTICS_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE URL or service role key in local env files.');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = new Date();
const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
const backupDir = path.join(root, 'backups', 'db', stamp);
fs.mkdirSync(backupDir, { recursive: true });

const report = {
  startedAt: now.toISOString(),
  backupDir: path.relative(root, backupDir).replace(/\\/g, '/'),
  steps: [],
  usersBefore: 0,
  usersAfter: 0,
  activeUsersAfter: 0,
  deletedHard: 0,
  deletedSoft: 0,
  deleteFailures: [],
  authAnalyticsDeleted: 0,
  authAuditCleanup: { attempted: false, success: false, error: null },
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
};

const listAllUsers = async () => {
  const users = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    }
    const rows = data?.users ?? [];
    users.push(...rows);
    if (rows.length < perPage) {
      break;
    }
    page += 1;
  }
  return users;
};

const safeCount = async (table, column = 'id') => {
  const { count, error } = await admin.from(table).select(column, { count: 'exact', head: true });
  if (error) {
    return null;
  }
  return count ?? 0;
};

const fetchByIds = async (table, idColumn, ids) => {
  if (ids.length === 0) {
    return [];
  }
  const rows = [];
  for (const idsChunk of chunk(ids, 200)) {
    const { data, error } = await admin.from(table).select('*').in(idColumn, idsChunk);
    if (error) {
      report.steps.push(`Backup read failed for ${table}.${idColumn}: ${error.message}`);
      continue;
    }
    rows.push(...(data ?? []));
  }
  return rows;
};

const deleteByIds = async (table, idColumn, ids) => {
  if (ids.length === 0) {
    return { deleted: 0, errors: [] };
  }
  let deleted = 0;
  const errors = [];
  for (const idsChunk of chunk(ids, 200)) {
    const { error } = await admin.from(table).delete().in(idColumn, idsChunk);
    if (error) {
      errors.push(error.message);
    } else {
      deleted += idsChunk.length;
    }
  }
  return { deleted, errors };
};

const usersBefore = await listAllUsers();
const userIds = usersBefore.map((u) => u.id).filter(Boolean);
report.usersBefore = userIds.length;

const preCounts = {
  profiles: await safeCount('profiles'),
  analyticsEvents: await safeCount('analytics_events'),
  deviceFingerprints: await safeCount('device_fingerprints'),
  deviceTokens: await safeCount('device_tokens'),
  userPrivate: await safeCount('user_private'),
  kycVerificationRequests: await safeCount('kyc_verification_requests'),
};

const authEventNames = [
  'auth_sign_in',
  'auth_sign_up',
  'auth_sign_out',
  'auth_sign_in_failed',
  'auth_sign_up_failed',
  'auth_signup_failed',
  'auth_login_attempt',
];

const { data: authEventsBefore, error: authEventsBeforeError } = await admin
  .from('analytics_events')
  .select('*')
  .in('event_name', authEventNames)
  .limit(10000);
if (authEventsBeforeError) {
  report.steps.push(`Unable to read auth analytics events backup: ${authEventsBeforeError.message}`);
}

const backupPayload = {
  generatedAt: new Date().toISOString(),
  users: usersBefore.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    phone: u.phone ?? null,
    created_at: u.created_at ?? null,
    deleted_at: u.deleted_at ?? null,
    last_sign_in_at: u.last_sign_in_at ?? null,
  })),
  preCounts,
  authAnalyticsEvents: authEventsBefore ?? [],
  profiles: await fetchByIds('profiles', 'id', userIds),
  deviceFingerprints: await fetchByIds('device_fingerprints', 'user_id', userIds),
  deviceTokens: await fetchByIds('device_tokens', 'user_id', userIds),
  userPrivate: await fetchByIds('user_private', 'user_id', userIds),
  kycVerificationRequests: await fetchByIds('kyc_verification_requests', 'user_id', userIds),
};

fs.writeFileSync(path.join(backupDir, 'auth-cleanup-backup.json'), JSON.stringify(backupPayload, null, 2));
report.steps.push('Backup snapshot created.');

const { error: deleteAuthEventsError } = await admin
  .from('analytics_events')
  .delete()
  .in('event_name', authEventNames);
if (deleteAuthEventsError) {
  report.steps.push(`Failed to delete auth analytics events: ${deleteAuthEventsError.message}`);
} else {
  report.authAnalyticsDeleted = authEventsBefore?.length ?? 0;
  report.steps.push('Auth analytics events deleted.');
}

const cleanupTables = [
  { table: 'profiles', column: 'id' },
  { table: 'device_fingerprints', column: 'user_id' },
  { table: 'device_tokens', column: 'user_id' },
  { table: 'user_private', column: 'user_id' },
  { table: 'kyc_verification_requests', column: 'user_id' },
];

for (const cfg of cleanupTables) {
  const res = await deleteByIds(cfg.table, cfg.column, userIds);
  if (res.errors.length > 0) {
    report.steps.push(`Table cleanup warnings for ${cfg.table}.${cfg.column}: ${res.errors.join(' | ')}`);
  }
}

report.authAuditCleanup.attempted = true;
try {
  const { count, error: auditCountError } = await admin
    .schema('auth')
    .from('audit_log_entries')
    .select('id', { count: 'exact', head: true });
  if (auditCountError) {
    report.authAuditCleanup.error = auditCountError.message;
  } else {
    const { error: auditDeleteError } = await admin
      .schema('auth')
      .from('audit_log_entries')
      .delete()
      .not('id', 'is', null);
    if (auditDeleteError) {
      report.authAuditCleanup.error = auditDeleteError.message;
    } else {
      report.authAuditCleanup.success = true;
      report.steps.push(`Auth audit log entries deleted (${count ?? 0}).`);
    }
  }
} catch (error) {
  report.authAuditCleanup.error = error instanceof Error ? error.message : String(error);
}

for (const id of userIds) {
  const hard = await admin.auth.admin.deleteUser(id);
  if (!hard.error) {
    report.deletedHard += 1;
    continue;
  }
  const soft = await admin.auth.admin.deleteUser(id, true);
  if (!soft.error) {
    report.deletedSoft += 1;
    continue;
  }
  report.deleteFailures.push({
    id,
    hardError: hard.error.message,
    softError: soft.error.message,
  });
}

const usersAfter = await listAllUsers();
report.usersAfter = usersAfter.length;
report.activeUsersAfter = usersAfter.filter((u) => !(u.deleted_at || u.banned_until)).length;
report.endedAt = new Date().toISOString();

fs.writeFileSync(path.join(backupDir, 'auth-cleanup-report.json'), JSON.stringify(report, null, 2));

console.log('Auth cleanup completed.');
console.log(JSON.stringify({
  backupDir: report.backupDir,
  usersBefore: report.usersBefore,
  usersAfter: report.usersAfter,
  activeUsersAfter: report.activeUsersAfter,
  deletedHard: report.deletedHard,
  deletedSoft: report.deletedSoft,
  deleteFailures: report.deleteFailures.length,
  authAnalyticsDeleted: report.authAnalyticsDeleted,
  authAuditCleanup: report.authAuditCleanup,
}, null, 2));
