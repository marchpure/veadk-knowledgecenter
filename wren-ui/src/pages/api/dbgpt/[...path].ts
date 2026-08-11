import type { NextApiRequest, NextApiResponse } from 'next';

const DEFAULT_DBGPT_API_BASE = 'http://127.0.0.1:5670';

export const config = {
  api: {
    bodyParser: false,
  },
};

const getTargetPath = (path: string | string[] | undefined) => {
  const parts = Array.isArray(path) ? path : path ? [path] : [];
  return '/' + parts.map((part) => encodeURIComponent(part)).join('/');
};

const isDatabaseResourceRequest = (
  targetPath: string,
  query: Record<string, string | string[]>,
) =>
  targetPath === '/api/v1/app/resources/list' &&
  query.type === 'database' &&
  (query.version === undefined || query.version === 'v2');

const mergeVeadkDatabaseResources = async (
  body: any,
  query: Record<string, string | string[]>,
) => {
  let resources: Array<{ label: string; key: string; description?: string }>;
  try {
    const runtime = await import('@/server/applications/applicationRuntime');
    resources = await runtime.listVeadkDataProductResources();
  } catch (error) {
    console.warn(
      '[dbgpt proxy] Unable to append VeADK data products to DB-GPT database resources:',
      error instanceof Error ? error.message : error,
    );
    return body;
  }
  const data = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body)
      ? body
      : [];

  if (query.version === 'v2') {
    const nextData = data.map((param: any) => {
      if (param?.param_name !== 'db_name') return param;
      const validValues = Array.isArray(param.valid_values)
        ? param.valid_values
        : [];
      const seen = new Set(validValues.map((item: any) => item?.key));
      return {
        ...param,
        valid_values: [
          ...validValues,
          ...resources.filter((item) => !seen.has(item.key)),
        ],
      };
    });
    return body?.data ? { ...body, data: nextData } : nextData;
  }

  const seen = new Set(data.map((item: any) => item?.key));
  const nextData = [
    ...data,
    ...resources.filter((item) => !seen.has(item.key)),
  ];
  return body?.data ? { ...body, data: nextData } : nextData;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const baseUrl =
    process.env.DBGPT_API_BASE_URL ||
    process.env.API_BASE_URL ||
    DEFAULT_DBGPT_API_BASE;
  let targetPath = getTargetPath(req.query.path);
  if (
    targetPath === '/api/v2/serve/connectors' &&
    (req.method === 'GET' || req.method === 'POST')
  ) {
    targetPath = '/api/v2/serve/connectors/';
  }
  const query = { ...req.query };
  delete query.path;
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }
    if (value !== undefined) searchParams.append(key, value);
  });
  const url = `${baseUrl}${targetPath}${
    searchParams.toString() ? `?${searchParams.toString()}` : ''
  }`;
  const contentType = req.headers['content-type'];
  const headers: Record<string, string> = {};
  if (contentType) headers['Content-Type'] = contentType;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers,
      body:
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : (req as unknown as BodyInit),
      duplex: 'half',
    } as RequestInit & { duplex?: 'half' });
    const responseContentType = response.headers.get('content-type') || '';
    let body = responseContentType.includes('application/json')
      ? await response.json()
      : await response.text();
    if (
      response.ok &&
      responseContentType.includes('application/json') &&
      isDatabaseResourceRequest(targetPath, query)
    ) {
      body = await mergeVeadkDatabaseResources(body, query);
    }
    res.status(response.status).send(body);
  } catch (error) {
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to reach DB-GPT service.',
      target: baseUrl,
    });
  }
}
