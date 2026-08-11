import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Input,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import ForkOutlined from '@ant-design/icons/ForkOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import styled from 'styled-components';
import DbgptRuntimeContent from '@/components/applications/DbgptRuntimeContent';
import SimpleLayout from '@/components/layouts/SimpleLayout';
import { DbgptDialogue, DbgptFlow, fetchDbgpt } from '@/lib/dbgpt';
import { readDbgptStreamResponse } from '@/lib/dbgptRuntime';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;

type RuntimeMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const Page = styled.div`
  min-height: calc(100vh - 56px);
  overflow: auto;
  background: #f7f9fc;
`;

const Inner = styled.div`
  width: min(1280px, calc(100% - 48px));
  margin: 0 auto;
  padding: 22px 0 56px;

  @media (max-width: 760px) {
    width: calc(100% - 28px);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
`;

const HeaderTitle = styled.div`
  display: flex;
  gap: 12px;
  min-width: 0;
`;

const FlowIcon = styled.div`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.16);
`;

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
`;

const Workspace = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 16px;
  align-items: start;

  @media (max-width: 1080px) {
    grid-template-columns: 1fr;
  }
`;

const ChatPanel = styled.div`
  min-height: calc(100vh - 196px);
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
  overflow: hidden;
`;

const ChatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.94);
`;

const ChatBody = styled.div`
  height: calc(100vh - 360px);
  min-height: 380px;
  padding: 18px;
  overflow: auto;
  background: #f8fafc;
`;

const Composer = styled.div`
  padding: 14px 16px 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.94);
  background: #fff;
`;

const MessageRow = styled.div<{ $role: RuntimeMessage['role'] }>`
  display: flex;
  justify-content: ${(props) =>
    props.$role === 'user' ? 'flex-end' : 'flex-start'};
  margin-bottom: 12px;
`;

const Bubble = styled.div<{ $role: RuntimeMessage['role'] }>`
  max-width: 88%;
  padding: 10px 12px;
  border: 1px solid
    ${(props) =>
      props.$role === 'user'
        ? 'rgba(40, 103, 245, 0.26)'
        : 'rgba(226, 232, 240, 0.96)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$role === 'user' ? 'rgba(40, 103, 245, 0.08)' : '#fff'};
  color: #111827;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
`;

const EmptyState = styled.div`
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  color: #64748b;
  text-align: center;
`;

const SidePanel = styled.div`
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const SummaryItem = styled.div`
  padding: 9px 0;
  border-top: 1px solid rgba(226, 232, 240, 0.82);

  &:first-of-type {
    border-top: 0;
    padding-top: 0;
  }
`;

const CodeBlock = styled.pre`
  max-height: 260px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
`;

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

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

const getStatusColor = (state?: string) => {
  if (state === 'deployed' || state === 'running') return 'green';
  if (state === 'load_failed') return 'red';
  return 'blue';
};

export default function WorkflowRunPage() {
  const router = useRouter();
  const flowId = getQueryValue(router.query.flowId) || '';
  const initialDialogueId = getQueryValue(router.query.id) || '';
  const [flow, setFlow] = useState<DbgptFlow | null>(null);
  const [convUid, setConvUid] = useState(initialDialogueId);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<RuntimeMessage[]>([]);

  useEffect(() => {
    setConvUid(initialDialogueId);
  }, [initialDialogueId]);

  useEffect(() => {
    if (!router.isReady || !flowId) return;
    setLoading(true);
    setError('');
    fetchDbgpt<DbgptFlow>(
      `/api/v2/serve/awel/flows/${encodeURIComponent(flowId)}`,
    )
      .then(setFlow)
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Unable to load workflow.',
        );
      })
      .finally(() => setLoading(false));
  }, [flowId, router.isReady]);

  const payloadPreview = useMemo(
    () =>
      JSON.stringify(
        {
          conv_uid: convUid || '<dialogue_id>',
          chat_mode: 'chat_flow',
          select_param: flowId,
          user_input: 'Ask this workflow',
        },
        null,
        2,
      ),
    [convUid, flowId],
  );

  const ensureDialogue = async () => {
    if (convUid) return convUid;
    const dialogue = await fetchDbgpt<DbgptDialogue>(
      '/api/v1/chat/dialogue/new?chat_mode=chat_agent',
      {
        method: 'POST',
        body: JSON.stringify({ chat_mode: 'chat_agent' }),
      },
    );
    setConvUid(dialogue.conv_uid);
    router.replace(
      {
        pathname: `${Path.Workflow}/run/[flowId]`,
        query: { flowId, id: dialogue.conv_uid },
      },
      undefined,
      { shallow: true },
    );
    return dialogue.conv_uid;
  };

  const send = async () => {
    const input = question.trim();
    if (!input || !flow || running) return;
    setRunning(true);
    setQuestion('');
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-user`, role: 'user', content: input },
    ]);
    try {
      const dialogueId = await ensureDialogue();
      const response = await fetch('/api/dbgpt/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conv_uid: dialogueId,
          chat_mode: 'chat_flow',
          select_param: flow.uid,
          user_input: input,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Workflow chat failed with HTTP ${response.status}`);
      }
      const answer = await readDbgptStreamResponse(response);
      setMessages((current) => [
        ...current,
        { id: `${Date.now()}-assistant`, role: 'assistant', content: answer },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          content: err instanceof Error ? err.message : 'Workflow chat failed.',
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const copyPayload = async () => {
    try {
      await copyToClipboard(payloadPreview);
      message.success('Payload copied.');
    } catch {
      message.error('Unable to copy payload.');
    }
  };

  return (
    <SimpleLayout loading={loading} checkOnboarding={false}>
      <Page>
        <Inner>
        <Header>
          <HeaderTitle>
            <FlowIcon>
              <ForkOutlined />
            </FlowIcon>
            <div style={{ minWidth: 0 }}>
              <Title level={3} className="mb-0">
                {flow?.label || flow?.name || 'Workflow'}
              </Title>
              <Paragraph className="gray-7 mb-0 mt-1">
                {flow?.description ||
                  'Run this DB-GPT AWEL flow through chat_flow.'}
              </Paragraph>
              {flow && (
                <MetaRow>
                  {flow.source && <Tag>{flow.source}</Tag>}
                  {flow.define_type && <Tag color="purple">{flow.define_type}</Tag>}
                  <Tag color={getStatusColor(flow.state)}>{flow.state || 'unknown'}</Tag>
                </MetaRow>
              )}
            </div>
          </HeaderTitle>
          <Actions>
            <Button
              icon={<LeftOutlined />}
              onClick={() => router.push(Path.Workflow)}
            >
              Workflow
            </Button>
            {flow && (
              <Button
                onClick={() =>
                  router.push(
                    `${Path.Workflow}/canvas?id=${encodeURIComponent(flow.uid)}`,
                  )
                }
              >
                Edit
              </Button>
            )}
          </Actions>
        </Header>

        {error ? (
          <Alert
            type="error"
            showIcon
            message="Workflow could not be opened"
            description={error}
            action={<Button onClick={() => router.push(Path.Workflow)}>Back</Button>}
          />
        ) : (
          <Spin spinning={loading}>
            {flow && (
              <Workspace>
                <ChatPanel>
                  <ChatHeader>
                    <div>
                      <Title level={5} className="mb-0">
                        Chat flow
                      </Title>
                      <Text className="gray-7">
                        DB-GPT receives chat_mode=chat_flow and select_param={flow.uid}.
                      </Text>
                    </div>
                    <Tag color="green">{convUid ? 'Dialogue active' : 'Ready'}</Tag>
                  </ChatHeader>
                  <ChatBody>
                    {messages.length ? (
                      messages.map((item) => (
                        <MessageRow key={item.id} $role={item.role}>
                          <Bubble $role={item.role}>
                            <DbgptRuntimeContent content={item.content} />
                          </Bubble>
                        </MessageRow>
                      ))
                    ) : (
                      <EmptyState>
                        <div>
                          <Title level={5}>Ask this workflow</Title>
                          <Paragraph className="gray-7 mb-0">
                            The request is sent to DB-GPT chat completions with
                            this flow uid as the selected runtime parameter.
                          </Paragraph>
                        </div>
                      </EmptyState>
                    )}
                  </ChatBody>
                  <Composer>
                    <Input.TextArea
                      value={question}
                      disabled={running}
                      placeholder="Ask this workflow"
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      onChange={(event) => setQuestion(event.target.value)}
                      onPressEnter={(event) => {
                        if (!event.shiftKey) {
                          event.preventDefault();
                          send();
                        }
                      }}
                    />
                    <div className="d-flex justify-space-between align-center mt-3">
                      <Text className="gray-7 text-sm">
                        {convUid ? `Conversation ${convUid}` : 'New conversation'}
                      </Text>
                      <Button
                        type="primary"
                        icon={<SendOutlined />}
                        disabled={!question.trim()}
                        loading={running}
                        onClick={send}
                      >
                        Send
                      </Button>
                    </div>
                  </Composer>
                </ChatPanel>

                <SidePanel>
                  <Title level={5} className="mb-0">
                    Runtime
                  </Title>
                  <Paragraph className="gray-7 mt-1 mb-3">
                    Mirrors DB-GPT flow chat invocation without routing to the
                    missing DB-GPT /chat page.
                  </Paragraph>
                  <SummaryItem>
                    <Text className="gray-7 text-sm">Dialogue endpoint</Text>
                    <div>
                      <Text copyable>/api/v1/chat/dialogue/new?chat_mode=chat_agent</Text>
                    </div>
                  </SummaryItem>
                  <SummaryItem>
                    <Text className="gray-7 text-sm">Ask endpoint</Text>
                    <div>
                      <Text copyable>/api/v1/chat/completions</Text>
                    </div>
                  </SummaryItem>
                  <SummaryItem>
                    <Text className="gray-7 text-sm">select_param</Text>
                    <div>
                      <Text strong>{flow.uid}</Text>
                    </div>
                  </SummaryItem>
                  <div className="d-flex justify-space-between align-center mt-3 mb-2">
                    <Text className="gray-7 text-sm">Payload</Text>
                    <Button size="small" icon={<CopyOutlined />} onClick={copyPayload}>
                      Copy
                    </Button>
                  </div>
                  <CodeBlock>{payloadPreview}</CodeBlock>
                </SidePanel>
              </Workspace>
            )}
          </Spin>
        )}
        </Inner>
      </Page>
    </SimpleLayout>
  );
}
