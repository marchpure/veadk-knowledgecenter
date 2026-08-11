import { components } from '@/common';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  isAskResultFinished,
  MAX_WAIT_TIME,
  transformHistoryInput,
  validateSummaryResult,
} from '@/apollo/server/utils/apiUtils';
import * as Errors from '@/apollo/server/utils/error';
import { ApiType } from '@/apollo/server/repositories/apiHistoryRepository';
import {
  AskResult,
  AskResultType,
  TextBasedAnswerInput,
  TextBasedAnswerResult,
  TextBasedAnswerStatus,
  WrenAIError,
  WrenAILanguage,
} from '@/apollo/server/models/adaptor';
import { Project } from '@/apollo/server/repositories';
import {
  buildVeadkDataProductResourceKey,
  VeadkApplicationAskResponse,
} from '@/lib/veadkApplicationResources';

const {
  apiHistoryRepository,
  applicationResultShareRepository,
  deployService,
  projectRepository,
  projectService,
  queryService,
  wrenAIAdaptor,
} = components;

export type ApplicationResultSharePayload = {
  token: string;
  shareUrl: string;
  appCode: string;
  projectId: number;
  apiHistoryId: string;
  createdAt?: string;
  result: VeadkApplicationAskResponse;
  request: {
    appCode?: string;
    projectId?: number;
    question?: string;
    threadId?: string;
    sampleSize?: number;
    language?: string;
  };
};

const buildRequestHistoryPayload = (input: RunVeadkApplicationAskInput) => ({
  appCode: input.appCode,
  projectId: input.projectId,
  question: input.question,
  sampleSize: input.sampleSize,
  language: input.language,
  threadId: input.threadId,
});

type ApplicationRuntimeStage = 'ask' | 'sql_execution' | 'summary_generation';

export class ApplicationRuntimeError extends ApiError {
  stage: ApplicationRuntimeStage;
  advice?: string;

  constructor({
    message,
    statusCode,
    code,
    stage,
    advice,
    additionalData,
  }: {
    message: string;
    statusCode: number;
    code?: Errors.GeneralErrorCodes;
    stage: ApplicationRuntimeStage;
    advice?: string;
    additionalData?: Record<string, unknown>;
  }) {
    super(message, statusCode, code, {
      ...(additionalData || {}),
      stage,
      ...(advice ? { advice } : {}),
    });
    this.stage = stage;
    this.advice = advice;
  }
}

const getUnknownErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message?.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const candidates = [
      record.message,
      record.error,
      record.err_msg,
      record.detail,
      record.reason,
      record.code,
    ];
    const matched = candidates.find(
      (item) => typeof item === 'string' && item.trim(),
    );
    if (typeof matched === 'string') return matched.trim();
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // Fall through to the fallback.
    }
  }
  return fallback;
};

const createAskRuntimeError = (
  error: unknown,
  fallback: string,
  options: {
    statusCode?: number;
    code?: Errors.GeneralErrorCodes;
    advice?: string;
    additionalData?: Record<string, unknown>;
  } = {},
) =>
  new ApplicationRuntimeError({
    message: getUnknownErrorMessage(error, fallback),
    statusCode: options.statusCode || 502,
    code: options.code || Errors.GeneralErrorCodes.AI_SERVICE_UNDEFINED_ERROR,
    stage: 'ask',
    advice:
      options.advice ||
      'Check the WrenAI service, redeploy the data product, or try a configured recommended question.',
    additionalData: options.additionalData,
  });

export const listVeadkDataProductResources = async () => {
  const projects = await projectRepository.findAll({ order: 'id' });
  return projects.map((project) => ({
    label: `[veadk] ${project.displayName}`,
    key: buildVeadkDataProductResourceKey(project.id),
    description: `${project.type} data product managed by VeADK / WrenAI`,
  }));
};

export const getVeadkDataProductRuntimeInfo = async (projectId: number) => {
  const project = await projectService.getProjectById(projectId);
  if (!project) {
    throw new ApiError('Data product was not found.', 404);
  }
  return {
    id: project.id,
    displayName: project.displayName,
    type: String(project.type),
    questions: (project.questions || []).map((item) => ({
      question: item.question,
      category: item.category,
      valid: Boolean(item.sql),
    })),
  };
};

const normalizeApplicationAskHistory = (history: any) => {
  const responsePayload = history?.responsePayload || {};
  const requestPayload = history?.requestPayload || {};
  if (!responsePayload.appCode && !requestPayload.appCode) {
    throw new ApiError(
      'This API history record is not an application result.',
      400,
    );
  }
  return {
    requestPayload,
    responsePayload: {
      ...responsePayload,
      appCode: responsePayload.appCode || requestPayload.appCode,
      threadId: responsePayload.threadId || requestPayload.threadId,
    } as VeadkApplicationAskResponse,
  };
};

export const createApplicationResultShare = async (apiHistoryId: string) => {
  const history = await apiHistoryRepository.findOneBy({ id: apiHistoryId });
  if (!history) {
    throw new ApiError('Application result was not found.', 404);
  }
  const { requestPayload, responsePayload } =
    normalizeApplicationAskHistory(history);
  const appCode = responsePayload.appCode || requestPayload.appCode;
  const projectId = Number(
    responsePayload.project?.id || requestPayload.projectId,
  );
  if (!appCode || !projectId) {
    throw new ApiError(
      'Application result is missing app or project context.',
      400,
    );
  }
  const share = await applicationResultShareRepository.upsertForApiHistory({
    token: randomUUID().replace(/-/g, ''),
    apiHistoryId,
    appCode,
    projectId,
  });
  return {
    token: share.token,
    shareUrl: `/applications/share/${share.token}`,
    appCode,
    projectId,
    apiHistoryId,
    createdAt: share.createdAt,
  };
};

export const getApplicationResultShare = async (
  token: string,
): Promise<ApplicationResultSharePayload> => {
  const share = await applicationResultShareRepository.findOneBy({ token });
  if (!share) {
    throw new ApiError('Shared application result was not found.', 404);
  }
  const history = await apiHistoryRepository.findOneBy({
    id: share.apiHistoryId,
  });
  if (!history) {
    throw new ApiError('Shared application result history was not found.', 404);
  }
  const { requestPayload, responsePayload } =
    normalizeApplicationAskHistory(history);
  return {
    token: share.token,
    shareUrl: `/applications/share/${share.token}`,
    appCode: share.appCode,
    projectId: share.projectId,
    apiHistoryId: share.apiHistoryId,
    createdAt: share.createdAt,
    result: responsePayload,
    request: requestPayload,
  };
};

const getLanguage = (project: Project, language?: string) =>
  language || WrenAILanguage[project.language] || WrenAILanguage.EN;

const normalizeQuestion = (question: string) =>
  question
    .toLowerCase()
    .replace(/[?？.。!！]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const findCuratedQuestionSql = (project: Project, question: string) => {
  const target = normalizeQuestion(question);
  const matched = (project.questions || []).find(
    (item) => normalizeQuestion(item.question || '') === target,
  );
  return matched?.sql;
};

const getDirectNonSqlAnswer = (project: Project, question: string) => {
  const normalized = normalizeQuestion(question);
  const isGreeting = [
    'hi',
    'hello',
    'hey',
    '你好',
    '您好',
    '嗨',
    '哈喽',
  ].includes(normalized);
  const isCapabilityQuestion = [
    'help',
    'what can you do',
    'what can i ask',
    '你能做什么',
    '可以问什么',
    '能问什么',
  ].includes(normalized);
  if (!isGreeting && !isCapabilityQuestion) return '';
  return [
    `Hi. This application is connected to ${project.displayName}.`,
    'Ask a data question about this published data product, or choose a recommended question to generate SQL, inspect the result rows, and review the chart contract.',
  ].join(' ');
};

const saveNonSqlApplicationAnswer = async ({
  input,
  project,
  explanation,
  threadId,
  startTime,
}: {
  input: RunVeadkApplicationAskInput;
  project: Project;
  explanation: string;
  threadId: string;
  startTime: number;
}) => {
  const responsePayload: VeadkApplicationAskResponse = {
    type: 'NON_SQL_QUERY',
    explanation,
    threadId,
    appCode: input.appCode,
    project: {
      id: project.id,
      displayName: project.displayName,
      type: String(project.type),
    },
  };
  const saved = await apiHistoryRepository.createOne({
    id: randomUUID(),
    projectId: project.id,
    apiType: ApiType.ASK,
    threadId,
    headers: input.headers,
    requestPayload: buildRequestHistoryPayload(input),
    responsePayload,
    statusCode: 200,
    durationMs: Date.now() - startTime,
  });
  return { id: saved.id, ...responsePayload };
};

const collectTextStream = async (
  stream: NodeJS.ReadableStream,
  onClose?: () => void,
) => {
  let content = '';
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk) => {
      const chunkString = chunk.toString('utf-8');
      const match = chunkString.match(/data: {"message":"([\s\S]*?)"}/);
      if (match?.[1]) {
        content += match[1];
      }
    });
    stream.on('end', resolve);
    stream.on('error', reject);
    if (onClose) onClose();
  });
  return content;
};

export type RunVeadkApplicationAskInput = {
  appCode: string;
  projectId: number;
  question: string;
  sampleSize?: number;
  language?: string;
  threadId?: string;
  headers?: Record<string, string>;
  onRequestClose?: (stream: NodeJS.ReadableStream) => void;
};

export const runVeadkApplicationAsk = async (
  input: RunVeadkApplicationAskInput,
): Promise<VeadkApplicationAskResponse> => {
  const startTime = Date.now();
  const project = await projectService.getProjectById(input.projectId);
  if (!project) {
    throw new ApiError('Data product was not found.', 404);
  }
  if (!input.question?.trim()) {
    throw new ApiError('Question is required.', 400);
  }

  const lastDeploy = await deployService.getLastDeployment(project.id);
  if (!lastDeploy) {
    throw new ApiError(
      'No deployment found, publish the data product before using it in an application.',
      400,
      Errors.GeneralErrorCodes.NO_DEPLOYMENT_FOUND,
    );
  }

  const histories = input.threadId
    ? await apiHistoryRepository.findAllBy({ threadId: input.threadId })
    : undefined;
  const threadId = input.threadId || `${input.appCode}:${randomUUID()}`;
  const deadline = Date.now() + MAX_WAIT_TIME;
  const language = getLanguage(project, input.language);
  const curatedSql = findCuratedQuestionSql(project, input.question);
  const directNonSqlAnswer = getDirectNonSqlAnswer(project, input.question);

  if (directNonSqlAnswer) {
    return await saveNonSqlApplicationAnswer({
      input,
      project,
      explanation: directNonSqlAnswer,
      threadId,
      startTime,
    });
  }

  if (curatedSql) {
    return await runSqlAnswer({
      input,
      project,
      sql: curatedSql,
      threadId,
      deadline,
      language,
      startTime,
      manifest: lastDeploy.manifest,
    });
  }

  let askTask;
  try {
    askTask = await wrenAIAdaptor.ask({
      query: input.question,
      deployId: lastDeploy.hash,
      histories: transformHistoryInput(histories) as any,
      configurations: { language },
    });
  } catch (error) {
    throw createAskRuntimeError(
      error,
      'Failed to create SQL generation task.',
      {
        advice:
          'Check that the WrenAI service is reachable and redeploy the data product before asking again.',
      },
    );
  }
  if (!askTask?.queryId) {
    throw createAskRuntimeError(
      askTask,
      'WrenAI did not return a query id for SQL generation.',
      {
        advice:
          'Check the WrenAI service response and try a configured recommended question.',
      },
    );
  }

  let askResult: AskResult;
  while (true) {
    try {
      askResult = await wrenAIAdaptor.getAskResult(askTask.queryId);
    } catch (error) {
      throw createAskRuntimeError(
        error,
        'Failed to fetch SQL generation result from WrenAI.',
        {
          advice:
            'Check the WrenAI service health, then retry or use a configured recommended question.',
        },
      );
    }
    if (isAskResultFinished(askResult)) break;
    if (Date.now() > deadline) {
      throw new ApplicationRuntimeError({
        message: 'Timeout waiting for SQL generation.',
        statusCode: 504,
        code: Errors.GeneralErrorCodes.POLLING_TIMEOUT,
        stage: 'ask',
        advice:
          'Check the WrenAI service or ask a more specific question. Recommended questions avoid this generation path.',
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (askResult.error) {
    const additionalData: Record<string, unknown> = {};
    if (askResult.invalidSql) additionalData.invalidSql = askResult.invalidSql;
    throw new ApplicationRuntimeError({
      message:
        (askResult.error as WrenAIError).message ||
        'WrenAI could not generate SQL for this question.',
      statusCode: 400,
      code: askResult.error?.code || Errors.GeneralErrorCodes.NO_RELEVANT_SQL,
      stage: 'ask',
      advice:
        'Modify the question to reference the published data product, or use one of the recommended questions.',
      additionalData,
    });
  }

  if (askResult.type === AskResultType.GENERAL) {
    let stream;
    try {
      stream = await wrenAIAdaptor.getAskStreamingResult(askTask.queryId);
    } catch (error) {
      throw createAskRuntimeError(
        error,
        'WrenAI returned a general answer but streaming failed.',
        {
          advice:
            'Check the WrenAI streaming service, or ask a more specific data question.',
        },
      );
    }
    const explanation = await collectTextStream(stream, () => {
      input.onRequestClose?.(stream);
    });
    return await saveNonSqlApplicationAnswer({
      input,
      project,
      explanation,
      threadId,
      startTime,
    });
  }

  const sql = askResult.response?.[0]?.sql;
  if (!sql) {
    throw new ApplicationRuntimeError({
      message: 'No SQL generated for this question.',
      statusCode: 400,
      code: Errors.GeneralErrorCodes.NO_RELEVANT_SQL,
      stage: 'ask',
      advice:
        'Modify the question to match the published tables or use a configured recommended question.',
    });
  }

  return await runSqlAnswer({
    input,
    project,
    sql,
    threadId,
    deadline,
    language,
    startTime,
    manifest: lastDeploy.manifest,
  });
};

const runSqlAnswer = async ({
  input,
  project,
  sql,
  threadId,
  deadline,
  language,
  startTime,
  manifest,
}: {
  input: RunVeadkApplicationAskInput;
  project: Project;
  sql: string;
  threadId: string;
  deadline: number;
  language: string;
  startTime: number;
  manifest: object;
}): Promise<VeadkApplicationAskResponse> => {
  let sqlData;
  let runtimeError: VeadkApplicationAskResponse['runtimeError'];
  try {
    sqlData = await queryService.preview(sql, {
      project,
      limit: input.sampleSize || 500,
      manifest: manifest as any,
      modelingOnly: false,
    });
  } catch (queryError: any) {
    throw new ApplicationRuntimeError({
      message: getUnknownErrorMessage(queryError, 'Error executing SQL query.'),
      statusCode: 400,
      code: Errors.GeneralErrorCodes.SQL_EXECUTION_ERROR,
      stage: 'sql_execution',
      advice:
        'Review the generated SQL, redeploy the data product, or use a configured recommended question.',
      additionalData: { sql },
    });
  }

  let summary =
    runtimeError?.stage === 'sql_execution'
      ? 'SQL was generated, but the data preview failed. Review the SQL and runtime details.'
      : 'Query finished. Review the data and SQL tabs for the structured result.';

  if (!runtimeError) {
    try {
      const textBasedAnswerInput: TextBasedAnswerInput = {
        query: input.question,
        sql,
        sqlData,
        threadId,
        configurations: { language },
      };
      const summaryTask =
        await wrenAIAdaptor.createTextBasedAnswer(textBasedAnswerInput);
      if (!summaryTask?.queryId) {
        throw new Error('Failed to start summary generation task');
      }

      let summaryResult: TextBasedAnswerResult;
      while (true) {
        summaryResult = await wrenAIAdaptor.getTextBasedAnswerResult(
          summaryTask.queryId,
        );
        if (
          summaryResult.status === TextBasedAnswerStatus.SUCCEEDED ||
          summaryResult.status === TextBasedAnswerStatus.FAILED
        ) {
          break;
        }
        if (Date.now() > deadline) {
          throw new Error('Timeout waiting for summary generation');
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      validateSummaryResult(summaryResult);
      if (summaryResult.status === TextBasedAnswerStatus.SUCCEEDED) {
        const stream = await wrenAIAdaptor.streamTextBasedAnswer(
          summaryTask.queryId,
        );
        summary =
          (await collectTextStream(stream, () => {
            input.onRequestClose?.(stream);
          })) || summary;
      }
    } catch (summaryError: any) {
      runtimeError = {
        stage: 'summary_generation',
        message: getUnknownErrorMessage(
          summaryError,
          'Summary generation failed after SQL execution.',
        ),
        code: Errors.GeneralErrorCodes.AI_SERVICE_UNDEFINED_ERROR,
        advice:
          'The SQL and preview data are still available. Check WrenAI summary generation before retrying the narrative answer.',
      };
    }
  }

  const responsePayload: VeadkApplicationAskResponse = {
    type: 'SQL_QUERY',
    sql,
    summary,
    threadId,
    appCode: input.appCode,
    project: {
      id: project.id,
      displayName: project.displayName,
      type: String(project.type),
    },
    data: {
      columns: (sqlData as any)?.columns || [],
      data: (sqlData as any)?.data || [],
    },
    runtimeError,
  };
  const saved = await apiHistoryRepository.createOne({
    id: randomUUID(),
    projectId: project.id,
    apiType: ApiType.ASK,
    threadId,
    headers: input.headers,
    requestPayload: buildRequestHistoryPayload(input),
    responsePayload,
    statusCode: 200,
    durationMs: Date.now() - startTime,
  });
  return { id: saved.id, ...responsePayload };
};
