import process from 'node:process';

const failures = [];
const warnings = [];
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value || /replace_me|PROJECT_REF|DB_PASSWORD|POOLER_HOST/i.test(value)) {
    failures.push(`${name} is missing or still contains a placeholder.`);
  }
  return value;
};
const parseUrl = (name, value, protocols) => {
  if (!value) return;
  try {
    const parsed = new URL(value);
    if (!protocols.includes(parsed.protocol)) failures.push(`${name} must use ${protocols.join(' or ')}.`);
  } catch {
    failures.push(`${name} is not a valid URL.`);
  }
};

const databaseUrl = required('DATABASE_URL');
const redisUrl = required('REDIS_URL');
const supabaseUrl = required('SUPABASE_URL');
required('SUPABASE_JWKS_URL');
required('JWT_SECRET');
required('COOKIE_SECRET');
parseUrl('DATABASE_URL', databaseUrl, ['postgres:', 'postgresql:']);
parseUrl('REDIS_URL', redisUrl, ['redis:', 'rediss:']);
parseUrl('SUPABASE_URL', supabaseUrl, ['https:']);

if ((process.env.DATABASE_SCHEMA?.trim() || 'medusa') !== 'medusa') {
  failures.push('DATABASE_SCHEMA must be `medusa` for the shared Supabase database design.');
}
if (databaseUrl && !databaseUrl.includes('sslmode=require') && !/localhost|127\.0\.0\.1/.test(databaseUrl)) {
  warnings.push('Managed DATABASE_URL should explicitly require TLS with sslmode=require.');
}
if (redisUrl?.startsWith('redis://') && !/localhost|127\.0\.0\.1/.test(redisUrl)) {
  warnings.push('Managed Redis should normally use rediss:// for transport encryption.');
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
  warnings.push('SUPABASE_SERVICE_ROLE_KEY is absent; protected /app routes cannot resolve tenant scope yet.');
}

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Medusa configuration shape is valid. No external connection was attempted.');
}
