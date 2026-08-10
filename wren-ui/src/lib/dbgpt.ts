export type DbgptEnvelope<T> = {
  data?: T;
  err_code?: string | null;
  err_msg?: string | null;
  success?: boolean;
};

export type DbgptKnowledgeSpace = {
  id: string | number;
  name: string;
  desc?: string;
  docs?: string | number;
  owner?: string;
  vector_type?: string;
  domain_type?: string;
  index_methods?: string[];
  gmt_created?: string;
  gmt_modified?: string;
};

export type DbgptKnowledgeStats = {
  graph_vertex_count?: number | null;
  graph_edge_count?: number | null;
};

export type DbgptFlow = {
  uid: string;
  name: string;
  label?: string;
  description?: string;
  source?: string;
  editable?: boolean;
  state?: string;
  define_type?: string;
  nick_name?: string;
  gmt_modified?: string;
  flow_data?: DbgptFlowData;
  variables?: DbgptFlowVariable[];
  error_message?: string;
};

export type DbgptFlowResponse = {
  items: DbgptFlow[];
  total_count: number;
  total_pages: number;
  page: number;
  page_size: number;
};

export type ConnectorStatus =
  | 'active'
  | 'error'
  | 'disconnected'
  | 'needs_reactivation';

export type ConnectorAuthField = {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'select';
  required: boolean;
  options?: string[];
  default?: string;
};

export type ConnectorCatalogEntry = {
  type: string;
  display_name: string;
  description?: string;
  icon?: string;
  category: string;
  is_custom?: boolean;
  auth_fields: ConnectorAuthField[];
};

export type ConnectorInstance = {
  id: string;
  connector_id?: string;
  connector_type: string;
  display_name: string;
  status: ConnectorStatus;
  config?: Record<string, unknown>;
  created_at?: string;
  is_custom?: boolean;
};

export type ConnectorToolSummary = {
  name: string;
  original_name?: string;
  description?: string;
  args?: Record<string, unknown>;
};

export type ConnectorToolsResponse = {
  connector_id: string;
  state: 'active' | 'inactive' | 'not_mcp';
  tools: ConnectorToolSummary[];
};

export type DbgptFlowState =
  | 'deployed'
  | 'developing'
  | 'initializing'
  | 'testing'
  | 'disabled'
  | 'running'
  | 'load_failed';

export type DbgptFlowNodeParameter = {
  id: string;
  type_name: string;
  type_cls: string;
  label: string;
  name: string;
  category: string;
  optional?: boolean;
  default?: unknown;
  placeholder?: unknown;
  description?: string;
  options?: unknown;
  value?: unknown;
  is_list?: boolean;
  dynamic?: boolean;
  dynamic_minimum?: number;
  ui?: {
    ui_type?: string;
    language?: string;
    file_types?: string;
    action?: string;
    attr?: Record<string, unknown>;
    editor?: {
      width?: number;
      height?: number;
    };
    show_input?: boolean;
    refresh?: boolean;
    refresh_depends?: string[];
  };
};

export type DbgptFlowNodePort = {
  type_name: string;
  type_cls: string;
  label: string;
  name: string;
  description?: string;
  id: string;
  optional?: boolean;
  value?: unknown;
  is_list?: boolean;
  dynamic?: boolean;
  dynamic_minimum?: number;
};

export type DbgptFlowNode = {
  id: string;
  type_name: string;
  type_cls: string;
  parent_cls?: string;
  label: string;
  name: string;
  description?: string;
  category: string;
  category_label: string;
  flow_type: 'resource' | 'operator';
  icon?: string;
  documentation_url?: string | null;
  tags?: Record<string, unknown>;
  parameters?: DbgptFlowNodeParameter[];
  inputs?: DbgptFlowNodePort[];
  outputs?: DbgptFlowNodePort[];
  version?: string;
  selected?: boolean;
  invalid?: boolean;
};

export type DbgptFlowDataNode = {
  width?: number;
  height?: number;
  id: string;
  position: { x: number; y: number };
  position_absolute?: { x: number; y: number };
  positionAbsolute?: { x: number; y: number };
  data: DbgptFlowNode;
  type: string;
};

export type DbgptFlowDataEdge = {
  source: string;
  target: string;
  source_handle?: string;
  sourceHandle?: string;
  target_handle?: string;
  targetHandle?: string;
  id: string;
  type?: string;
};

export type DbgptFlowVariable = {
  key?: string;
  name?: string;
  scope?: string;
  scope_key?: string;
  sys_code?: string;
  user_name?: string;
  value?: unknown;
};

export type DbgptFlowData = {
  nodes: DbgptFlowDataNode[];
  edges: DbgptFlowDataEdge[];
  variables?: DbgptFlowVariable[];
  viewport?: { x: number; y: number; zoom: number };
};

export type DbgptFlowPayload = {
  name: string;
  label: string;
  editable: boolean;
  deploy?: boolean;
  description?: string;
  uid?: string;
  flow_data?: DbgptFlowData;
  state?: DbgptFlowState;
  variables?: DbgptFlowVariable[];
};

export type DbgptApp = {
  app_code: string;
  app_name: string;
  app_describe?: string;
  language?: 'en' | 'zh';
  team_mode?: string;
  team_context?: Record<string, unknown>;
  details?: DbgptAppDetail[];
  is_collected?: string;
  updated_at?: string;
  hot_value?: number;
  owner_name?: string;
  owner_avatar_url?: string;
  published?: string;
  param_need?: DbgptAppParamNeed[];
  recommend_questions?: Array<Record<string, unknown>>;
  conv_uid?: string;
};

export type DbgptAppListResponse = {
  total_count: number;
  app_list: DbgptApp[];
  current_page: number;
  total_page: number;
};

export type DbgptAppDetail = {
  agent_name?: string;
  app_code?: string;
  llm_strategy?: string;
  llm_strategy_value?: string;
  resources?: DbgptAppResource[];
  key?: string;
  prompt_template?: string;
  recommend_questions?: string[];
};

export type DbgptAppResource = {
  name?: string;
  type?: string;
  value?: string;
  is_dynamic?: boolean;
};

export type DbgptAppParamNeed = {
  type: string;
  value: unknown;
  bind_value?: string;
};

export type DbgptTeamMode = {
  name?: string;
  value: string;
  name_cn?: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  remark?: string;
  remark_en?: string;
};

export type DbgptAppPayload = {
  app_code?: string;
  app_name?: string;
  app_describe?: string;
  team_mode?: string;
  language?: 'zh' | 'en';
  details?: DbgptAppDetail[];
  team_context?: Record<string, unknown>;
  param_need?: DbgptAppParamNeed[];
  recommend_questions?: Array<Record<string, unknown>>;
};

export type DbgptDialogue = {
  conv_uid: string;
  user_name?: string;
  chat_mode?: string;
  app_code?: string;
};

export type DbgptAgent = {
  name: string;
  label?: string;
  desc?: string;
  describe?: string;
  system_message?: string;
};

export type DbgptStrategy = {
  name: string;
  name_cn?: string;
  value: string;
  description?: string;
  description_en?: string;
};

export type DbgptResourceOption = {
  label: string;
  key: string;
  description?: string;
};

export type DbgptNativeScene = {
  chat_scene: string;
  scene_name: string;
  scene_describe?: string;
  param_title?: string;
  show_disable?: boolean;
  param_need: DbgptAppParamNeed[];
};

export type DbgptPrompt = {
  prompt_code: string;
  prompt_name: string;
  content?: string;
};

export type DbgptPromptListResponse = {
  items: DbgptPrompt[];
  total_count: number;
  total_pages: number;
  page: number;
  page_size: number;
};

export function unwrapDbgpt<T>(payload: DbgptEnvelope<T> | T): T {
  if (
    payload &&
    typeof payload === 'object' &&
    ('data' in payload || 'success' in payload)
  ) {
    return ((payload as DbgptEnvelope<T>).data ?? payload) as T;
  }
  return payload as T;
}

export async function fetchDbgpt<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/dbgpt${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.err_msg ||
      `DB-GPT request failed with HTTP ${response.status}`;
    throw new Error(message);
  }
  return unwrapDbgpt<T>(payload);
}

export function mapFlowDataToReactFlow(flowData?: DbgptFlowData): DbgptFlowData {
  if (!flowData) {
    return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  }
  return {
    ...flowData,
    nodes: (flowData.nodes || []).map((node) => {
      const { position_absolute: positionAbsolute, ...rest } = node;
      return {
        ...rest,
        positionAbsolute: node.positionAbsolute || positionAbsolute,
      };
    }),
    edges: (flowData.edges || []).map((edge) => {
      const {
        source_handle: sourceHandle,
        target_handle: targetHandle,
        ...rest
      } = edge;
      return {
        ...rest,
        sourceHandle: edge.sourceHandle || sourceHandle,
        targetHandle: edge.targetHandle || targetHandle,
        type: edge.type || 'buttonedge',
      };
    }),
  };
}

export function mapReactFlowToFlowData(flowData: DbgptFlowData): DbgptFlowData {
  return {
    ...flowData,
    nodes: (flowData.nodes || []).map((node) => {
      const { positionAbsolute, ...rest } = node;
      return {
        ...rest,
        position_absolute: positionAbsolute,
      };
    }),
    edges: (flowData.edges || []).map((edge) => {
      const { sourceHandle, targetHandle, ...rest } = edge;
      return {
        ...rest,
        source_handle: sourceHandle,
        target_handle: targetHandle,
      };
    }),
  };
}

export function getUniqueFlowNodeId(
  nodeData: DbgptFlowNode,
  nodes: Array<{ data?: DbgptFlowNode }>,
) {
  let count = 0;
  nodes.forEach((node) => {
    if (node.data?.name === nodeData.name) count += 1;
  });
  return `${nodeData.id}_${count}`;
}

export function normalizeConnector(
  connector: ConnectorInstance,
): ConnectorInstance {
  const id = connector.id || connector.connector_id;
  return {
    ...connector,
    id,
    is_custom: connector.is_custom ?? false,
  };
}
