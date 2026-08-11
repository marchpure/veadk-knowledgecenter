import type { NextApiRequest, NextApiResponse } from 'next';
import { createApplicationResultShare } from '@/server/applications/applicationRuntime';
import { ApiError } from '@/apollo/server/utils/apiUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const result = await createApplicationResultShare(req.body?.apiHistoryId);
    res.status(200).json(result);
  } catch (error) {
    const payload: Record<string, unknown> = {
      error:
        error instanceof Error
          ? error.message
          : 'Unable to create application result share.',
    };
    if (error instanceof ApiError) {
      if (error.code) payload.code = error.code;
      if (error.additionalData) Object.assign(payload, error.additionalData);
    }
    res
      .status(error instanceof ApiError ? error.statusCode : 500)
      .json(payload);
  }
}
