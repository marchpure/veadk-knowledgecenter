import {
  DbgptApp,
  DbgptAppListResponse,
  DbgptChatHistoryMessage,
  DbgptDialogue,
  DbgptShareLink,
  DbgptTeamMode,
  fetchDbgpt,
} from '@/lib/dbgpt';
import {
  createLocalApplicationConversationId,
  findVeadkDataProductBinding,
  hasAgentRuntimeContext,
  isLocalApplicationConversationId,
  VeadkApplicationAskResponse,
} from '@/lib/veadkApplicationResources';

export const isAppPublished = (app: DbgptApp) =>
  String(app.published) === 'true';

export const getAppChatScene = (app: DbgptApp) => {
  const scene = app.team_context?.chat_scene;
  return typeof scene === 'string' && scene ? scene : 'chat_agent';
};

export const getAppChatMode = (app: DbgptApp) =>
  app.team_mode === 'native_app' ? getAppChatScene(app) : 'chat_agent';

const getAppSelectParam = (app: DbgptApp) => {
  if (app.team_mode !== 'native_app') return undefined;
  const resource = app.param_need?.find((item) => item.type === 'resource');
  if (typeof resource?.bind_value === 'string' && resource.bind_value) {
    return resource.bind_value;
  }
  return undefined;
};

export const getAppModel = (app: DbgptApp) => {
  const model = app.param_need?.find((item) => item.type === 'model')?.value;
  return typeof model === 'string' && model ? model : undefined;
};

const runtimeSelectedResourceTypes = new Set(['database', 'knowledge']);
const optionalMediaResourceTypes = new Set([
  'excel_file',
  'image_file',
  'audio_file',
  'video_file',
]);

const isRuntimeSelectedResource = (type: unknown) =>
  typeof type === 'string' && runtimeSelectedResourceTypes.has(type);

const isOptionalMediaResource = (type: unknown) =>
  typeof type === 'string' && optionalMediaResourceTypes.has(type);

export const createAppDialogue = async (
  app: DbgptApp,
  options: { selectParam?: string } = {},
) => {
  if (findVeadkDataProductBinding(app, options)) {
    return {
      convUid: createLocalApplicationConversationId(),
      chatMode: 'veadk_data_product',
    };
  }
  const chatMode = getAppChatMode(app);
  const dialogue = await fetchDbgpt<DbgptDialogue>(
    `/api/v1/chat/dialogue/new?chat_mode=${encodeURIComponent(chatMode)}`,
    {
      method: 'POST',
      body: JSON.stringify({ chat_mode: chatMode }),
    },
  );
  return {
    convUid: dialogue.conv_uid,
    chatMode: dialogue.chat_mode || chatMode,
  };
};

export const buildChatBody = (
  app: DbgptApp,
  convUid: string,
  input: string,
  options: { selectParam?: string } = {},
) => {
  const body: Record<string, unknown> = {
    conv_uid: convUid,
    app_code: app.app_code,
    chat_mode: getAppChatMode(app),
    user_input: input,
  };
  const model = getAppModel(app);
  const selectParam = options.selectParam || getAppSelectParam(app);
  const temperature = app.param_need?.find(
    (item) => item.type === 'temperature',
  )?.value;
  const maxNewTokens = app.param_need?.find(
    (item) => item.type === 'max_new_tokens',
  )?.value;

  if (model) body.model_name = model;
  if (selectParam) body.select_param = selectParam;
  if (temperature !== undefined && temperature !== null) {
    body.temperature = temperature;
  }
  if (maxNewTokens !== undefined && maxNewTokens !== null) {
    body.max_new_tokens = maxNewTokens;
  }
  return body;
};

const extractFenceBlocks = (value: string, fenceName: string) => {
  const blocks: string[] = [];
  const pattern = new RegExp(
    `\`\`\`${fenceName}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    'g',
  );
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(value)) !== null) {
    blocks.push(matched[1]);
  }
  return blocks;
};

export const stripRuntimeMarkdown = (value: string) => {
  return value
    .replace(/`{3,}vis-thinking[\s\S]*?`{3,}/g, '')
    .replace(/```agent-plans\s*\n[\s\S]*?\n```/g, '')
    .replace(/```agent-messages\s*\n[\s\S]*?\n```/g, '')
    .trim();
};

export type DbgptRuntimeEvent = {
  kind: 'agent_message' | 'agent_plan' | 'runtime' | 'message' | 'raw';
  title: string;
  content?: string;
  payload?: unknown;
};

const extractAgentMessages = (vis: string) => {
  const messages: Array<{ sender: string; markdown: string }> = [];
  extractFenceBlocks(vis, 'agent-messages').forEach((block) => {
    try {
      const parsed = JSON.parse(block) as Array<{
        sender?: string;
        markdown?: string;
      }>;
      parsed.forEach((item) => {
        const sender = String(item.sender || '').toLowerCase();
        const markdown = stripRuntimeMarkdown(String(item.markdown || ''));
        if (sender !== 'human' && markdown) {
          messages.push({ sender: item.sender || 'Agent', markdown });
        }
      });
    } catch {
      // Ignore nested agent-message strings embedded inside the agent-plan JSON.
    }
  });
  return messages;
};

const normalizeDbgptRuntimeEvents = (events: string[]) => {
  const runtimeEvents: DbgptRuntimeEvent[] = [];

  events.forEach((raw) => {
    if (!raw || raw === '[DONE]') return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.vis === 'string') {
        extractFenceBlocks(parsed.vis, 'agent-plans').forEach((block) => {
          try {
            runtimeEvents.push({
              kind: 'agent_plan',
              title: 'Agent plan',
              payload: JSON.parse(block),
            });
          } catch {
            runtimeEvents.push({
              kind: 'agent_plan',
              title: 'Agent plan',
              content: block,
            });
          }
        });

        extractAgentMessages(parsed.vis).forEach((item) => {
          runtimeEvents.push({
            kind: 'agent_message',
            title: item.sender || 'Agent message',
            content: item.markdown,
          });
        });

        const fallback = stripRuntimeMarkdown(parsed.vis);
        if (fallback && fallback !== '[DONE]') {
          runtimeEvents.push({
            kind: 'runtime',
            title: 'Runtime event',
            content: fallback,
          });
        }
        return;
      }

      const content =
        parsed.choices?.[0]?.delta?.content ||
        parsed.choices?.[0]?.message?.content ||
        parsed.context ||
        parsed.response;
      if (typeof content === 'string' && content.trim()) {
        runtimeEvents.push({
          kind: 'message',
          title: 'Assistant message',
          content: content.trim(),
        });
        return;
      }

      runtimeEvents.push({
        kind: 'raw',
        title: 'Runtime payload',
        payload: parsed,
      });
    } catch {
      const fallback = raw.replace(/\\n/g, '\n').trim();
      if (fallback) {
        runtimeEvents.push({
          kind: 'raw',
          title: 'Raw event',
          content: fallback,
        });
      }
    }
  });

  return runtimeEvents;
};

const summarizeDbgptStreamEvents = (events: string[]) => {
  let finalAgentMessage = '';
  const fallbackParts: string[] = [];

  events.forEach((raw) => {
    if (!raw || raw === '[DONE]') return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.vis === 'string') {
        const messages = extractAgentMessages(parsed.vis);
        if (messages.length) {
          finalAgentMessage = messages[messages.length - 1].markdown;
          return;
        }
        const fallback = stripRuntimeMarkdown(parsed.vis);
        if (fallback && fallback !== '[DONE]') fallbackParts.push(fallback);
        return;
      }

      const content =
        parsed.choices?.[0]?.delta?.content ||
        parsed.choices?.[0]?.message?.content ||
        parsed.context ||
        parsed.response;
      if (typeof content === 'string' && content.trim()) {
        fallbackParts.push(content.trim());
      }
    } catch {
      const fallback = raw.replace(/\\n/g, '\n').trim();
      if (fallback) fallbackParts.push(fallback);
    }
  });

  const result = finalAgentMessage || fallbackParts.join('\n').trim();
  if (/401 Client Error: Unauthorized/i.test(result)) {
    return [
      'DB-GPT model authorization failed.',
      '',
      result,
      '',
      'Check the DB-GPT LLM and embedding API endpoint/key configuration.',
    ].join('\n');
  }
  return result || 'No response content.';
};

const extractSseEvents = (text: string) => {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .filter(Boolean);
};

export const readDbgptStreamResponse = async (response: Response) => {
  return (await readDbgptStreamResult(response)).content;
};

export const readDbgptStreamResult = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  let events: string[] = [];
  let content = '';
  if (contentType.includes('text/event-stream') && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      lines.forEach((line) => {
        if (!line.startsWith('data:')) return;
        const raw = line.replace(/^data:\s*/, '');
        if (raw) events.push(raw);
      });
    }
    if (pending.startsWith('data:')) {
      const raw = pending.replace(/^data:\s*/, '');
      if (raw) events.push(raw);
    }
    content = summarizeDbgptStreamEvents(events);
  } else {
    const text = await response.text();
    if (text.includes('data:')) {
      events = extractSseEvents(text);
      content = summarizeDbgptStreamEvents(events);
    } else {
      try {
        const payload = JSON.parse(text);
        content = JSON.stringify(payload, null, 2);
        events = [JSON.stringify(payload)];
      } catch {
        content = text || 'No response content.';
        events = text ? [text] : [];
      }
    }
  }
  return {
    content,
    events: normalizeDbgptRuntimeEvents(events),
    rawEvents: events,
  };
};

export type AppChatResult = {
  content: string;
  apiHistoryId?: string;
  localRuntime?: boolean;
  raw?: VeadkApplicationAskResponse;
  runtime?: {
    source: 'veadk_data_product' | 'dbgpt';
    type?: string;
    events?: DbgptRuntimeEvent[];
    rawEvents?: string[];
  };
};

const isDbgptHumanHistoryMessage = (message: DbgptChatHistoryMessage) => {
  const role = String(message.role || '').toLowerCase();
  return role === 'human' || role === 'user';
};

const createDbgptHistoryChatResult = (
  message: DbgptChatHistoryMessage,
): AppChatResult => {
  const rawEvent = JSON.stringify({ vis: message.context || '' });
  return {
    content: summarizeDbgptStreamEvents([rawEvent]),
    runtime: {
      source: 'dbgpt',
      events: normalizeDbgptRuntimeEvents([rawEvent]),
      rawEvents: [rawEvent],
    },
  };
};

export type DbgptHistoryRound = {
  question: string;
  answer: AppChatResult;
  createdAt?: string | null;
  order?: number;
};

export const buildDbgptHistoryRounds = (
  history: DbgptChatHistoryMessage[],
): DbgptHistoryRound[] => {
  const sortedHistory = history
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const orderDelta =
        (left.message.order || 0) - (right.message.order || 0);
      return orderDelta || left.index - right.index;
    })
    .map((item) => item.message);
  const rounds: DbgptHistoryRound[] = [];
  let currentQuestion = '';

  sortedHistory.forEach((message) => {
    if (isDbgptHumanHistoryMessage(message)) {
      currentQuestion = message.context || '';
      return;
    }
    if (!message.context) return;
    rounds.push({
      question: currentQuestion || 'Application question',
      answer: createDbgptHistoryChatResult(message),
      createdAt: message.time_stamp,
      order: message.order,
    });
    currentQuestion = '';
  });

  return rounds;
};

const APPLICATION_CHAT_TIMEOUT_MS = 60000;

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeout),
  };
};

export const sendAppChat = async (
  app: DbgptApp,
  convUid: string,
  input: string,
  options: { selectParam?: string } = {},
): Promise<AppChatResult> => {
  const veadkBinding = findVeadkDataProductBinding(app, options);
  if (veadkBinding) {
    const timeout = createTimeoutSignal(APPLICATION_CHAT_TIMEOUT_MS);
    try {
      const response = await fetch('/api/applications/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: timeout.signal,
        body: JSON.stringify({
          appCode: app.app_code,
          projectId: veadkBinding.projectId,
          question: input,
          threadId: convUid,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            `Application ask failed with HTTP ${response.status}`,
        );
      }
      const result = payload as VeadkApplicationAskResponse;
      return {
        content: formatVeadkApplicationAnswer(result),
        apiHistoryId: result.id,
        localRuntime: true,
        raw: result,
        runtime: {
          source: 'veadk_data_product',
          type: result.type,
        },
      };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          'Application ask timed out. Try again or ask a more specific data question.',
        );
      }
      throw err;
    } finally {
      timeout.clear();
    }
  }

  const timeout = createTimeoutSignal(APPLICATION_CHAT_TIMEOUT_MS);
  try {
    const response = await fetch('/api/dbgpt/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: timeout.signal,
      body: JSON.stringify(buildChatBody(app, convUid, input, options)),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        errorText || `Chat failed with HTTP ${response.status}`,
      );
    }
    const result = await readDbgptStreamResult(response);
    return {
      content: result.content,
      runtime: {
        source: 'dbgpt',
        events: result.events,
        rawEvents: result.rawEvents,
      },
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Application chat timed out. Try again or simplify the request.',
      );
    }
    throw err;
  } finally {
    timeout.clear();
  }
};

const formatVeadkRows = (result: VeadkApplicationAskResponse) => {
  const columns = result.data?.columns || [];
  const rows = result.data?.data || [];
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      record[column.name || `column_${index + 1}`] = row[index];
    });
    return record;
  });
};

const formatVeadkApplicationAnswer = (result: VeadkApplicationAskResponse) => {
  if (result.type === 'NON_SQL_QUERY') {
    return result.explanation || 'No response content.';
  }
  const chartPayload = {
    title: result.project.displayName,
    describe: 'Data product result',
    type: 'table',
    sql: result.sql,
    data: formatVeadkRows(result),
  };
  return [
    result.summary || 'Query finished.',
    '',
    `\`\`\`vis-db-chart\n${JSON.stringify(chartPayload, null, 2)}\n\`\`\``,
  ].join('\n');
};

export const createConversationShareLink = async (convUid: string) =>
  fetchDbgpt<DbgptShareLink>('/api/v1/chat/share', {
    method: 'POST',
    body: JSON.stringify({ conv_uid: convUid }),
  });

export const getApiInvocationEndpoint = (
  app?: DbgptApp,
  options: { selectParam?: string } = {},
) =>
  app && findVeadkDataProductBinding(app, options)
    ? '/api/applications/ask'
    : '/api/dbgpt/api/v1/chat/completions';

export const getDialogueCreationEndpoint = (
  app: DbgptApp,
  options: { selectParam?: string } = {},
) =>
  findVeadkDataProductBinding(app, options)
    ? 'Created locally by the application runtime'
    : `/api/dbgpt/api/v1/chat/dialogue/new?chat_mode=${encodeURIComponent(
        getAppChatMode(app),
      )}`;

const delay = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const fetchConversationHistory = async (convUid: string) =>
  fetchDbgpt<DbgptChatHistoryMessage[]>(
    `/api/v1/chat/dialogue/messages/history?con_uid=${encodeURIComponent(
      convUid,
    )}`,
  );

export const waitForConversationHistory = async (
  convUid: string,
  options: { minMessages?: number; timeoutMs?: number } = {},
) => {
  if (isLocalApplicationConversationId(convUid)) return [];
  const minMessages = options.minMessages ?? 2;
  const timeoutMs = options.timeoutMs ?? 8000;
  const startedAt = Date.now();
  let lastHistory: DbgptChatHistoryMessage[] = [];
  while (Date.now() - startedAt < timeoutMs) {
    lastHistory = await fetchConversationHistory(convUid).catch(() => []);
    if (lastHistory.length >= minMessages) return lastHistory;
    await delay(500);
  }
  return lastHistory;
};

export const getAppCompleteness = (app: DbgptApp) => {
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const selectedAgents = (app.details || []).filter(
      (detail) => detail.agent_name,
    );
    if (app.team_mode === 'single_agent') return selectedAgents.length === 1;
    return selectedAgents.length > 0;
  }
  if (app.team_mode === 'awel_layout') {
    return Boolean(app.team_context?.name || app.team_context?.uid);
  }
  if (app.team_mode === 'native_app') {
    const resource = app.param_need?.find((item) => item.type === 'resource');
    const scene = app.team_context?.chat_scene;
    if (!scene) return false;
    if (!resource?.value) return true;
    if (isRuntimeSelectedResource(resource.value)) return true;
    if (isOptionalMediaResource(resource.value)) return true;
    return Boolean(resource.bind_value);
  }
  return false;
};

export const getAppRuntimeReady = (app: DbgptApp) => {
  if (!getAppCompleteness(app)) return false;
  if (!hasAgentRuntimeContext(app)) return false;
  return true;
};

export const getAppResourceCount = (app: DbgptApp) =>
  (app.details || []).reduce(
    (count, detail) => count + (detail.resources || []).length,
    0,
  );

export const getRecommendQuestions = (app: DbgptApp) => {
  return (app.recommend_questions || []).map((item) => ({
    question: typeof item.question === 'string' ? item.question : '',
    valid:
      item.valid === undefined ||
      item.valid === true ||
      item.valid === '1' ||
      item.valid === 1,
  }));
};

export const getAppConfigurationSummary = (
  app: DbgptApp,
  teamModes: DbgptTeamMode[] = [],
) => {
  const veadkBinding = findVeadkDataProductBinding(app);
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const agents = (app.details || [])
      .map((detail) => detail.agent_name)
      .filter(Boolean);
    const summary = [
      {
        label: app.team_mode === 'single_agent' ? 'Agent' : 'Agents',
        value: agents.length ? agents.join(', ') : 'No agent selected',
      },
      {
        label: 'Resources',
        value:
          (app.details || [])
            .flatMap((detail) => detail.resources || [])
            .map((resource) => resource.name || resource.type)
            .filter(Boolean)
            .join(', ') || 'No resources bound',
      },
    ];
    if (veadkBinding) {
      summary.push({
        label: 'Data product',
        value: `${veadkBinding.resourceName || veadkBinding.key} (project ${veadkBinding.projectId})`,
      });
    }
    return summary;
  }

  if (app.team_mode === 'awel_layout') {
    return [
      {
        label: 'Workflow',
        value:
          (app.team_context?.label as string) ||
          (app.team_context?.name as string) ||
          'No workflow selected',
      },
    ];
  }

  if (app.team_mode === 'native_app') {
    const resource = app.param_need?.find((item) => item.type === 'resource');
    return [
      { label: 'Native scene', value: getAppChatScene(app) },
      {
        label: 'Resource',
        value: isRuntimeSelectedResource(resource?.value)
          ? 'Selected at chat time'
          : isOptionalMediaResource(resource?.value)
            ? 'Optional upload at chat time'
            : resource?.bind_value || 'No resource bound',
      },
      { label: 'Model', value: getAppModel(app) || 'Default model' },
    ];
  }

  return [
    {
      label: 'Mode',
      value:
        teamModes.find((item) => item.value === app.team_mode)?.name_en ||
        app.team_mode ||
        'Mode unset',
    },
  ];
};

const getBoundResourceNames = (app: DbgptApp) =>
  (app.details || [])
    .flatMap((detail) => detail.resources || [])
    .map((resource) => resource.name || resource.type)
    .filter(Boolean)
    .join(', ');

export const getAppRuntimeContract = (
  app: DbgptApp,
  options: { selectParam?: string } = {},
) => {
  const veadkBinding = findVeadkDataProductBinding(app, options);
  if (veadkBinding) {
    return {
      title: 'Application database runtime',
      dialogueMode: 'veadk_data_product',
      appSelector:
        'VeADK loads the saved application by appCode, then executes against the bound database resource.',
      resourceSelector: `Bound database resource: ${veadkBinding.resourceName || veadkBinding.key}.`,
      requestFields: [
        { label: 'appCode', value: app.app_code },
        { label: 'projectId', value: String(veadkBinding.projectId) },
        { label: 'question', value: 'End user question' },
        { label: 'threadId', value: 'Created by the application runtime' },
      ],
    };
  }

  const chatMode = getAppChatMode(app);
  const baseFields = [
    { label: 'conv_uid', value: 'Created by the dialogue endpoint' },
    { label: 'chat_mode', value: chatMode },
    { label: 'app_code', value: app.app_code },
    { label: 'user_input', value: 'End user question' },
  ];

  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const resources = getBoundResourceNames(app);
    return {
      title:
        app.team_mode === 'single_agent'
          ? 'Single Agent runtime'
          : 'Multi-agent runtime',
      dialogueMode: chatMode,
      appSelector: 'DB-GPT loads the saved application by app_code.',
      resourceSelector: resources
        ? `Resources are already bound in app details: ${resources}.`
        : 'No fixed resources are bound; the agent answers from its prompt and tools.',
      requestFields: baseFields,
    };
  }

  if (app.team_mode === 'awel_layout') {
    return {
      title: 'AWEL Flow runtime',
      dialogueMode: chatMode,
      appSelector: 'DB-GPT loads the saved AWEL flow from team_context.',
      resourceSelector: 'Flow resources come from the selected AWEL workflow.',
      requestFields: baseFields,
    };
  }

  if (app.team_mode === 'native_app') {
    const resource = app.param_need?.find((item) => item.type === 'resource');
    const resourceType =
      typeof resource?.value === 'string' ? resource.value : undefined;
    const requestFields = [...baseFields];
    if (resource?.bind_value) {
      requestFields.push({
        label: 'select_param',
        value: resource.bind_value,
      });
    } else if (resourceType && isRuntimeSelectedResource(resourceType)) {
      requestFields.push({
        label: 'select_param',
        value: `Selected ${resourceType} at runtime`,
      });
    }
    return {
      title: 'Native application runtime',
      dialogueMode: chatMode,
      appSelector: 'DB-GPT routes by native chat_scene and app_code.',
      resourceSelector: resource?.bind_value
        ? `Fixed ${resourceType || 'resource'}: ${resource.bind_value}.`
        : resourceType && isRuntimeSelectedResource(resourceType)
          ? `User selects a ${resourceType} before asking; it is sent as select_param.`
          : resourceType && isOptionalMediaResource(resourceType)
            ? `${resourceType} is supplied at chat time.`
            : 'This native scene does not require a fixed resource.',
      requestFields,
    };
  }

  return {
    title: 'Application runtime',
    dialogueMode: chatMode,
    appSelector: 'DB-GPT loads the saved application by app_code.',
    resourceSelector: 'Complete configuration before running.',
    requestFields: baseFields,
  };
};

export const getAppActionHint = (app: DbgptApp) => {
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    if (getAppCompleteness(app) && !hasAgentRuntimeContext(app)) {
      return 'Bind resource';
    }
    if (app.details?.length && !getAppResourceCount(app)) {
      return 'No resources';
    }
    if (getAppCompleteness(app)) return 'Ready';
    return 'Select agent';
  }
  if (getAppCompleteness(app)) return 'Ready';
  if (app.team_mode === 'awel_layout') return 'Select workflow';
  if (app.team_mode === 'native_app') return 'Bind resource';
  return 'Configure';
};

export const getApiInvocationPayload = (
  app: DbgptApp,
  options: { selectParam?: string } = {},
) => {
  const veadkBinding = findVeadkDataProductBinding(app, options);
  if (veadkBinding) {
    return JSON.stringify(
      {
        appCode: app.app_code,
        projectId: veadkBinding.projectId,
        question: 'Ask this application',
        threadId: '<conversation_id>',
      },
      null,
      2,
    );
  }

  const resource = app.param_need?.find((item) => item.type === 'resource');
  const resourceType =
    typeof resource?.value === 'string' ? resource.value : undefined;
  const runtimeSelectParam =
    app.team_mode === 'native_app' &&
    resourceType &&
    !resource?.bind_value &&
    isRuntimeSelectedResource(resourceType)
      ? `<${resourceType}>`
      : undefined;
  return JSON.stringify(
    buildChatBody(app, '<dialogue_id>', 'Ask this application', {
      selectParam: runtimeSelectParam,
    }),
    null,
    2,
  );
};

export const fetchAppInfo = async (app: DbgptApp) => {
  const info = await fetchDbgpt<DbgptApp>(
    `/api/v1/app/info?chat_scene=${encodeURIComponent(
      getAppChatScene(app),
    )}&app_code=${encodeURIComponent(app.app_code)}`,
  );
  return { ...app, ...info };
};

export const fetchAppByCode = async (appCode: string) => {
  const data = await fetchDbgpt<DbgptAppListResponse>(
    `/api/v1/app/list?page=1&page_size=10000`,
    {
      method: 'POST',
      body: JSON.stringify({ page: 1, page_size: 10000 }),
    },
  );
  const app = (data?.app_list || []).find((item) => item.app_code === appCode);
  if (!app) {
    throw new Error('Application was not found.');
  }
  return fetchAppInfo(app);
};
