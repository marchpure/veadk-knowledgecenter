import type { NextApiRequest, NextApiResponse } from 'next';
import { getApplicationResultShare } from '@/server/applications/applicationRuntime';
import { ApiError } from '@/apollo/server/utils/apiUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = Array.isArray(req.query.token)
    ? req.query.token[0]
    : req.query.token;
  try {
    const result = await getApplicationResultShare(token || '');
    res.status(200).json(result);
  } catch (error) {
    res.status(error instanceof ApiError ? error.statusCode : 500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load application result share.',
    });
  }
}
