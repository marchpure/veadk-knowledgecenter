import type { NextApiRequest, NextApiResponse } from 'next';
import { getProjectDashboard } from '@/server/dataProducts';

const getProjectId = (value: string | string[] | undefined) =>
  Number(Array.isArray(value) ? value[0] : value);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const projectId = getProjectId(req.query.projectId);
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required.' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    res.status(200).json(await getProjectDashboard(projectId));
  } catch (error) {
    res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Data product dashboard request failed.',
    });
  }
}
