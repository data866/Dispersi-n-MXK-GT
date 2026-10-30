
const fields = {
  requests: [
    'date', 'week', 'distributor', 'branch', 'user',
    'followup', 'total', 'approved', 'rejected', 'unfinished'
  ],
  dispersions: [
    'date', 'distributor', 'branch', 'credits', 'amount',
    'pagare', 'montoActivado', 'hasFactorData'
  ],
  offers: [
    'month', 'distributor', 'branch', 'stage',
    'brand', 'model', 'total', 'activated', 'amount'
  ]
};

const numericFields = new Set([
  'total', 'approved', 'rejected', 'unfinished',
  'credits', 'activated', 'amount',
  'pagare', 'montoActivado'
]);

export function validatePublic(data) {
  if (!data || data.schemaVersion !== 3) {
    throw new Error('Formato no válido');
  }

  const top = [
    'schemaVersion', 'source', 'updatedAt',
    'requests', 'dispersions', 'offers',
    'historicalTotals', 'monthlyTargets', 'dailyTargets'
  ];

  if (Object.keys(data).some(k => !top.includes(k))) {
    throw new Error('Campo no autorizado');
  }

  for (const [name, allowed] of Object.entries(fields)) {
    if (!Array.isArray(data[name]) || data[name].length > 100000) {
      throw new Error('Datos no válidos');
    }

    for (const row of data[name]) {
      if (
        !row ||
        typeof row !== 'object' ||
        Array.isArray(row) ||
        Object.keys(row).some(k => !allowed.includes(k)) ||
        allowed.some(k => !(k in row))
      ) {
        throw new Error('Campo no autorizado');
      }

      for (const [k, v] of Object.entries(row)) {
        if (numericFields.has(k)) {
          if (!Number.isFinite(v) || v < 0) {
            throw new Error('Cifra inválida');
          }
        } else if (k === 'hasFactorData') {
          if (typeof v !== 'boolean') {
            throw new Error('Indicador de Factor inválido');
          }
        } else if (
          typeof v !== 'string' ||
          v.length > 200 ||
          /@|\b\d{10,}\b/.test(v)
        ) {
          throw new Error('Texto no apto');
        }
      }

      if (
        name === 'requests' &&
        row.total !== row.approved + row.rejected + row.unfinished
      ) {
        throw new Error('Conteo no válido');
      }
    }
  }

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(data.updatedAt) ||
    data.source !== 'Google Sheets / Apps Script'
  ) {
    throw new Error('Corte inválido');
  }

  const h = data.historicalTotals;

  if (
    !h ||
    Object.keys(h).some(k => !['requests', 'activations', 'sales'].includes(k)) ||
    !h.requests ||
    Object.keys(h.requests).sort().join(',') !==
      'approved,rejected,total,unfinished'
  ) {
    throw new Error('Histórico inválido');
  }

  const sums = data.requests.reduce((a, r) => {
    for (const k of Object.keys(a)) a[k] += r[k];
    return a;
  }, {
    total: 0,
    approved: 0,
    rejected: 0,
    unfinished: 0
  });

  for (const k of Object.keys(sums)) {
    if (h.requests[k] !== sums[k]) {
      throw new Error('Histórico inconsistente');
    }
  }

  if (
    !Number.isFinite(h.sales) ||
    h.sales < 0 ||
    h.activations !== data.dispersions.reduce((n, r) => n + r.credits, 0) ||
    Math.abs(
      h.sales - data.dispersions.reduce((n, r) => n + r.amount, 0)
    ) > 0.01
  ) {
    throw new Error('Activaciones inconsistentes');
  }

  for (const [name, pattern] of [
    ['monthlyTargets', /^\d{4}-(0[1-9]|1[0-2])$/],
    ['dailyTargets', /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/]
  ]) {
    if (!data[name] || Array.isArray(data[name])) {
      throw new Error('Metas inválidas');
    }

    for (const [k, v] of Object.entries(data[name])) {
      if (!pattern.test(k) || !Number.isFinite(v) || v < 0) {
        throw new Error('Meta inválida');
      }
    }
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({
      error: 'Método no permitido'
    }));
  }

  try {
    const url = process.env.SHEETS_PUBLIC_URL;

    if (
      !/^https:\/\/script\.google\.com\/(?:a\/macros\/maxikash\.mx\/s|macros\/s)\/[\w-]+\/exec$/.test(url || '')
    ) {
      throw new Error('Fuente pendiente');
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(45000),
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`Fuente no disponible: HTTP ${response.status}`);
    }

    const data = await response.json();

    return res.end(JSON.stringify(validatePublic(data)));

  } catch (error) {
    console.error('MAXIKASH /api/data:', error.message);

    res.statusCode = 503;

    return res.end(JSON.stringify({
      error: 'No fue posible actualizar los datos de Google Sheets.'
    }));
  }
}
