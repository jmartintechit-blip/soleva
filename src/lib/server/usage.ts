// Free-plan limits checked on 27-oct-2026 (PROJECT_PLAN §6). Update them if a plan changes.
export const LIMITS = {
  workerRequestsPerDay: 100_000,
  workerCpuMsPerRequest: 10,
  neonComputeHoursPerMonth: 100,
};

export type Usage = {
  workerRequestsToday: number;
  workerCpuP99Ms: number;
  neonComputeHours: number;
};

export type Level = 'ok' | 'aviso' | 'alerta';

export type Line = { name: string; used: number; limit: number; pct: number; level: Level };

export function levelFor(pct: number): Level {
  return pct >= 90 ? 'alerta' : pct >= 70 ? 'aviso' : 'ok';
}

export function assess(u: Usage): Line[] {
  const rows: [string, number, number][] = [
    ['Peticiones del Worker hoy', u.workerRequestsToday, LIMITS.workerRequestsPerDay],
    ['CPU p99 por petición (ms)', u.workerCpuP99Ms, LIMITS.workerCpuMsPerRequest],
    ['CU-horas de Neon este mes', u.neonComputeHours, LIMITS.neonComputeHoursPerMonth],
  ];
  return rows.map(([name, used, limit]) => {
    const pct = Math.round((used / limit) * 1000) / 10;
    return { name, used, limit, pct, level: levelFor(pct) };
  });
}

// compute_time_seconds is CU-seconds (0.25 CU × active seconds), so /3600 gives CU-hours.
export async function fetchNeonComputeHours(apiKey: string, projectId: string): Promise<number> {
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Neon responded ${res.status}: ${await res.text()}`);
  const { project } = (await res.json()) as { project: { compute_time_seconds: number } };
  return project.compute_time_seconds / 3600;
}

const WORKER_QUERY = `query ($accountTag: string!, $script: string!, $since: Time!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    workersInvocationsAdaptive(limit: 1, filter: { scriptName: $script, datetime_geq: $since }) {
      sum { requests }
      quantiles { cpuTimeP99 }
    }
  } }
}`;

// Requests since 00:00 UTC, when the Workers daily quota resets. cpuTimeP99 comes in microseconds.
export async function fetchWorkerUsage(
  apiToken: string,
  accountId: string,
  script: string,
  now = new Date(),
): Promise<{ requests: number; cpuP99Ms: number }> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: WORKER_QUERY,
      variables: { accountTag: accountId, script, since: since.toISOString() },
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare responded ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    data?: { viewer: { accounts: { workersInvocationsAdaptive: WorkerGroup[] }[] } };
    errors?: { message: string }[] | null;
  };
  if (body.errors?.length) throw new Error(`Cloudflare GraphQL: ${body.errors[0].message}`);
  const group = body.data?.viewer.accounts[0]?.workersInvocationsAdaptive[0];
  return {
    requests: group?.sum.requests ?? 0,
    cpuP99Ms: (group?.quantiles.cpuTimeP99 ?? 0) / 1000,
  };
}

type WorkerGroup = { sum: { requests: number }; quantiles: { cpuTimeP99: number } };
