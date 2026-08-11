import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Collapse,
  Spin,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import styled from 'styled-components';
import { ConstructLayout } from '@/components/construct/ConstructLayout';
import DbgptRuntimeContent from '@/components/applications/DbgptRuntimeContent';
import {
  DbgptApp,
  DbgptShareConversation,
  DbgptShareMessage,
  fetchDbgpt,
} from '@/lib/dbgpt';
import { VeadkApplicationAskResponse } from '@/lib/veadkApplicationResources';
import {
  fetchAppByCode,
  getAppActionHint,
  getAppChatMode,
  getAppConfigurationSummary,
  isAppPublished,
} from '@/lib/dbgptRuntime';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;

const ReplayShell = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const ResultPanel = styled.div`
  min-height: calc(100vh - 220px);
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const HeroMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 18px;
`;

const QuestionPanel = styled.div`
  padding: 12px 14px;
  margin-bottom: 14px;
  border: 1px solid rgba(40, 103, 245, 0.22);
  border-radius: 8px;
  background: rgba(40, 103, 245, 0.05);
`;

const AnswerPanel = styled.div`
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const SidePanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const SideCard = styled.div`
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const MessageBlock = styled.div<{ $role: string }>`
  max-width: 100%;
  padding: 12px 14px;
  border: 1px solid
    ${(props) =>
      props.$role === 'human'
        ? 'rgba(40, 103, 245, 0.24)'
        : 'rgba(226, 232, 240, 0.98)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$role === 'human' ? 'rgba(40, 103, 245, 0.06)' : '#f8fafc'};
`;

const MessageMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
`;

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 10px 0;
  border-top: 1px solid rgba(226, 232, 240, 0.88);

  &:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
`;

const DetailValue = styled.div`
  min-width: 0;
  color: #111827;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
`;

type ShareRound = {
  question?: DbgptShareMessage;
  answer?: DbgptShareMessage;
};

type ApplicationResultShare = {
  token: string;
  shareUrl: string;
  appCode: string;
  projectId: number;
  apiHistoryId: string;
  createdAt?: string;
  result: VeadkApplicationAskResponse;
  request: {
    question?: string;
    threadId?: string;
    sampleSize?: number;
    language?: string;
  };
};

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const copyToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
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

const stripRuntimeMarkdown = (value: string) =>
  value
    .replace(/`{3,}vis-thinking[\s\S]*?`{3,}/g, '')
    .replace(/```agent-plans\s*\n[\s\S]*?\n```/g, '')
    .replace(/```agent-messages\s*\n[\s\S]*?\n```/g, '')
    .trim();

const extractAgentMessages = (value: string) => {
  const messages: string[] = [];
  extractFenceBlocks(value, 'agent-messages').forEach((block) => {
    try {
      const parsed = JSON.parse(block) as Array<{
        sender?: string;
        markdown?: string;
      }>;
      parsed.forEach((item) => {
        const sender = String(item.sender || '').toLowerCase();
        const markdown = stripRuntimeMarkdown(String(item.markdown || ''));
        if (sender !== 'human' && markdown) {
          messages.push(markdown);
        }
      });
    } catch {
      // Some agent-messages blocks are nested inside agent-plan markdown.
    }
  });
  return messages;
};

const normalizeMessage = (messageItem: DbgptShareMessage) => {
  if (isHumanMessage(messageItem)) return messageItem.context;
  const extracted = extractAgentMessages(messageItem.context);
  if (extracted.length) return extracted[extracted.length - 1];
  return stripRuntimeMarkdown(messageItem.context) || messageItem.context;
};

const isHumanMessage = (messageItem: DbgptShareMessage) => {
  const role = String(messageItem.role || '').toLowerCase();
  return role === 'human' || role === 'user';
};

const buildRounds = (messages: DbgptShareMessage[]) => {
  const rounds: ShareRound[] = [];
  let current: ShareRound | null = null;
  messages.forEach((item) => {
    if (isHumanMessage(item)) {
      current = { question: item };
      rounds.push(current);
      return;
    }
    if (!current) {
      current = {};
      rounds.push(current);
    }
    current.answer = item;
  });
  return rounds;
};

export default function ApplicationShareReplay() {
  const router = useRouter();
  const token = getQueryValue(router.query.token);
  const appCode = getQueryValue(router.query.app_code);
  const [conversation, setConversation] =
    useState<DbgptShareConversation | null>(null);
  const [applicationShare, setApplicationShare] =
    useState<ApplicationResultShare | null>(null);
  const [app, setApp] = useState<DbgptApp | null>(null);
  const [loading, setLoading] = useState(false);
  const [appLoading, setAppLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadShare = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/share/${encodeURIComponent(token)}`,
      );
      if (response.ok) {
        const data = (await response.json()) as ApplicationResultShare;
        setApplicationShare(data);
        setConversation(null);
        return;
      }

      const data = await fetchDbgpt<DbgptShareConversation>(
        `/api/v1/chat/share/${encodeURIComponent(token)}`,
      );
      setApplicationShare(null);
      setConversation(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load shared conversation.',
      );
      setConversation(null);
      setApplicationShare(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShare();
  }, [token]);

  useEffect(() => {
    const targetAppCode = appCode || applicationShare?.appCode;
    if (!router.isReady || !targetAppCode) return;
    setAppLoading(true);
    fetchAppByCode(targetAppCode)
      .then(setApp)
      .catch(() => setApp(null))
      .finally(() => setAppLoading(false));
  }, [appCode, applicationShare?.appCode, router.isReady]);

  const messages = useMemo(
    () =>
      (conversation?.messages || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [conversation?.messages],
  );
  const rounds = useMemo(() => buildRounds(messages), [messages]);
  const latestRound = rounds
    .slice()
    .reverse()
    .find((item) => item.answer || item.question);
  const firstQuestion = rounds.find((item) => item.question)?.question?.context;
  const resultQuestion =
    applicationShare?.request.question ||
    latestRound?.question?.context ||
    firstQuestion ||
    'No user question found.';
  const resultColumns = applicationShare?.result.data?.columns || [];
  const resultRows = applicationShare?.result.data?.data || [];
  const resultAnswer = latestRound?.answer
    ? normalizeMessage(latestRound.answer)
    : applicationShare?.result
      ? [
          applicationShare.result.summary ||
            applicationShare.result.explanation ||
            'No response content.',
          applicationShare.result.sql
            ? `\n\`\`\`vis-db-chart\n${JSON.stringify(
                {
                  title: applicationShare.result.project.displayName,
                  describe: 'Data product result',
                  type: 'table',
                  sql: applicationShare.result.sql,
                  data: (applicationShare.result.data?.data || []).map(
                    (row) => {
                      const record: Record<string, unknown> = {};
                      (applicationShare.result.data?.columns || []).forEach(
                        (column, index) => {
                          record[column.name || `column_${index + 1}`] =
                            row[index];
                        },
                      );
                      return record;
                    },
                  ),
                },
                null,
                2,
              )}\n\`\`\``
            : '',
        ]
          .filter(Boolean)
          .join('\n')
      : '';

  const copyLink = async () => {
    try {
      await copyToClipboard(window.location.href);
      message.success('Share link copied.');
    } catch {
      message.error('Unable to copy share link.');
    }
  };

  return (
    <ConstructLayout
      activeKey="applications"
      icon={<AppstoreOutlined />}
      title={app?.app_name || 'Shared Application Result'}
      description={app?.app_describe || resultQuestion}
      loading={(loading && !conversation && !applicationShare) || appLoading}
      actions={
        <>
          <Button
            icon={<LeftOutlined />}
            onClick={() => router.push(Path.Applications)}
          >
            Applications
          </Button>
          <Button icon={<CopyOutlined />} onClick={copyLink}>
            Copy link
          </Button>
        </>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="Share link is unavailable"
          description={error}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={loadShare}>
              Retry
            </Button>
          }
        />
      ) : (
        <Spin spinning={loading}>
          <ReplayShell>
            <ResultPanel>
              <HeroMeta>
                {app && (
                  <>
                    <Tag color={isAppPublished(app) ? 'green' : 'orange'}>
                      {isAppPublished(app) ? 'Published app' : 'App draft'}
                    </Tag>
                    <Tag>{getAppChatMode(app)}</Tag>
                    <Tag>{getAppActionHint(app)}</Tag>
                  </>
                )}
                <Tag icon={<CheckCircleOutlined />} color="blue">
                  {applicationShare
                    ? 'Shared data product result'
                    : 'Shared result'}
                </Tag>
              </HeroMeta>
              <QuestionPanel>
                <Text className="gray-7 d-block">Question</Text>
                <Title level={4} className="mb-0 mt-1">
                  {resultQuestion}
                </Title>
              </QuestionPanel>
              {resultAnswer ? (
                <AnswerPanel>
                  <DbgptRuntimeContent content={resultAnswer} />
                </AnswerPanel>
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  message="No answer found"
                  description="The share token exists, but no application answer was returned."
                />
              )}
              {messages.length > 0 && (
                <Collapse className="mt-4" bordered={false}>
                  <Collapse.Panel header="Conversation trace" key="trace">
                    <Timeline>
                      {messages.map((item, index) => {
                        const roleLabel = isHumanMessage(item)
                          ? 'User'
                          : 'Application';
                        return (
                          <Timeline.Item
                            key={`${item.role}-${item.order || index}`}
                            color={isHumanMessage(item) ? 'blue' : 'green'}
                          >
                            <MessageBlock $role={item.role}>
                              <MessageMeta>
                                <Text strong>{roleLabel}</Text>
                                <Tag>{item.role}</Tag>
                              </MessageMeta>
                              <DbgptRuntimeContent
                                content={normalizeMessage(item)}
                              />
                            </MessageBlock>
                          </Timeline.Item>
                        );
                      })}
                    </Timeline>
                  </Collapse.Panel>
                </Collapse>
              )}
            </ResultPanel>
            <SidePanel>
              <SideCard>
                <Title level={5} className="mb-0">
                  Application
                </Title>
                {app ? (
                  <>
                    <div className="mt-3">
                      <Text className="gray-7 d-block">Name</Text>
                      <Text>{app.app_name}</Text>
                    </div>
                    <div className="mt-3">
                      <Text className="gray-7 d-block">Configuration</Text>
                      {getAppConfigurationSummary(app).map((item) => (
                        <Tag className="mt-1" key={item.label}>
                          {item.label}: {item.value}
                        </Tag>
                      ))}
                    </div>
                  </>
                ) : (
                  <Paragraph className="gray-7 mt-3 mb-0">
                    App metadata is not attached to this shared link.
                  </Paragraph>
                )}
              </SideCard>
              <SideCard>
                <Title level={5} className="mb-0">
                  Result details
                </Title>
                <div className="mt-3">
                  <DetailRow>
                    <Text className="gray-7">Status</Text>
                    <DetailValue>
                      <Tag color={resultAnswer ? 'green' : 'gold'}>
                        {resultAnswer ? 'Answered' : 'No answer'}
                      </Tag>
                    </DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <Text className="gray-7">Rows</Text>
                    <DetailValue>
                      <Tag>
                        {applicationShare ? resultRows.length : messages.length}
                      </Tag>
                    </DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <Text className="gray-7">Columns</Text>
                    <DetailValue>
                      {resultColumns.length
                        ? resultColumns.map((column) => (
                            <Tag key={column.name}>{column.name}</Tag>
                          ))
                        : 'Not available'}
                    </DetailValue>
                  </DetailRow>
                </div>
              </SideCard>
              <SideCard>
                <Title level={5} className="mb-0">
                  Share
                </Title>
                <div className="mt-3">
                  <DetailRow>
                    <Text className="gray-7">Thread</Text>
                    <DetailValue>
                      <Text copyable>
                        {applicationShare?.result.threadId ||
                          conversation?.conv_uid ||
                          'unset'}
                      </Text>
                    </DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <Text className="gray-7">Token</Text>
                    <DetailValue>
                      <Text copyable>{token || 'unset'}</Text>
                    </DetailValue>
                  </DetailRow>
                  <DetailRow>
                    <Text className="gray-7">
                      {applicationShare ? 'History' : 'Messages'}
                    </Text>
                    <DetailValue>
                      {applicationShare?.apiHistoryId || messages.length}
                    </DetailValue>
                  </DetailRow>
                  {applicationShare && (
                    <DetailRow>
                      <Text className="gray-7">Product</Text>
                      <DetailValue>
                        {applicationShare.result.project.displayName}
                        <Tag className="ml-2">
                          {applicationShare.result.project.type}
                        </Tag>
                      </DetailValue>
                    </DetailRow>
                  )}
                </div>
              </SideCard>
            </SidePanel>
          </ReplayShell>
        </Spin>
      )}
    </ConstructLayout>
  );
}
