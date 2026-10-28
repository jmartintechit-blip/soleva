import { assess, fetchNeonComputeHours, fetchWorkerUsage } from './usage.ts';

const env = process.env;
const missing = [
  'NEON_API_KEY',
  'NEON_PROJECT_ID',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
].filter((k) => !env[k]);
// GitHub shows ::error/::warning lines as annotations, so a real failure never looks like a warning.
const fail = (message: string): never => {
  console.error(`::error title=FALLO del script de consumo::${message}`);
  process.exit(1);
};
if (missing.length) fail(`Faltan secretos: ${missing.join(', ')}`);

const [neonComputeHours, worker] = await Promise.all([
  fetchNeonComputeHours(env.NEON_API_KEY!, env.NEON_PROJECT_ID!),
  fetchWorkerUsage(env.CLOUDFLARE_API_TOKEN!, env.CLOUDFLARE_ACCOUNT_ID!, 'soleva'),
]).catch((e: unknown) => fail(`No se pudo leer el consumo: ${e instanceof Error ? e.message : e}`));

const lines = assess({
  workerRequestsToday: worker.requests,
  workerCpuP50Ms: worker.cpuP50Ms,
  neonComputeHours,
});
for (const l of lines) {
  const mark = l.level === 'ok' ? 'ok' : l.level.toUpperCase();
  console.log(`${mark.padEnd(6)} ${l.name}: ${+l.used.toFixed(2)} de ${l.limit} (${l.pct} %)`);
}

// Over 70 % the job still fails (so GitHub emails it), but says it is the expected warning.
const over = lines.filter((l) => l.level !== 'ok');
for (const l of over) {
  const kind = l.level === 'alerta' ? 'error' : 'warning';
  console.log(
    `::${kind} title=${l.level.toUpperCase()} de consumo, no es un fallo::${l.name} al ${l.pct} % del límite gratuito`,
  );
}
if (over.length) {
  console.log(
    'El job sale en rojo a propósito: es el AVISO de consumo (≥ 70 %) o la ALERTA (≥ 90 %), no un error del script.',
  );
  process.exit(1);
}
