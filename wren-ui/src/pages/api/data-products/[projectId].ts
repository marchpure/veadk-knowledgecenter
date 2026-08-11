import type { NextApiRequest, NextApiResponse } from 'next';
import {
  deleteDataProduct,
  getDataProduct,
  updateDataProductSource,
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
      res.status(200).json(await getDataProduct(projectId));
      return;
    }
    if (req.method === 'PATCH') {
      res.status(200).json(await updateDataProductSource(projectId, req.body));
      return;
    }
    if (req.method === 'DELETE') {
      await deleteDataProduct(projectId);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    sendApiError(res, error);
  }
}
