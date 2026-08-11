import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createSampleDataProduct,
  createDataProduct,
  listDataProducts,
} from '@/server/dataProducts';
import { SampleDatasetName } from '@/apollo/server/data';
import { sendApiError } from '@/server/apiErrorResponse';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === 'GET') {
      res.status(200).json({ data: await listDataProducts() });
      return;
    }
    if (req.method === 'POST') {
      if (req.body?.template) {
        if (!(req.body.template in SampleDatasetName)) {
          res.status(400).json({ error: 'Invalid sample dataset template.' });
          return;
        }
        res
          .status(200)
          .json(
            await createSampleDataProduct(
              req.body.template as SampleDatasetName,
            ),
          );
        return;
      }
      res.status(200).json(await createDataProduct(req.body));
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    sendApiError(res, error);
  }
}
