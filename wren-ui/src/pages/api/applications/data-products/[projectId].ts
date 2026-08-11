import type { NextApiRequest, NextApiResponse } from 'next';
import { getVeadkDataProductRuntimeInfo } from '@/server/applications/applicationRuntime';
import { ApiError } from '@/apollo/server/utils/apiUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const value = Array.isArray(req.query.projectId)
    ? req.query.projectId[0]
    : req.query.projectId;
  const preflight =
    (Array.isArray(req.query.preflight)
      ? req.query.preflight[0]
      : req.query.preflight) === '1';
  try {
    const data = await getVeadkDataProductRuntimeInfo(Number(value));
    res.status(200).json(preflight ? { ...data, available: true } : data);
  } catch (error) {
    if (preflight && error instanceof ApiError && error.statusCode === 404) {
      res.status(200).json({
        available: false,
        error: error.message,
      });
      return;
    }
    res.status(error instanceof ApiError ? error.statusCode : 500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load data product runtime info.',
    });
  }
}
