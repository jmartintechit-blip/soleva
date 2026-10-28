import { assess, fetchNeonComputeHours, fetchWorkerUsage } from './usage.ts';

const env = process.env;
const missing = [
  'NEON_API_KEY',
  'NEON_PROJECT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
].filter((k) => !env[k]);
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}

const [neonComputeHours, worker] = await Promise.all([
  fetchNeonComputeHours(env.NEON_API_KEY!, env.NEON_PROJECT_ID!),
  fetchWorkerUsage(env.CLOUDFLARE_API_TOKEN!, env.CLOUDFLARE_ACCOUNT_ID!, 'soleva'),
]);

const lines = assess({
  workerRequestsToday: worker.requests,
  workerCpuP99Ms: worker.cpuP99Ms,
  neonComputeHours,
});
for (const l of lines) {
  const mark = l.level === 'ok' ? 'ok' : l.level.toUpperCase();
  console.log(`${mark.padEnd(6)} ${l.name}: ${+l.used.toFixed(2)} de ${l.limit} (${l.pct} %)`);
}

// A non-zero exit fails the scheduled CI job, and GitHub emails the failure.
if (lines.some((l) => l.level !== 'ok')) process.exit(1);
