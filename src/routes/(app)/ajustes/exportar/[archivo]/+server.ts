import { error } from '@sveltejs/kit';
import { EXPORT_TABLES, exportData, toCsv, type ExportTable } from '#lib/server/privacy.ts';
import { requireUserId } from '#lib/server/session.ts';
import type { RequestHandler } from './$types';

// soleva.json has everything; <table>.csv one table each, for a spreadsheet.
export const GET: RequestHandler = async (event) => {
  const userId = await requireUserId(event);
  const name = event.params.archivo;
  const table = name.replace(/\.csv$/, '') as ExportTable;
  if (name !== 'soleva.json' && !(name.endsWith('.csv') && EXPORT_TABLES.includes(table)))
    error(404);
  const data = await exportData(event.locals.db(), userId);
  const json = name === 'soleva.json';
  const day = new Date().toISOString().slice(0, 10);
  return new Response(
    json
      ? JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2)
      : // BOM, so Excel reads the accents.
        String.fromCharCode(0xfeff) + toCsv(data[table]),
    {
      headers: {
        'content-type': json ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="soleva-${json ? 'datos' : table}-${day}.${json ? 'json' : 'csv'}"`,
        'cache-control': 'no-store',
      },
    },
  );
};
