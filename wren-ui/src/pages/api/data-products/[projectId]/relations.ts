import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getProjectRelations,
  saveProjectRelations,
} from '@/server/dataProducts';
import { sendApiError } from '@/server/apiErrorResponse';

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
  try {
    if (req.method === 'GET') {
      res.status(200).json({ data: await getProjectRelations(projectId) });
      return;
    }
    if (req.method === 'POST') {
      res
        .status(200)
        .json(await saveProjectRelations(projectId, req.body.relations || []));
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    sendApiError(res, error);
  }
}
