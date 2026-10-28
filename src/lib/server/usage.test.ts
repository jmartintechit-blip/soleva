import { afterEach, describe, expect, it, vi } from 'vitest';
import { assess, fetchNeonComputeHours, fetchWorkerUsage, levelFor } from './usage.ts';

afterEach(() => vi.unstubAllGlobals());

describe('usage', () => {
  it('warns at 70 % and alerts at 90 %', () => {
    expect([69.9, 70, 89.9, 90, 120].map(levelFor)).toEqual([
      'ok',
      'aviso',
      'aviso',
      'alerta',
      'alerta',
    ]);
  });

  it('compares each metric with its free limit', () => {
    const lines = assess({
      workerRequestsToday: 70_000,
      workerCpuP99Ms: 9.5,
      neonComputeHours: 12,
    });
    expect(lines.map((l) => [l.pct, l.level])).toEqual([
      [70, 'aviso'],
      [95, 'alerta'],
      [12, 'ok'],
    ]);
  });

  it('reads Neon CU-seconds as CU-hours', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ project: { compute_time_seconds: 7200 } }));
    expect(await fetchNeonComputeHours('k', 'p')).toBe(2);
  });

  it('reads Worker requests and CPU p99 from microseconds, counting from 00:00 UTC', async () => {
    let sent: { variables: { since: string } } | undefined;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return Response.json({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  { sum: { requests: 42 }, quantiles: { cpuTimeP99: 3500 } },
                ],
              },
            ],
          },
        },
      });
    });
    const u = await fetchWorkerUsage('t', 'a', 'soleva', new Date('2026-10-28T23:30:00+01:00'));
    expect(u).toEqual({ requests: 42, cpuP99Ms: 3.5 });
    expect(sent?.variables.since).toBe('2026-10-28T00:00:00.000Z');
  });

  it('treats a Worker without traffic as zero and surfaces GraphQL errors', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json({ data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } } }),
    );
    expect(await fetchWorkerUsage('t', 'a', 's')).toEqual({ requests: 0, cpuP99Ms: 0 });
    vi.stubGlobal('fetch', async () => Response.json({ errors: [{ message: 'not authorized' }] }));
    await expect(fetchWorkerUsage('t', 'a', 's')).rejects.toThrow('not authorized');
  });
});
