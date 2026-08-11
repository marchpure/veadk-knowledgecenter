import { AsyncLocalStorage } from 'async_hooks';

const requestProjectStorage = new AsyncLocalStorage<number>();

export const runWithRequestProjectId = <T>(
  projectId: number | undefined,
  callback: () => T,
): T => {
  if (!projectId) return callback();
  return requestProjectStorage.run(projectId, callback);
};

export const getRequestProjectId = () => requestProjectStorage.getStore();
