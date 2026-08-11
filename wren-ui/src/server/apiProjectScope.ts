import type { NextApiRequest, NextApiResponse } from 'next';
import { runWithRequestProjectId } from './requestProjectContext';

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export const getRequestProjectIdFromApi = (req: NextApiRequest) => {
  const headerProjectId = getQueryValue(
    req.headers['x-veadk-project-id'] as string | string[] | undefined,
  );
  const bodyProjectId =
    typeof req.body === 'object' && req.body ? req.body.projectId : undefined;
  const queryProjectId = getQueryValue(req.query.projectId);
  const projectId = Number(headerProjectId || bodyProjectId || queryProjectId);
  return Number.isFinite(projectId) && projectId > 0 ? projectId : undefined;
};

export const withApiProjectScope = (
  handler: (req: NextApiRequest, res: NextApiResponse) => unknown,
) => {
  return (req: NextApiRequest, res: NextApiResponse) =>
    runWithRequestProjectId(getRequestProjectIdFromApi(req), () =>
      handler(req, res),
    );
};
