import type { NextApiRequest, NextApiResponse } from 'next';

const DEFAULT_DBGPT_API_BASE = 'http://127.0.0.1:5670';

const getTargetPath = (path: string | string[] | undefined) => {
  const parts = Array.isArray(path) ? path : path ? [path] : [];
  return '/' + parts.map((part) => encodeURIComponent(part)).join('/');
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

  try {
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body:
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : JSON.stringify(req.body ?? {}),
    });
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
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
