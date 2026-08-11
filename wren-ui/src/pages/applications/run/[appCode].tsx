import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import CheckCircleFilled from '@ant-design/icons/CheckCircleFilled';
import CodeOutlined from '@ant-design/icons/CodeOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import FundViewOutlined from '@ant-design/icons/FundViewOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';
import styled from 'styled-components';
import DbgptRuntimeContent from '@/components/applications/DbgptRuntimeContent';
import { StatusTag } from '@/components/construct/ConstructLayout';
import SimpleLayout from '@/components/layouts/SimpleLayout';
import { DbgptApp, DbgptResourceOption, fetchDbgpt } from '@/lib/dbgpt';
import {
  AppChatResult,
  DbgptRuntimeEvent,
  buildDbgptHistoryRounds,
  createAppDialogue,
  createConversationShareLink,
  fetchAppByCode,
  fetchConversationHistory,
  getApiInvocationEndpoint,
  getApiInvocationPayload,
  getAppActionHint,
  getAppChatMode,
  getAppConfigurationSummary,
  getAppCompleteness,
  getAppRuntimeReady,
  getAppRuntimeContract,
  getDialogueCreationEndpoint,
  getRecommendQuestions,
  isAppPublished,
  sendAppChat,
  waitForConversationHistory,
} from '@/lib/dbgptRuntime';
import {
  VeadkApplicationAskResponse,
  VeadkApplicationAskErrorPayload,
  findVeadkDataProductBinding,
  isLocalApplicationConversationId,
} from '@/lib/veadkApplicationResources';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;

type RuntimeMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  question?: string;
  apiHistoryId?: string;
  pending?: boolean;
  error?: boolean;
  errorPayload?: VeadkApplicationAskErrorPayload;
  localRuntime?: boolean;
  result?: VeadkApplicationAskResponse;
  runtime?: AppChatResult['runtime'];
  createdAt: string;
};

type RuntimeSession = {
  id: string;
  title: string;
  convUid?: string;
  resource?: string;
  messages: RuntimeMessage[];
  updatedAt: string;
};

type RuntimeQuestion = {
  question: string;
  valid?: boolean;
  category?: string;
};

type DataProductRuntimeInfo = {
  id: number;
  displayName: string;
  type: string;
  questions: RuntimeQuestion[];
};

type RuntimeRoute = {
  title: string;
  mode: string;
  route: string;
  context: string;
};

const runtimeSelectableResourceTypes = new Set(['database', 'knowledge']);

const Shell = styled.div`
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  height: calc(100vh - 56px);
  background: #f7f9fc;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const Sidebar = styled.aside`
  display: flex;
  min-width: 0;
  flex-direction: column;
  border-right: 1px solid rgba(226, 232, 240, 0.94);
  background: var(--gray-2);
  color: var(--gray-8);

  @media (max-width: 920px) {
    display: none;
  }
`;

const SidebarHeader = styled.div`
  padding: 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
`;

const SidebarApp = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const AppIcon = styled.div`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: #fff;
  background: #2563eb;
`;

const SidebarActions = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 14px;
`;

const SidebarSection = styled.div`
  padding: 14px 0;
`;

const SidebarSectionHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 8px;
`;

const DashboardNode = styled.button<{ $selected?: boolean }>`
  display: flex;
  width: 100%;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 0;
  background: ${(props) => (props.$selected ? 'var(--gray-4)' : 'transparent')};
  color: ${(props) => (props.$selected ? 'var(--geekblue-6)' : 'inherit')};
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--gray-4);
  }
`;

const ThreadList = styled.div`
  display: flex;
  flex-direction: column;
`;

const ThreadItem = styled.div<{ $selected?: boolean }>`
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 16px;
  border: 0;
  background: ${(props) => (props.$selected ? 'var(--gray-4)' : 'transparent')};
  color: ${(props) => (props.$selected ? 'var(--geekblue-6)' : 'inherit')};
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--gray-4);
  }
`;

const ThreadTitle = styled.div`
  min-width: 0;
  flex: 1;
`;

const ThreadName = styled.div`
  overflow: hidden;
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ThreadMeta = styled.div`
  overflow: hidden;
  color: var(--gray-7);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Main = styled.main`
  display: flex;
  min-width: 0;
  flex-direction: column;
  height: 100%;
`;

const TopBar = styled.div`
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.94);
  background: #fff;

  @media (max-width: 760px) {
    align-items: flex-start;
    flex-direction: column;
  }
`;

const HeaderTitle = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
`;

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
`;

const TopActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
`;

const Content = styled.div`
  min-height: 0;
  flex: 1;
  overflow: auto;
`;

const PromptThread = styled.div`
  width: min(880px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 128px;
`;

const EmptyThread = styled.div`
  display: flex;
  min-height: calc(100vh - 290px);
  align-items: center;
  justify-content: center;
  text-align: center;
`;

const SuggestedQuestions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 18px;
`;

const AnswerBlock = styled.div`
  min-height: 220px;
  margin-bottom: 30px;
`;

const QuestionTitle = styled(Title)`
  &.ant-typography {
    display: flex;
    margin-top: 0;
    margin-bottom: 16px;
    padding: 10px 12px;
    border-radius: 6px;
    background: var(--gray-1);
  }
`;

const StyledTabs = styled(Tabs)`
  .ant-tabs-nav {
    margin-bottom: 0;
  }

  .ant-tabs-content-holder {
    border-right: 1px var(--gray-4) solid;
    border-bottom: 1px var(--gray-4) solid;
    border-left: 1px var(--gray-4) solid;
    background: #fff;
  }

  .ant-tabs-tab {
    .ant-typography {
      color: var(--gray-6);
    }

    &.ant-tabs-tab-active {
      .ant-typography {
        color: var(--gray-8);
      }
    }
  }
`;

const TabInner = styled.div`
  min-height: 120px;
  padding: 18px 22px;
`;

const AnswerFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 0 0;
`;

const SqlBlock = styled.pre`
  max-height: 360px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
`;

const CodeBlock = styled.pre`
  max-height: 320px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
`;

const RuntimeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const RuntimeCard = styled.div`
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #f8fafc;
`;

const RuntimeEventCard = styled.div`
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #f8fafc;
`;

const ComposerWrap = styled.div`
  position: sticky;
  bottom: 0;
  padding: 16px 20px 18px;
  border-top: 1px solid rgba(226, 232, 240, 0.94);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
`;

const ComposerInner = styled.div`
  width: min(880px, 100%);
  margin: 0 auto;
`;

const ComposerBox = styled.div`
  padding: 10px;
  border: 1px solid rgba(203, 213, 225, 0.96);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
`;

const ComposerFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
`;

const getNativeRuntimeResource = (app: DbgptApp | null) => {
  if (app?.team_mode !== 'native_app') return undefined;
  const resource = app.param_need?.find((item) => item.type === 'resource');
  const type = typeof resource?.value === 'string' ? resource.value : undefined;
  if (!type || resource.bind_value) return undefined;
  return runtimeSelectableResourceTypes.has(type) ? type : undefined;
};

const getPendingText = (
  runtimeContract: ReturnType<typeof getAppRuntimeContract> | null,
  localRuntime: boolean,
) => {
  if (localRuntime) return 'Analyzing the bound data product...';
  const title = runtimeContract?.title || '';
  if (/knowledge/i.test(title)) return 'Searching the knowledge space...';
  if (/tool/i.test(title)) return 'Calling the selected tool...';
  if (/workflow|awel/i.test(title)) return 'Running the workflow...';
  return 'Asking the application...';
};

const getErrorStageLabel = (stage?: string) => {
  if (stage === 'sql_execution') return 'SQL execution failed';
  if (stage === 'summary_generation') return 'Summary generation degraded';
  if (stage === 'ask') return 'SQL generation failed';
  if (stage === 'tool_call') return 'Tool call failed';
  if (stage === 'workflow') return 'Workflow node failed';
  return 'Application runtime failed';
};

const copyToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  return copied;
};

const getConversationShareUrl = (shareUrl: string) => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const token = shareUrl.split('/').filter(Boolean).pop();
  const params = new URLSearchParams();
  if (typeof window !== 'undefined') {
    const appCode = window.location.pathname.split('/').filter(Boolean).pop();
    if (appCode) params.set('app_code', appCode);
  }
  return `${origin}${Path.ApplicationShare}/${encodeURIComponent(
    token || shareUrl,
  )}${params.toString() ? `?${params.toString()}` : ''}`;
};

const getAppUrl = (appCode: string) => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${Path.ApplicationRun}/${encodeURIComponent(appCode)}`;
};

const getApplicationResultShareUrl = (token: string) => {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${Path.ApplicationShare}/${encodeURIComponent(token)}`;
};

const getConfigureUrl = (appCode: string) =>
  `${Path.Applications}?mode=configure&app_code=${encodeURIComponent(appCode)}`;

const getBoundResources = (app: DbgptApp) =>
  (app.details || []).flatMap((detail) =>
    (detail.resources || []).map((resource) => ({
      agent: detail.agent_name || 'Agent',
      type: resource.type || 'resource',
      name: resource.name || resource.type || 'Resource',
      value: resource.value || '',
      dynamic: Boolean(resource.is_dynamic),
    })),
  );

const getApplicationRuntimeRoute = (
  app: DbgptApp,
  localRuntime: boolean,
  runtimeResource?: string,
): RuntimeRoute => {
  if (localRuntime) {
    const binding = findVeadkDataProductBinding(app, {
      selectParam: runtimeResource,
    });
    return {
      title:
        app.team_mode === 'auto_plan'
          ? 'Multi-agent application'
          : 'Single-agent application',
      mode: 'veadk_data_product',
      route: 'app_code -> details.resources.database -> /api/applications/ask',
      context:
        binding?.resourceName || binding?.key || 'Bound database resource',
    };
  }

  if (app.team_mode === 'native_app') {
    return {
      title: 'Native DB-GPT application',
      mode: getAppChatMode(app),
      route: 'dialogue/new -> chat/completions',
      context: 'DB-GPT routes by chat_scene and app_code.',
    };
  }

  if (app.team_mode === 'awel_layout') {
    return {
      title: 'AWEL flow application',
      mode: 'chat_agent',
      route: 'dialogue/new -> chat/completions',
      context: 'DB-GPT loads the selected AWEL workflow from team_context.',
    };
  }

  return {
    title:
      app.team_mode === 'auto_plan'
        ? 'Multi-agent application'
        : 'Single-agent application',
    mode: 'chat_agent',
    route: 'dialogue/new -> chat/completions',
    context: 'DB-GPT loads agent details and resources from app_code.',
  };
};

const getStorageKey = (appCode: string) =>
  `veadk:application-runtime:${appCode}:sessions`;

const createSessionId = () =>
  `app-session-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createRuntimeSession = (convUid?: string): RuntimeSession => ({
  id: createSessionId(),
  title: 'New conversation',
  convUid,
  messages: [],
  updatedAt: new Date().toISOString(),
});

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const readStoredSessions = (appCode: string): RuntimeSession[] => {
  if (typeof window === 'undefined' || !appCode) return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(appCode));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RuntimeSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.id && Array.isArray(item.messages))
      .map((item) => ({
        ...item,
        title: item.title || 'New conversation',
        messages: item.messages || [],
        updatedAt: item.updatedAt || new Date().toISOString(),
      }));
  } catch {
    return [];
  }
};

const reconcileRouteSession = (
  stored: RuntimeSession[],
  routeSessionId: string,
  routeConvUid: string,
) => {
  if (routeSessionId) {
    const matchedBySession = stored.find((item) => item.id === routeSessionId);
    if (matchedBySession) {
      return {
        sessions: stored.map((item) =>
          item.id === routeSessionId &&
          routeConvUid &&
          item.convUid !== routeConvUid
            ? { ...item, convUid: routeConvUid }
            : item,
        ),
        selected: {
          ...matchedBySession,
          convUid: routeConvUid || matchedBySession.convUid,
        },
      };
    }
    const routeSession = createRuntimeSession(routeConvUid || undefined);
    routeSession.id = routeSessionId;
    return {
      sessions: [routeSession, ...stored],
      selected: routeSession,
    };
  }

  if (routeConvUid) {
    const matchedByConvUid = stored.find(
      (item) => item.convUid === routeConvUid,
    );
    if (matchedByConvUid) {
      return { sessions: stored, selected: matchedByConvUid };
    }
    const routeSession = createRuntimeSession(routeConvUid);
    return {
      sessions: [routeSession, ...stored],
      selected: routeSession,
    };
  }

  const selected = stored[0] || createRuntimeSession();
  return {
    sessions: stored.length ? stored : [selected],
    selected,
  };
};

const writeStoredSessions = (appCode: string, sessions: RuntimeSession[]) => {
  if (typeof window === 'undefined' || !appCode) return;
  window.localStorage.setItem(
    getStorageKey(appCode),
    JSON.stringify(sessions.slice(0, 30)),
  );
};

const getSessionTitle = (question: string) => {
  const normalized = question.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New conversation';
  return normalized.length > 36 ? `${normalized.slice(0, 36)}...` : normalized;
};

const createMessagesFromDbgptHistory = (
  rounds: ReturnType<typeof buildDbgptHistoryRounds>,
): RuntimeMessage[] =>
  rounds.flatMap((round, index) => {
    const createdAt =
      round.createdAt ||
      new Date(Date.now() - (rounds.length - index)).toISOString();
    const messageBaseId = `${round.order || index + 1}-${createdAt}`;
    return [
      {
        id: `${messageBaseId}-user`,
        role: 'user' as const,
        content: round.question,
        createdAt,
      },
      {
        id: `${messageBaseId}-assistant`,
        role: 'assistant' as const,
        question: round.question,
        content: round.answer.content,
        pending: false,
        localRuntime: false,
        runtime: round.answer.runtime,
        createdAt,
      },
    ];
  });

const shouldRestoreDbgptHistory = (session: RuntimeSession) =>
  Boolean(
    session.convUid &&
      !isLocalApplicationConversationId(session.convUid) &&
      (!session.messages.length ||
        session.messages.some((item) => item.pending)),
  );

const normalizeCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const getResultRows = (result?: VeadkApplicationAskResponse) => {
  const columns = result?.data?.columns || [];
  const rows = result?.data?.data || [];
  return rows.map((row, rowIndex) => {
    const record: Record<string, unknown> = { __runtimeRowKey: rowIndex };
    columns.forEach((column, index) => {
      record[column.name || `column_${index + 1}`] = row[index];
    });
    return record;
  });
};

const getResultColumns = (result?: VeadkApplicationAskResponse) => {
  const columns = result?.data?.columns || [];
  return columns.map((column, index) => ({
    title: column.name || `column_${index + 1}`,
    dataIndex: column.name || `column_${index + 1}`,
    key: column.name || `column_${index + 1}`,
    render: normalizeCell,
  }));
};

const getChartMarkdown = (result: VeadkApplicationAskResponse) => {
  const chartPayload = {
    title: result.project.displayName,
    describe: 'Data product result',
    type: 'table',
    sql: result.sql,
    data: getResultRows(result).map(({ __runtimeRowKey, ...row }) => row),
  };
  return `\`\`\`vis-db-chart\n${JSON.stringify(chartPayload, null, 2)}\n\`\`\``;
};

const formatSessionTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function TabLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="select-none">
      <span className="mr-2">{icon}</span>
      <Text>{label}</Text>
    </div>
  );
}

function ShareAnswerButton({
  disabledReason,
  loading,
  onClick,
}: {
  disabledReason?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button
      size="small"
      icon={<ShareAltOutlined />}
      data-testid="share-answer-button"
      disabled={Boolean(disabledReason)}
      loading={loading}
      onClick={onClick}
    >
      Share answer
    </Button>
  );
  return disabledReason ? (
    <Tooltip title={disabledReason}>
      <span data-testid="share-answer-disabled" aria-label={disabledReason}>
        {button}
      </span>
    </Tooltip>
  ) : (
    button
  );
}

function RuntimeDataTable({
  result,
}: {
  result?: VeadkApplicationAskResponse;
}) {
  const rows = getResultRows(result);
  const columns = getResultColumns(result);
  if (!rows.length) {
    return <Alert type="info" showIcon message="The query returned no rows." />;
  }
  return (
    <Table
      size="small"
      rowKey="__runtimeRowKey"
      columns={columns}
      dataSource={rows}
      pagination={rows.length > 20 ? { pageSize: 20 } : false}
      scroll={{ x: true }}
    />
  );
}

function RuntimeEventList({
  events,
  runtimeRoute,
}: {
  events?: DbgptRuntimeEvent[];
  runtimeRoute?: RuntimeRoute | null;
}) {
  if (!events?.length) {
    return (
      <Alert
        type="info"
        showIcon
        message="No runtime events were returned."
        description={
          runtimeRoute
            ? `${runtimeRoute.title}: ${runtimeRoute.context}`
            : 'The runtime completed without structured events.'
        }
      />
    );
  }

  return (
    <>
      {events.map((event, index) => (
        <RuntimeEventCard
          key={`${event.kind}-${index}`}
          data-testid={`runtime-event-${event.kind}`}
        >
          <div className="d-flex justify-space-between align-center mb-2">
            <Text strong>{event.title}</Text>
            <Tag>{event.kind}</Tag>
          </div>
          {event.content && <DbgptRuntimeContent content={event.content} />}
          {event.payload !== undefined && (
            <DbgptRuntimeContent payload={event.payload} />
          )}
        </RuntimeEventCard>
      ))}
    </>
  );
}

function RuntimeContractView({
  app,
  runtimeRoute,
  runtimeContract,
  configurationSummary,
  boundResources,
  apiEndpoint,
  dialogueEndpoint,
  apiPayload,
  onCopyApiPayload,
}: {
  app: DbgptApp;
  runtimeRoute?: RuntimeRoute | null;
  runtimeContract: ReturnType<typeof getAppRuntimeContract> | null;
  configurationSummary: Array<{ label: string; value: string }>;
  boundResources: ReturnType<typeof getBoundResources>;
  apiEndpoint: string;
  dialogueEndpoint: string;
  apiPayload: string;
  onCopyApiPayload: () => void;
}) {
  return (
    <div>
      <RuntimeGrid>
        <RuntimeCard>
          <Text className="gray-7 text-sm">Application code</Text>
          <div>
            <Text strong copyable>
              {app.app_code}
            </Text>
          </div>
        </RuntimeCard>
        <RuntimeCard>
          <Text className="gray-7 text-sm">Chat mode</Text>
          <div>
            <Text strong>
              {runtimeRoute?.mode || runtimeContract?.dialogueMode}
            </Text>
          </div>
        </RuntimeCard>
        <RuntimeCard>
          <Text className="gray-7 text-sm">Execution path</Text>
          <div>
            <Text strong>{runtimeRoute?.route}</Text>
          </div>
          <Text className="gray-7 text-sm">{runtimeRoute?.context}</Text>
        </RuntimeCard>
        <RuntimeCard>
          <Text className="gray-7 text-sm">Resource mode</Text>
          <div>
            <Text strong>{runtimeContract?.resourceSelector || 'Unknown'}</Text>
          </div>
        </RuntimeCard>
        {configurationSummary.map((item) => (
          <RuntimeCard key={item.label}>
            <Text className="gray-7 text-sm">{item.label}</Text>
            <div>
              <Text strong>{item.value}</Text>
            </div>
          </RuntimeCard>
        ))}
        {runtimeContract?.requestFields.map((field) => (
          <RuntimeCard key={field.label}>
            <Text className="gray-7 text-sm">{field.label}</Text>
            <div>
              <Text strong>{field.value}</Text>
            </div>
          </RuntimeCard>
        ))}
      </RuntimeGrid>
      <Title level={5} className="mt-5">
        Resources
      </Title>
      {boundResources.length ? (
        <RuntimeGrid>
          {boundResources.map((resource, index) => (
            <RuntimeCard key={`${resource.agent}-${resource.name}-${index}`}>
              <div className="d-flex justify-space-between gap-2">
                <Text strong>{resource.name}</Text>
                <Tag>{resource.type}</Tag>
              </div>
              <Text className="gray-7 text-sm">
                {resource.agent}
                {resource.dynamic ? ' / dynamic' : ''}
              </Text>
            </RuntimeCard>
          ))}
        </RuntimeGrid>
      ) : (
        <Alert
          type="info"
          showIcon
          message="No fixed resources"
          description="This application either uses a native runtime resource or does not require one."
        />
      )}
      <div className="d-flex justify-space-between align-center mt-5 mb-2">
        <Title level={5} className="mb-0">
          API
        </Title>
        <Button size="small" icon={<CopyOutlined />} onClick={onCopyApiPayload}>
          Copy payload
        </Button>
      </div>
      <RuntimeGrid className="mb-3">
        <RuntimeCard>
          <Text className="gray-7 text-sm">Dialogue endpoint</Text>
          <div>
            <Text copyable>{dialogueEndpoint}</Text>
          </div>
        </RuntimeCard>
        <RuntimeCard>
          <Text className="gray-7 text-sm">Ask endpoint</Text>
          <div>
            <Text copyable>{apiEndpoint}</Text>
          </div>
        </RuntimeCard>
      </RuntimeGrid>
      <CodeBlock>{apiPayload}</CodeBlock>
    </div>
  );
}

function ApplicationAnswerBlock({
  message: runtimeMessage,
  runtimeRoute,
  runtimeContract,
  configurationSummary,
  boundResources,
  apiEndpoint,
  dialogueEndpoint,
  apiPayload,
  app,
  sharing,
  onShareAnswer,
  onCopyApiPayload,
  onRetry,
}: {
  message: RuntimeMessage;
  runtimeRoute?: RuntimeRoute | null;
  runtimeContract: ReturnType<typeof getAppRuntimeContract> | null;
  configurationSummary: Array<{ label: string; value: string }>;
  boundResources: ReturnType<typeof getBoundResources>;
  apiEndpoint: string;
  dialogueEndpoint: string;
  apiPayload: string;
  app: DbgptApp;
  sharing: boolean;
  onShareAnswer: (message: RuntimeMessage) => void;
  onCopyApiPayload: () => void;
  onRetry: (question: string) => void;
}) {
  const result = runtimeMessage.result;
  const isSqlQuery = result?.type === 'SQL_QUERY';
  const isNonSqlQuery = result?.type === 'NON_SQL_QUERY';
  const isLocalRuntime =
    runtimeMessage.localRuntime ||
    runtimeMessage.runtime?.source === 'veadk_data_product';
  const dbgptRuntimeError = Boolean(
    !isLocalRuntime &&
      runtimeMessage.content.match(
        /^\s*(\[[^\]]*error[^\]]*\]|DB-GPT model authorization failed|Chat failed with HTTP)/i,
      ),
  );
  const shareDisabledReason = runtimeMessage.pending
    ? 'Wait for this answer to finish before sharing.'
    : runtimeMessage.error
      ? 'Failed answers cannot be shared.'
      : isLocalRuntime && !runtimeMessage.apiHistoryId
        ? 'This answer does not have a saved application history id.'
        : !isLocalRuntime
          ? 'This runtime currently supports conversation sharing, not single-answer sharing.'
          : undefined;

  return (
    <AnswerBlock
      data-jsid="applicationAnswerResult"
      data-testid="application-answer-result"
    >
      <QuestionTitle level={4}>
        <MessageOutlined className="geekblue-5 mt-1 mr-3" />
        <Text className="text-medium gray-8">
          {runtimeMessage.question || 'Application question'}
        </Text>
      </QuestionTitle>

      {runtimeMessage.pending && (
        <div
          className="bg-white border border-gray-4 rounded p-5"
          data-testid="application-answer-pending"
        >
          <div className="d-flex align-center mb-4">
            <Spin size="small" className="mr-2" />
            <Text>{runtimeMessage.content}</Text>
          </div>
          <div data-testid="application-answer-skeleton">
            <Skeleton active paragraph={{ rows: 4 }} title={false} />
          </div>
          <AnswerFooter>
            <ShareAnswerButton
              disabledReason={shareDisabledReason}
              loading={false}
              onClick={() => onShareAnswer(runtimeMessage)}
            />
          </AnswerFooter>
        </div>
      )}

      {!runtimeMessage.pending && (
        <>
          <StyledTabs type="card" size="small">
            <Tabs.TabPane
              key="answer"
              tab={
                <TabLabel
                  icon={<CheckCircleFilled className="green-5" />}
                  label="Answer"
                />
              }
            >
              <TabInner>
                {runtimeMessage.error ? (
                  <Alert
                    type="error"
                    showIcon
                    message={getErrorStageLabel(
                      runtimeMessage.errorPayload?.stage,
                    )}
                    description={
                      <div>
                        <Paragraph className="mb-2">
                          {runtimeMessage.content}
                        </Paragraph>
                        {runtimeMessage.errorPayload?.advice && (
                          <Paragraph className="mb-0">
                            <Text strong>Next step: </Text>
                            {runtimeMessage.errorPayload.advice}
                          </Paragraph>
                        )}
                      </div>
                    }
                    action={
                      runtimeMessage.question ? (
                        <Button
                          size="small"
                          onClick={() => onRetry(runtimeMessage.question || '')}
                        >
                          Retry
                        </Button>
                      ) : undefined
                    }
                  />
                ) : result?.runtimeError ? (
                  <Alert
                    className="mb-4"
                    type="warning"
                    showIcon
                    message={`Runtime degraded at ${result.runtimeError.stage}`}
                    description={result.runtimeError.message}
                  />
                ) : null}
                {!runtimeMessage.error &&
                  (dbgptRuntimeError ? (
                    <Alert
                      type="error"
                      showIcon
                      message="Runtime returned an error"
                      description={
                        <DbgptRuntimeContent content={runtimeMessage.content} />
                      }
                    />
                  ) : isNonSqlQuery ? (
                    <DbgptRuntimeContent
                      content={result?.explanation || runtimeMessage.content}
                    />
                  ) : (
                    <DbgptRuntimeContent
                      content={result?.summary || runtimeMessage.content}
                    />
                  ))}
              </TabInner>
            </Tabs.TabPane>
            {!runtimeMessage.error && isSqlQuery && (
              <Tabs.TabPane
                key="data"
                tab={<TabLabel icon={<DatabaseOutlined />} label="Data" />}
              >
                <TabInner>
                  <RuntimeDataTable result={result} />
                </TabInner>
              </Tabs.TabPane>
            )}
            {!runtimeMessage.error && isSqlQuery && (
              <Tabs.TabPane
                key="sql"
                tab={<TabLabel icon={<CodeOutlined />} label="SQL" />}
              >
                <TabInner>
                  <SqlBlock>{result?.sql || 'No SQL returned.'}</SqlBlock>
                </TabInner>
              </Tabs.TabPane>
            )}
            {!runtimeMessage.error && isSqlQuery && result && (
              <Tabs.TabPane
                key="chart"
                tab={<TabLabel icon={<BarChartOutlined />} label="Chart" />}
              >
                <TabInner>
                  <DbgptRuntimeContent content={getChartMarkdown(result)} />
                </TabInner>
              </Tabs.TabPane>
            )}
            <Tabs.TabPane
              key="runtime"
              tab={<TabLabel icon={<FileTextOutlined />} label="Runtime" />}
            >
              <TabInner>
                {isLocalRuntime ? (
                  <>
                    {result?.runtimeError && (
                      <Alert
                        className="mb-4"
                        type="warning"
                        showIcon
                        message={`Runtime degraded at ${result.runtimeError.stage}`}
                        description={result.runtimeError.message}
                      />
                    )}
                    <RuntimeGrid className="mb-4">
                      <RuntimeCard>
                        <Text className="gray-7 text-sm">Runtime</Text>
                        <div>
                          <Text strong>{runtimeMessage.runtime?.source}</Text>
                        </div>
                      </RuntimeCard>
                      <RuntimeCard>
                        <Text className="gray-7 text-sm">Result type</Text>
                        <div>
                          <Text strong>{result?.type || 'Unknown'}</Text>
                        </div>
                      </RuntimeCard>
                      <RuntimeCard>
                        <Text className="gray-7 text-sm">Thread</Text>
                        <div>
                          <Text strong copyable>
                            {result?.threadId || 'Unknown'}
                          </Text>
                        </div>
                      </RuntimeCard>
                      <RuntimeCard>
                        <Text className="gray-7 text-sm">Project</Text>
                        <div>
                          <Text strong>
                            {result?.project?.displayName || '-'}
                          </Text>
                        </div>
                      </RuntimeCard>
                    </RuntimeGrid>
                    <RuntimeContractView
                      app={app}
                      runtimeRoute={runtimeRoute}
                      runtimeContract={runtimeContract}
                      configurationSummary={configurationSummary}
                      boundResources={boundResources}
                      apiEndpoint={apiEndpoint}
                      dialogueEndpoint={dialogueEndpoint}
                      apiPayload={apiPayload}
                      onCopyApiPayload={onCopyApiPayload}
                    />
                  </>
                ) : (
                  <>
                    <RuntimeEventList
                      events={runtimeMessage.runtime?.events}
                      runtimeRoute={runtimeRoute}
                    />
                    <RuntimeContractView
                      app={app}
                      runtimeRoute={runtimeRoute}
                      runtimeContract={runtimeContract}
                      configurationSummary={configurationSummary}
                      boundResources={boundResources}
                      apiEndpoint={apiEndpoint}
                      dialogueEndpoint={dialogueEndpoint}
                      apiPayload={apiPayload}
                      onCopyApiPayload={onCopyApiPayload}
                    />
                  </>
                )}
              </TabInner>
            </Tabs.TabPane>
          </StyledTabs>
          <AnswerFooter>
            <ShareAnswerButton
              disabledReason={shareDisabledReason}
              loading={sharing}
              onClick={() => onShareAnswer(runtimeMessage)}
            />
          </AnswerFooter>
        </>
      )}
    </AnswerBlock>
  );
}

export default function ApplicationRunPage() {
  const router = useRouter();
  const appCodeQuery = router.query.appCode;
  const appCode = Array.isArray(appCodeQuery)
    ? appCodeQuery[0]
    : appCodeQuery || '';
  const convUidQuery = router.query.conv_uid;
  const initialConvUid = Array.isArray(convUidQuery)
    ? convUidQuery[0]
    : convUidQuery || '';
  const sessionIdQuery = router.query.session_id;
  const initialSessionId = Array.isArray(sessionIdQuery)
    ? sessionIdQuery[0]
    : sessionIdQuery || '';

  const [app, setApp] = useState<DbgptApp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [sessions, setSessions] = useState<RuntimeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [sessionsReady, setSessionsReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [sharingMessageId, setSharingMessageId] = useState('');
  const [runtimeResource, setRuntimeResource] = useState('');
  const [resourceOptions, setResourceOptions] = useState<DbgptResourceOption[]>(
    [],
  );
  const [resourceLoading, setResourceLoading] = useState(false);
  const [dataProductInfo, setDataProductInfo] =
    useState<DataProductRuntimeInfo | null>(null);
  const [dataProductError, setDataProductError] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const loadedSessionsAppCodeRef = useRef('');

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === activeSessionId) || null,
    [activeSessionId, sessions],
  );
  const messages = activeSession?.messages || [];

  const replaceSessionRoute = useCallback(
    (session: RuntimeSession) => {
      if (!appCode || !router.isReady) return;
      const currentSessionId = Array.isArray(router.query.session_id)
        ? router.query.session_id[0]
        : router.query.session_id || '';
      const currentConvUid = Array.isArray(router.query.conv_uid)
        ? router.query.conv_uid[0]
        : router.query.conv_uid || '';
      const nextConvUid = session.convUid || '';
      if (currentSessionId === session.id && currentConvUid === nextConvUid) {
        return;
      }
      router.replace(
        {
          pathname: `${Path.ApplicationRun}/[appCode]`,
          query: {
            appCode,
            session_id: session.id,
            ...(session.convUid ? { conv_uid: session.convUid } : {}),
          },
        },
        undefined,
        { shallow: true },
      );
    },
    [appCode, router],
  );

  useEffect(() => {
    if (!router.isReady || !appCode) return;
    setLoading(true);
    setError('');
    fetchAppByCode(appCode)
      .then((data) => {
        setApp(data);
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load this application.',
        );
      })
      .finally(() => setLoading(false));
  }, [appCode, router.isReady]);

  useEffect(() => {
    if (!router.isReady || !appCode) return;
    if (loadedSessionsAppCodeRef.current === appCode) return;
    const stored = readStoredSessions(appCode);
    const { sessions: nextSessions, selected } = reconcileRouteSession(
      stored,
      initialSessionId,
      initialConvUid,
    );
    setSessions(nextSessions);
    setActiveSessionId(selected.id);
    setRuntimeResource(selected.resource || '');
    setSessionsReady(true);
    loadedSessionsAppCodeRef.current = appCode;
    replaceSessionRoute(selected);
  }, [
    appCode,
    initialConvUid,
    initialSessionId,
    replaceSessionRoute,
    router.isReady,
  ]);

  useEffect(() => {
    if (!sessionsReady || !initialSessionId) return;
    const matched = sessions.find((item) => item.id === initialSessionId);
    if (!matched || matched.id === activeSessionId) return;
    setActiveSessionId(matched.id);
    setRuntimeResource(matched.resource || '');
  }, [activeSessionId, initialSessionId, sessions, sessionsReady]);

  useEffect(() => {
    if (!sessionsReady || !appCode) return;
    writeStoredSessions(appCode, sessions);
  }, [appCode, sessions, sessionsReady]);

  useEffect(() => {
    if (
      !sessionsReady ||
      running ||
      !activeSession ||
      !shouldRestoreDbgptHistory(activeSession)
    ) {
      return;
    }

    let cancelled = false;
    const targetSessionId = activeSession.id;
    const targetConvUid = activeSession.convUid;
    const hadPending = activeSession.messages.some((item) => item.pending);

    const loadHistory = async () => {
      if (!targetConvUid) return;
      const history = hadPending
        ? await waitForConversationHistory(targetConvUid, {
            minMessages: 2,
            timeoutMs: 8000,
          })
        : await fetchConversationHistory(targetConvUid).catch(() => []);
      if (cancelled) return;

      const rounds = buildDbgptHistoryRounds(history);
      if (rounds.length) {
        const restoredMessages = createMessagesFromDbgptHistory(rounds);
        setSessions((current) =>
          current.map((session) =>
            session.id === targetSessionId && session.convUid === targetConvUid
              ? {
                  ...session,
                  title:
                    session.title === 'New conversation'
                      ? getSessionTitle(rounds[0].question)
                      : session.title,
                  messages: restoredMessages,
                  updatedAt: new Date().toISOString(),
                }
              : session,
          ),
        );
        return;
      }

      if (!hadPending) return;
      setSessions((current) =>
        current.map((session) =>
          session.id === targetSessionId && session.convUid === targetConvUid
            ? {
                ...session,
                messages: session.messages.map((item) =>
                  item.pending
                    ? {
                        ...item,
                        content:
                          'The previous DB-GPT request did not return a saved response. Please send the question again.',
                        pending: false,
                        error: true,
                      }
                    : item,
                ),
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      );
    };

    loadHistory().catch(() => {
      if (cancelled || !hadPending) return;
      setSessions((current) =>
        current.map((session) =>
          session.id === targetSessionId && session.convUid === targetConvUid
            ? {
                ...session,
                messages: session.messages.map((item) =>
                  item.pending
                    ? {
                        ...item,
                        content:
                          'Unable to restore the previous DB-GPT response. Please send the question again.',
                        pending: false,
                        error: true,
                      }
                    : item,
                ),
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [activeSession, running, sessionsReady]);

  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.scrollTo({
      top: contentRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length]);

  const published = app ? isAppPublished(app) : false;
  const complete = app ? getAppCompleteness(app) : false;
  const runtimeReady = app ? getAppRuntimeReady(app) : false;
  const runnable = Boolean(app && published && getAppRuntimeReady(app));
  const runtimeResourceType = getNativeRuntimeResource(app);
  const dataProductBinding = app
    ? findVeadkDataProductBinding(app, { selectParam: runtimeResource })
    : null;
  const localRuntime = Boolean(dataProductBinding);
  const canSend = Boolean(
    runnable &&
      activeSession &&
      !dataProductError &&
      (!runtimeResourceType || runtimeResource) &&
      !running,
  );

  const recommendedQuestions = useMemo(() => {
    const appQuestions = app
      ? getRecommendQuestions(app).filter(
          (item) => item.valid !== false && item.question,
        )
      : [];
    if (appQuestions.length) return appQuestions;
    return (dataProductInfo?.questions || []).filter(
      (item) => item.valid !== false && item.question,
    );
  }, [app, dataProductInfo?.questions]);

  const configurationSummary = useMemo(
    () => (app ? getAppConfigurationSummary(app) : []),
    [app],
  );
  const runtimeContract = useMemo(
    () =>
      app ? getAppRuntimeContract(app, { selectParam: runtimeResource }) : null,
    [app, runtimeResource],
  );
  const runtimeRoute = useMemo(
    () =>
      app
        ? getApplicationRuntimeRoute(app, localRuntime, runtimeResource)
        : null,
    [app, localRuntime, runtimeResource],
  );
  const boundResources = useMemo(
    () => (app ? getBoundResources(app) : []),
    [app],
  );
  const apiPayload = useMemo(
    () =>
      app ? getApiInvocationPayload(app, { selectParam: runtimeResource }) : '',
    [app, runtimeResource],
  );
  const apiEndpoint = app
    ? getApiInvocationEndpoint(app, { selectParam: runtimeResource })
    : '';
  const dialogueEndpoint = app
    ? getDialogueCreationEndpoint(app, { selectParam: runtimeResource })
    : '';

  useEffect(() => {
    if (!runtimeResourceType) {
      setRuntimeResource('');
      setResourceOptions([]);
      return;
    }
    setResourceLoading(true);
    fetchDbgpt<DbgptResourceOption[]>(
      `/api/v1/app/resources/list?type=${encodeURIComponent(
        runtimeResourceType,
      )}`,
    )
      .then((data) => setResourceOptions(data || []))
      .catch((err) => {
        setResourceOptions([]);
        message.warning(
          err instanceof Error
            ? `Unable to load ${runtimeResourceType} resources: ${err.message}`
            : `Unable to load ${runtimeResourceType} resources.`,
        );
      })
      .finally(() => setResourceLoading(false));
  }, [runtimeResourceType]);

  useEffect(() => {
    if (!runtimeResourceType) return;
    setRuntimeResource(activeSession?.resource || '');
  }, [activeSession?.id, runtimeResourceType]);

  useEffect(() => {
    if (!dataProductBinding?.projectId) {
      setDataProductInfo(null);
      setDataProductError('');
      return;
    }
    setDataProductError('');
    fetch(`/api/applications/data-products/${dataProductBinding.projectId}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'Unable to load data product.');
        }
        return payload as DataProductRuntimeInfo;
      })
      .then(setDataProductInfo)
      .catch((err) => {
        setDataProductInfo(null);
        setDataProductError(
          err instanceof Error
            ? err.message
            : 'Data product is unavailable in the current runtime.',
        );
      });
  }, [dataProductBinding?.projectId]);

  const updateActiveSession = useCallback(
    (updater: (session: RuntimeSession) => RuntimeSession) => {
      setSessions((current) =>
        current.map((session) =>
          session.id === activeSessionId ? updater(session) : session,
        ),
      );
    },
    [activeSessionId],
  );

  const startNewSession = () => {
    const next = createRuntimeSession();
    if (runtimeResource) next.resource = runtimeResource;
    setSessions((current) => [next, ...current]);
    setActiveSessionId(next.id);
    setQuestion('');
    replaceSessionRoute(next);
  };

  const selectSession = (session: RuntimeSession) => {
    setActiveSessionId(session.id);
    setRuntimeResource(session.resource || '');
    replaceSessionRoute(session);
  };

  const deleteSession = async (sessionId: string) => {
    setSessions((current) => {
      const next = current.filter((session) => session.id !== sessionId);
      if (sessionId !== activeSessionId) return next;
      const replacement = next[0] || createRuntimeSession();
      setActiveSessionId(replacement.id);
      setRuntimeResource(replacement.resource || '');
      replaceSessionRoute(replacement);
      return next.length ? next : [replacement];
    });
  };

  const onRuntimeResourceChange = (value?: string) => {
    const nextValue = value || '';
    setRuntimeResource(nextValue);
    if (!activeSession) return;
    updateActiveSession((session) => ({
      ...session,
      resource: nextValue,
      updatedAt: new Date().toISOString(),
    }));
  };

  const ensureDialogue = async () => {
    if (!app) throw new Error('Application is not loaded.');
    if (!activeSession) throw new Error('No runtime session is selected.');
    if (activeSession.convUid) return activeSession.convUid;
    const dialogue = await createAppDialogue(app, {
      selectParam: runtimeResourceType ? runtimeResource : undefined,
    });
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSession.id
          ? {
              ...session,
              convUid: dialogue.convUid,
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );
    replaceSessionRoute({
      ...activeSession,
      convUid: dialogue.convUid,
    });
    return dialogue.convUid;
  };

  const send = async (input = question) => {
    const trimmed = input.trim();
    if (!app || !trimmed || running || !canSend || !activeSession) return;
    const now = Date.now();
    const createdAt = new Date().toISOString();
    const pendingMessageId = `${now}-assistant-pending`;
    const userMessage: RuntimeMessage = {
      id: `${now}-user`,
      role: 'user',
      content: trimmed,
      createdAt,
    };
    const pendingMessage: RuntimeMessage = {
      id: pendingMessageId,
      role: 'assistant',
      question: trimmed,
      content: getPendingText(runtimeContract, localRuntime),
      pending: true,
      localRuntime,
      createdAt,
    };

    setRunning(true);
    setQuestion('');
    updateActiveSession((session) => ({
      ...session,
      title:
        session.messages.length === 0
          ? getSessionTitle(trimmed)
          : session.title,
      messages: [...session.messages, userMessage, pendingMessage],
      updatedAt: createdAt,
    }));

    try {
      const currentConvUid = await ensureDialogue();
      const [answer] = await Promise.all([
        sendAppChat(app, currentConvUid, trimmed, {
          selectParam: runtimeResourceType ? runtimeResource : undefined,
        }),
        wait(700),
      ]);
      updateActiveSession((session) => ({
        ...session,
        convUid: currentConvUid,
        messages: session.messages.map((item) =>
          item.id === pendingMessageId
            ? {
                ...item,
                content: answer.content,
                apiHistoryId: answer.apiHistoryId,
                pending: false,
                localRuntime: Boolean(answer.localRuntime),
                result: answer.raw,
                runtime: answer.runtime,
              }
            : item,
        ),
        updatedAt: new Date().toISOString(),
      }));
    } catch (err) {
      const errorPayload =
        err instanceof Error && 'payload' in err
          ? ((err as Error & { payload?: VeadkApplicationAskErrorPayload })
              .payload as VeadkApplicationAskErrorPayload | undefined)
          : undefined;
      updateActiveSession((session) => ({
        ...session,
        messages: session.messages.map((item) =>
          item.id === pendingMessageId
            ? {
                ...item,
                content:
                  err instanceof Error
                    ? err.message
                    : 'Application chat failed.',
                pending: false,
                error: true,
                errorPayload,
              }
            : item,
        ),
        updatedAt: new Date().toISOString(),
      }));
    } finally {
      setRunning(false);
    }
  };

  const copyAppLink = async () => {
    if (!app) return;
    try {
      await copyToClipboard(getAppUrl(app.app_code));
      message.success('Application link copied.');
    } catch {
      message.error('Unable to copy application link.');
    }
  };

  const copyApiPayload = async () => {
    if (!app) return;
    try {
      await copyToClipboard(apiPayload);
      message.success('API payload copied.');
    } catch {
      message.error('Unable to copy API payload.');
    }
  };

  const shareLocalAnswer = async (runtimeMessage: RuntimeMessage) => {
    if (!runtimeMessage.apiHistoryId) {
      message.warning('This answer does not have a saved history id.');
      return;
    }
    setSharingMessageId(runtimeMessage.id);
    try {
      const response = await fetch('/api/applications/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiHistoryId: runtimeMessage.apiHistoryId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const details = [
          payload?.error || 'Unable to create share link.',
          payload?.stage ? `Stage: ${payload.stage}` : '',
          payload?.advice ? `Next step: ${payload.advice}` : '',
        ].filter(Boolean);
        throw new Error(details.join('\n'));
      }
      const shareUrl = getApplicationResultShareUrl(payload.token);
      try {
        await copyToClipboard(shareUrl);
        message.success('Application result link copied.');
      } catch {
        Modal.info({
          title: 'Application result link',
          content: <Text copyable>{shareUrl}</Text>,
          okText: 'Close',
        });
      }
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : 'Unable to create application result share.',
      );
    } finally {
      setSharingMessageId('');
    }
  };

  const shareConversation = async () => {
    if (!activeSession?.convUid || !messages.length) {
      message.warning('Ask this application before sharing the conversation.');
      return;
    }

    const latestLocalAnswer = messages
      .slice()
      .reverse()
      .find(
        (item) =>
          item.role === 'assistant' &&
          !item.pending &&
          !item.error &&
          (item.localRuntime ||
            isLocalApplicationConversationId(activeSession.convUid)) &&
          item.apiHistoryId,
      );
    if (latestLocalAnswer) {
      await shareLocalAnswer(latestLocalAnswer);
      return;
    }

    if (isLocalApplicationConversationId(activeSession.convUid)) {
      message.warning(
        'This conversation does not have a shareable result yet.',
      );
      return;
    }

    setSharingMessageId('conversation');
    message.loading({
      content: 'Preparing application conversation link...',
      key: 'application-conversation-share',
      duration: 0,
    });
    try {
      const history = await waitForConversationHistory(activeSession.convUid, {
        timeoutMs: 30000,
      });
      if (history.length < 2) {
        message.warning({
          content:
            'Conversation is still being saved by DB-GPT. Try sharing again shortly.',
          key: 'application-conversation-share',
        });
        return;
      }
      const share = await createConversationShareLink(activeSession.convUid);
      const shareUrl = getConversationShareUrl(share.share_url);
      try {
        await copyToClipboard(shareUrl);
        message.success({
          content: 'Application conversation link copied.',
          key: 'application-conversation-share',
        });
      } catch {
        message.destroy('application-conversation-share');
        Modal.info({
          title: 'Application conversation link',
          content: <Text copyable>{shareUrl}</Text>,
          okText: 'Close',
        });
      }
    } catch (err) {
      message.error({
        content:
          err instanceof Error
            ? err.message
            : 'Unable to create conversation share link.',
        key: 'application-conversation-share',
      });
    } finally {
      setSharingMessageId('');
    }
  };

  const answerMessages = useMemo(
    () => messages.filter((item) => item.role === 'assistant'),
    [messages],
  );
  const sortedSessions = useMemo(
    () =>
      sessions
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [sessions],
  );

  return (
    <SimpleLayout loading={loading} checkOnboarding={false}>
      <Shell>
        <Sidebar>
          <SidebarHeader>
            <SidebarApp>
              <AppIcon>
                <AppstoreOutlined />
              </AppIcon>
              <div style={{ minWidth: 0 }}>
                <Text strong ellipsis>
                  {app?.app_name || 'Application'}
                </Text>
                <div>
                  <Text className="gray-7 text-xs">
                    {runtimeRoute?.title || 'Runtime dashboard'}
                  </Text>
                </div>
              </div>
            </SidebarApp>
            <SidebarActions>
              <Button
                block
                icon={<PlusOutlined />}
                type="primary"
                data-testid="runtime-new-thread"
                onClick={startNewSession}
              >
                New
              </Button>
              <Button
                block
                icon={<LeftOutlined />}
                onClick={() => router.push(Path.Applications)}
              >
                Applications
              </Button>
            </SidebarActions>
          </SidebarHeader>
          <SidebarSection>
            <DashboardNode $selected>
              <FundViewOutlined />
              <span className="text-medium">Runtime Dashboard</span>
            </DashboardNode>
          </SidebarSection>
          <SidebarSection>
            <SidebarSectionHeader>
              <Text strong>Threads</Text>
              <Tag>{sessions.length}</Tag>
            </SidebarSectionHeader>
            <ThreadList>
              {sortedSessions.map((session) => (
                <ThreadItem
                  key={session.id}
                  data-testid="runtime-thread-item"
                  $selected={session.id === activeSessionId}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectSession(session)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectSession(session);
                    }
                  }}
                >
                  <ThreadTitle>
                    <ThreadName>{session.title}</ThreadName>
                    <ThreadMeta>
                      {formatSessionTime(session.updatedAt)}
                      {session.convUid ? ` / ${session.convUid}` : ''}
                    </ThreadMeta>
                  </ThreadTitle>
                  <Popconfirm
                    title="Delete this thread?"
                    okText="Delete"
                    okButtonProps={{ danger: true }}
                    onConfirm={(event) => {
                      event?.stopPropagation();
                      deleteSession(session.id);
                    }}
                    onCancel={(event) => event?.stopPropagation()}
                  >
                    <Button
                      type="text"
                      size="small"
                      data-testid="runtime-delete-thread"
                      icon={<DeleteOutlined />}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Popconfirm>
                </ThreadItem>
              ))}
            </ThreadList>
          </SidebarSection>
        </Sidebar>

        <Main>
          <TopBar>
            <HeaderTitle>
              <AppIcon>
                <AppstoreOutlined />
              </AppIcon>
              <div style={{ minWidth: 0 }}>
                <Title level={4} className="mb-0">
                  {app?.app_name || 'Application'}
                </Title>
                <Paragraph className="gray-7 mb-0 mt-1">
                  {app?.app_describe || runtimeContract?.title || 'Runtime'}
                </Paragraph>
                {app && (
                  <MetaRow>
                    <StatusTag
                      status={published ? 'published' : 'unpublished'}
                    />
                    <Tag color={runtimeReady ? 'green' : 'orange'}>
                      {getAppActionHint(app)}
                    </Tag>
                    <Tag>
                      {localRuntime
                        ? 'veadk_data_product'
                        : getAppChatMode(app)}
                    </Tag>
                    {activeSession?.convUid && (
                      <Tag color="blue">{activeSession.convUid}</Tag>
                    )}
                  </MetaRow>
                )}
              </div>
            </HeaderTitle>
            <TopActions>
              {runtimeResourceType && (
                <Select
                  style={{ minWidth: 220 }}
                  showSearch
                  allowClear
                  loading={resourceLoading}
                  value={runtimeResource || undefined}
                  placeholder={`Select ${runtimeResourceType}`}
                  options={resourceOptions.map((item) => ({
                    label: item.label || item.key,
                    value: item.key,
                  }))}
                  onChange={onRuntimeResourceChange}
                />
              )}
              <Button
                icon={<CopyOutlined />}
                disabled={!app}
                onClick={copyAppLink}
              >
                Copy link
              </Button>
              <Button
                icon={<ShareAltOutlined />}
                data-testid="share-latest-button"
                disabled={!activeSession?.convUid || !messages.length}
                loading={sharingMessageId === 'conversation'}
                onClick={shareConversation}
              >
                Share latest
              </Button>
            </TopActions>
          </TopBar>

          {error ? (
            <div className="p-6">
              <Alert
                type="error"
                showIcon
                message="Application could not be opened"
                description={error}
                action={
                  <Button onClick={() => router.push(Path.Applications)}>
                    Back
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <Content ref={contentRef}>
                <PromptThread>
                  {!runnable && app && (
                    <Alert
                      className="mb-5"
                      type="warning"
                      showIcon
                      message="This application is not callable yet"
                      description={
                        !published
                          ? 'Publish the application before users can run it.'
                          : complete
                            ? 'Bind a runtime resource or prompt before chat.'
                            : 'Complete its agent, workflow, or native app configuration before chat.'
                      }
                      action={
                        <Button
                          size="small"
                          onClick={() =>
                            router.push(getConfigureUrl(app.app_code))
                          }
                        >
                          Configure
                        </Button>
                      }
                    />
                  )}
                  {runtimeResourceType && runnable && !runtimeResource && (
                    <Alert
                      className="mb-5"
                      type="info"
                      showIcon
                      message={`Select a ${runtimeResourceType} before asking`}
                      description="The selected resource is sent as select_param for this runtime session."
                    />
                  )}
                  {dataProductError && (
                    <Alert
                      className="mb-5"
                      type="error"
                      showIcon
                      message="Data product unavailable"
                      description={dataProductError}
                      action={
                        <Button
                          size="small"
                          onClick={() => {
                            if (app) router.push(getConfigureUrl(app.app_code));
                          }}
                        >
                          Configure
                        </Button>
                      }
                    />
                  )}

                  {answerMessages.length && app ? (
                    answerMessages.map((item) => (
                      <ApplicationAnswerBlock
                        key={item.id}
                        message={item}
                        app={app}
                        runtimeRoute={runtimeRoute}
                        runtimeContract={runtimeContract}
                        configurationSummary={configurationSummary}
                        boundResources={boundResources}
                        apiEndpoint={apiEndpoint}
                        dialogueEndpoint={dialogueEndpoint}
                        apiPayload={apiPayload}
                        sharing={sharingMessageId === item.id}
                        onShareAnswer={shareLocalAnswer}
                        onCopyApiPayload={copyApiPayload}
                        onRetry={(retryQuestion) => send(retryQuestion)}
                      />
                    ))
                  ) : (
                    <EmptyThread>
                      <div>
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            app
                              ? 'Start a runtime thread'
                              : 'Loading application'
                          }
                        />
                        {recommendedQuestions.length > 0 && (
                          <SuggestedQuestions>
                            {recommendedQuestions.map((item, index) => (
                              <Button
                                data-testid="recommended-question"
                                key={`${item.question}-${index}`}
                                disabled={!canSend}
                                onClick={() => send(item.question)}
                              >
                                {item.question}
                              </Button>
                            ))}
                          </SuggestedQuestions>
                        )}
                      </div>
                    </EmptyThread>
                  )}
                </PromptThread>
              </Content>

              <ComposerWrap>
                <ComposerInner>
                  <ComposerBox>
                    <Input.TextArea
                      value={question}
                      disabled={!canSend}
                      bordered={false}
                      placeholder={
                        runtimeResourceType && !runtimeResource
                          ? `Select a ${runtimeResourceType} first`
                          : 'Ask this application'
                      }
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      onChange={(event) => setQuestion(event.target.value)}
                      onPressEnter={(event) => {
                        if (!event.shiftKey) {
                          event.preventDefault();
                          send();
                        }
                      }}
                    />
                    <ComposerFooter>
                      <Text className="gray-7 text-sm">
                        {!runnable
                          ? 'Publish and complete configuration before asking'
                          : runtimeResourceType && !runtimeResource
                            ? `Select a ${runtimeResourceType} first`
                            : activeSession?.convUid
                              ? 'Runtime thread active'
                              : 'New runtime thread'}
                      </Text>
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        data-testid="runtime-send-button"
                        disabled={!canSend || !question.trim()}
                        loading={running}
                        onClick={() => send()}
                      >
                        {running ? 'Asking' : 'Send'}
                      </Button>
                    </ComposerFooter>
                  </ComposerBox>
                </ComposerInner>
              </ComposerWrap>
            </>
          )}
        </Main>
      </Shell>
    </SimpleLayout>
  );
}
