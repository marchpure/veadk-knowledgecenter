import { DbgptApp, DbgptAppResource } from '@/lib/dbgpt';

export const VEADK_DATA_PRODUCT_RESOURCE_PREFIX = 'veadk:project:';
export const LOCAL_APP_CONVERSATION_PREFIX = 'veadk-app-';

export type VeadkDataProductBinding = {
  key: string;
  projectId: number;
  source: 'agent' | 'native' | 'runtime';
  agentName?: string;
  resourceName?: string;
};

export type VeadkApplicationAskResponse = {
  id?: string;
  appCode?: string;
  type: 'SQL_QUERY' | 'NON_SQL_QUERY';
  sql?: string;
  summary?: string;
  explanation?: string;
  threadId: string;
  project: {
    id: number;
    displayName: string;
    type: string;
  };
  data?: {
    columns?: Array<{ name: string; type?: string }>;
    data?: unknown[][];
  };
  runtimeError?: {
    stage: 'ask' | 'sql_execution' | 'summary_generation';
    message: string;
    code?: string;
    advice?: string;
  };
};

export type VeadkApplicationAskErrorPayload = {
  error: string;
  message?: string;
  stage?: 'ask' | 'sql_execution' | 'summary_generation';
  code?: string;
  advice?: string;
  sql?: string;
  invalidSql?: string;
};

export const buildVeadkDataProductResourceKey = (projectId: number) =>
  `${VEADK_DATA_PRODUCT_RESOURCE_PREFIX}${projectId}`;

export const parseVeadkDataProductResourceKey = (value: unknown) => {
  if (typeof value !== 'string') return null;
  if (!value.startsWith(VEADK_DATA_PRODUCT_RESOURCE_PREFIX)) return null;
  const projectId = Number(
    value.slice(VEADK_DATA_PRODUCT_RESOURCE_PREFIX.length),
  );
  return Number.isFinite(projectId) && projectId > 0 ? projectId : null;
};

export const isVeadkDataProductResourceKey = (value: unknown) =>
  parseVeadkDataProductResourceKey(value) !== null;

export const createLocalApplicationConversationId = () =>
  `${LOCAL_APP_CONVERSATION_PREFIX}${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

export const isLocalApplicationConversationId = (value?: string) =>
  typeof value === 'string' && value.startsWith(LOCAL_APP_CONVERSATION_PREFIX);

export const parseResourceConfig = (value?: string) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const getResourceCandidates = (resource: DbgptAppResource) => {
  const config = parseResourceConfig(resource.value);
  return [
    config.db_name,
    config.database,
    config.project_id,
    config.projectId,
    config.value,
    resource.value,
  ];
};

const normalizeResourceType = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const dataProductResourceTypes = new Set([
  'database',
  'data_product',
  'veadk_data_product',
]);

const isDataProductResource = (resource: DbgptAppResource) => {
  const type = normalizeResourceType(resource.type);
  return (
    dataProductResourceTypes.has(type) &&
    getResourceCandidates(resource).some(
      (candidate) => parseVeadkDataProductResourceKey(candidate) !== null,
    )
  );
};

const hasNonDatabaseRuntimeResource = (app: DbgptApp) =>
  (app.details || []).some((detail) =>
    (detail.resources || []).some((resource) => {
      const type = normalizeResourceType(resource.type);
      return Boolean(type) && !dataProductResourceTypes.has(type);
    }),
  );

export const findVeadkDataProductBinding = (
  app: DbgptApp,
  options: { selectParam?: string } = {},
): VeadkDataProductBinding | null => {
  const runtimeProjectId = parseVeadkDataProductResourceKey(
    options.selectParam,
  );
  if (runtimeProjectId) {
    return {
      key: buildVeadkDataProductResourceKey(runtimeProjectId),
      projectId: runtimeProjectId,
      source: 'runtime',
      resourceName: 'Runtime data product',
    };
  }

  const nativeResource = app.param_need?.find(
    (item) => item.type === 'resource',
  );
  const nativeProjectId = parseVeadkDataProductResourceKey(
    nativeResource?.bind_value,
  );
  if (nativeProjectId) {
    return {
      key: buildVeadkDataProductResourceKey(nativeProjectId),
      projectId: nativeProjectId,
      source: 'native',
      resourceName: String(nativeResource?.value || 'Data product'),
    };
  }

  if (hasNonDatabaseRuntimeResource(app)) {
    return null;
  }

  for (const detail of app.details || []) {
    for (const resource of detail.resources || []) {
      if (!isDataProductResource(resource)) continue;
      for (const candidate of getResourceCandidates(resource)) {
        const projectId = parseVeadkDataProductResourceKey(candidate);
        if (projectId) {
          return {
            key: buildVeadkDataProductResourceKey(projectId),
            projectId,
            source: 'agent',
            agentName: detail.agent_name,
            resourceName: resource.name || 'Data product',
          };
        }
      }
    }
  }

  return null;
};

export const hasAgentRuntimeContext = (app: DbgptApp) => {
  if (!['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    return true;
  }
  const selectedDetails = (app.details || []).filter(
    (detail) => detail.agent_name,
  );
  if (!selectedDetails.length) return false;
  return selectedDetails.every((detail) => {
    const hasPrompt = Boolean(detail.prompt_template?.trim());
    const hasResources = Boolean((detail.resources || []).length);
    return hasPrompt || hasResources;
  });
};
