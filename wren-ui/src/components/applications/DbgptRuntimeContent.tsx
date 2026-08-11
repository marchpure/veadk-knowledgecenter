import { Alert, Collapse, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import styled from 'styled-components';
import MarkdownBlock from '@/components/editor/MarkdownBlock';

const { Paragraph, Text } = Typography;

type DbgptVisDbChart = {
  sql?: string;
  type?: string;
  title?: string;
  describe?: string;
  data?: Array<Record<string, unknown>>;
};

type RuntimePart =
  | { kind: 'markdown'; content: string }
  | { kind: 'vis-db-chart'; content: string };

type KnowledgeReference = {
  source?: string;
  document?: string;
  chunk?: string;
  relevance?: string;
  content?: string;
  metadata?: unknown;
};

type ToolCall = {
  connector?: string;
  toolName?: string;
  arguments?: unknown;
  result?: unknown;
  error?: unknown;
};

type WorkflowEvent = {
  nodeName?: string;
  nodeId?: string;
  status?: string;
  event?: string;
  input?: unknown;
  output?: unknown;
};

type WorkflowPayload = {
  workflowName?: string;
  workflowUid?: string;
  events: WorkflowEvent[];
};

const ChartFrame = styled.div`
  margin: 8px 0;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 8px;
  background: #fff;

  .ant-table {
    font-size: 12px;
  }
`;

const StructuredFrame = styled.div`
  margin: 10px 0;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 8px;
  background: #fff;
`;

const StructuredCard = styled.div`
  margin-top: 10px;
  padding: 12px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 8px;
  background: #f8fafc;
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const DetailItem = styled.div`
  min-width: 0;
`;

const SqlBlock = styled.pre`
  max-height: 320px;
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

const normalizeCell = (value: unknown) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const withStableRowKeys = (rows: Array<Record<string, unknown>>) =>
  rows.map((row, index) => ({
    ...row,
    __runtimeRowKey: index,
  }));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const stringifyValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const getStringField = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
  }
  return undefined;
};

const parseJsonContent = (content?: string) => {
  const trimmed = content?.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const walkPayload = (
  value: unknown,
  visitor: (item: unknown, key?: string) => void,
  key?: string,
  depth = 0,
) => {
  if (depth > 6) return;
  visitor(value, key);
  if (Array.isArray(value)) {
    value.forEach((item) => walkPayload(item, visitor, key, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  Object.entries(value).forEach(([childKey, childValue]) =>
    walkPayload(childValue, visitor, childKey, depth + 1),
  );
};

const uniqueByJson = <T,>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = stringifyValue(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const knowledgeArrayKeys = new Set([
  'references',
  'citations',
  'sources',
  'source_documents',
  'documents',
  'docs',
  'chunks',
  'retrieved_chunks',
  'retrieved_documents',
  'contexts',
]);

const mapKnowledgeReference = (
  candidate: unknown,
): KnowledgeReference | null => {
  if (!isRecord(candidate)) return null;
  const source = getStringField(candidate, [
    'source',
    'source_name',
    'sourceName',
    'url',
    'uri',
    'file',
    'file_name',
    'doc_name',
    'document_name',
    'title',
  ]);
  const document = getStringField(candidate, [
    'document',
    'document_id',
    'documentId',
    'doc_id',
    'docId',
    'doc_name',
    'document_name',
  ]);
  const chunk = getStringField(candidate, [
    'chunk',
    'chunk_id',
    'chunkId',
    'id',
    'index',
  ]);
  const relevance = getStringField(candidate, [
    'relevance',
    'score',
    'recall_score',
    'similarity',
    'rank',
  ]);
  const content = getStringField(candidate, [
    'content',
    'text',
    'chunk_content',
    'page_content',
    'snippet',
    'summary',
  ]);
  const metadata =
    candidate.metadata || candidate.meta || candidate.meta_info || undefined;

  if (!source && !document && !chunk && !relevance && !content && !metadata) {
    return null;
  }
  return { source, document, chunk, relevance, content, metadata };
};

const collectKnowledgeReferences = (payload: unknown) => {
  const references: KnowledgeReference[] = [];
  walkPayload(payload, (item, key) => {
    if (Array.isArray(item) && key && knowledgeArrayKeys.has(key)) {
      item.forEach((entry) => {
        const mapped = mapKnowledgeReference(entry);
        if (mapped) references.push(mapped);
      });
      return;
    }
    if (isRecord(item)) {
      const mapped = mapKnowledgeReference(item);
      if (
        mapped &&
        (mapped.source ||
          mapped.document ||
          mapped.chunk ||
          mapped.relevance ||
          mapped.metadata)
      ) {
        references.push(mapped);
      }
    }
  });
  return uniqueByJson(references).slice(0, 12);
};

const collectToolCalls = (payload: unknown) => {
  const calls: ToolCall[] = [];
  walkPayload(payload, (item) => {
    if (!isRecord(item)) return;
    const hasToolHint = [
      'tool_name',
      'toolName',
      'tool',
      'tool_input',
      'tool_result',
      'arguments',
      'args',
      'connector',
      'connector_id',
      'connectorId',
    ].some((key) => key in item);
    if (!hasToolHint) return;
    const toolName =
      getStringField(item, ['tool_name', 'toolName', 'tool', 'name']) ||
      (isRecord(item.function)
        ? getStringField(item.function, ['name'])
        : undefined);
    const connector = getStringField(item, [
      'connector',
      'connector_id',
      'connectorId',
      'server',
      'server_uri',
      'serverUri',
    ]);
    calls.push({
      connector,
      toolName,
      arguments:
        item.arguments ||
        item.args ||
        item.tool_input ||
        item.input ||
        (isRecord(item.function) ? item.function.arguments : undefined),
      result:
        item.result ||
        item.tool_result ||
        item.output ||
        item.observation ||
        item.response,
      error: item.error || item.exception,
    });
  });
  return uniqueByJson(calls).slice(0, 12);
};

const workflowArrayKeys = new Set([
  'events',
  'timeline',
  'nodes',
  'node_events',
  'nodeEvents',
  'steps',
]);

const mapWorkflowEvent = (candidate: unknown): WorkflowEvent | null => {
  if (!isRecord(candidate)) return null;
  const nodeName = getStringField(candidate, [
    'node_name',
    'nodeName',
    'name',
    'label',
    'title',
  ]);
  const nodeId = getStringField(candidate, ['node_id', 'nodeId', 'id', 'uid']);
  const status = getStringField(candidate, ['status', 'state', 'phase']);
  const event = getStringField(candidate, ['event', 'type', 'kind']);
  const input = candidate.input || candidate.inputs || candidate.parameters;
  const output =
    candidate.output ||
    candidate.outputs ||
    candidate.result ||
    candidate.response;
  if (!nodeName && !nodeId && !status && !event && !input && !output) {
    return null;
  }
  return { nodeName, nodeId, status, event, input, output };
};

const collectWorkflowPayload = (payload: unknown): WorkflowPayload => {
  const root = isRecord(payload) ? payload : {};
  const events: WorkflowEvent[] = [];
  walkPayload(payload, (item, key) => {
    if (!Array.isArray(item) || !key || !workflowArrayKeys.has(key)) return;
    item.forEach((entry) => {
      const mapped = mapWorkflowEvent(entry);
      if (mapped) events.push(mapped);
    });
  });
  return {
    workflowName: getStringField(root, [
      'workflow_name',
      'workflowName',
      'flow_name',
      'flowName',
      'name',
      'label',
    ]),
    workflowUid: getStringField(root, [
      'workflow_uid',
      'workflowUid',
      'flow_uid',
      'flowUid',
      'uid',
      'flow_id',
      'flowId',
      'id',
    ]),
    events: uniqueByJson(events).slice(0, 24),
  };
};

const getReadablePayloadText = (payload: unknown) => {
  if (typeof payload === 'string') return payload;
  if (!isRecord(payload)) return '';
  return (
    getStringField(payload, [
      'answer',
      'final_answer',
      'finalAnswer',
      'content',
      'text',
      'message',
      'response',
      'summary',
      'result_text',
      'resultText',
    ]) || ''
  );
};

const splitRuntimeContent = (content: string): RuntimePart[] => {
  const parts: RuntimePart[] = [];
  const pattern = /```vis-db-chart\s*\n([\s\S]*?)\n```/g;
  let cursor = 0;
  let matched: RegExpExecArray | null;

  while ((matched = pattern.exec(content)) !== null) {
    const before = content.slice(cursor, matched.index).trim();
    if (before) parts.push({ kind: 'markdown', content: before });
    parts.push({ kind: 'vis-db-chart', content: matched[1] });
    cursor = matched.index + matched[0].length;
  }

  const after = content.slice(cursor).trim();
  if (after) parts.push({ kind: 'markdown', content: after });
  return parts.length ? parts : [{ kind: 'markdown', content }];
};

function RuntimeDetails({ payload }: { payload: unknown }) {
  return (
    <Collapse className="mt-3" bordered={false}>
      <Collapse.Panel header="Runtime details" key="runtime-details">
        <SqlBlock>{stringifyValue(payload)}</SqlBlock>
      </Collapse.Panel>
    </Collapse>
  );
}

function RuntimeDbChart({ raw }: { raw: string }) {
  let chart: DbgptVisDbChart;
  try {
    chart = JSON.parse(raw) as DbgptVisDbChart;
  } catch {
    return (
      <Alert
        type="warning"
        showIcon
        message="Unable to render DB-GPT result"
        description={<SqlBlock>{raw}</SqlBlock>}
      />
    );
  }

  const rows = Array.isArray(chart.data) ? chart.data : [];
  const keyedRows = withStableRowKeys(rows);
  const columns = rows[0]
    ? Object.keys(rows[0]).map((key) => ({
        title: key,
        dataIndex: key,
        key,
        render: normalizeCell,
      }))
    : [];
  const { data: _data, ...chartContract } = chart;
  return (
    <ChartFrame data-testid="runtime-db-chart">
      {chart.title && (
        <Text strong className="d-block mb-1">
          {chart.title}
        </Text>
      )}
      {chart.describe && (
        <Paragraph className="gray-7 mb-2">{chart.describe}</Paragraph>
      )}
      <Text className="gray-7 d-block mb-1">Chart contract</Text>
      <SqlBlock data-testid="runtime-chart-contract">
        {JSON.stringify(chartContract, null, 2)}
      </SqlBlock>
      <Tabs defaultActiveKey="data" size="small">
        <Tabs.TabPane tab="Data" key="data">
          {rows.length ? (
            <Table
              size="small"
              rowKey="__runtimeRowKey"
              dataSource={keyedRows}
              columns={columns}
              pagination={rows.length > 20 ? { pageSize: 20 } : false}
              scroll={{ x: true }}
            />
          ) : (
            <Alert type="info" showIcon message="DB-GPT returned no rows." />
          )}
        </Tabs.TabPane>
        <Tabs.TabPane tab="SQL" key="sql">
          <SqlBlock>{chart.sql || 'No SQL returned.'}</SqlBlock>
        </Tabs.TabPane>
        <Tabs.TabPane tab="Chart contract" key="chart">
          <SqlBlock>{JSON.stringify(chartContract, null, 2)}</SqlBlock>
        </Tabs.TabPane>
      </Tabs>
    </ChartFrame>
  );
}

function KnowledgeReferences({
  references,
}: {
  references: KnowledgeReference[];
}) {
  if (!references.length) return null;
  return (
    <StructuredFrame data-testid="runtime-knowledge-result">
      <div className="d-flex justify-space-between align-center">
        <Text strong>Knowledge references</Text>
        <Tag>{references.length}</Tag>
      </div>
      {references.map((reference, index) => (
        <StructuredCard key={`${reference.source || 'source'}-${index}`}>
          <DetailGrid>
            <DetailItem>
              <Text className="gray-7 d-block">Source</Text>
              <Text>{reference.source || 'Not provided'}</Text>
            </DetailItem>
            <DetailItem>
              <Text className="gray-7 d-block">Document / chunk</Text>
              <Text>
                {[reference.document, reference.chunk]
                  .filter(Boolean)
                  .join(' / ') || 'Not provided'}
              </Text>
            </DetailItem>
            <DetailItem>
              <Text className="gray-7 d-block">Relevance</Text>
              <Text>{reference.relevance || 'Not provided'}</Text>
            </DetailItem>
          </DetailGrid>
          {reference.content && (
            <Paragraph className="mt-3 mb-0">{reference.content}</Paragraph>
          )}
          {reference.metadata !== undefined && (
            <RuntimeDetails payload={reference.metadata} />
          )}
        </StructuredCard>
      ))}
    </StructuredFrame>
  );
}

function ToolCalls({ calls }: { calls: ToolCall[] }) {
  if (!calls.length) return null;
  return (
    <StructuredFrame data-testid="runtime-tool-result">
      <div className="d-flex justify-space-between align-center">
        <Text strong>Tool calls</Text>
        <Tag>{calls.length}</Tag>
      </div>
      {calls.map((call, index) => (
        <StructuredCard key={`${call.toolName || 'tool'}-${index}`}>
          <DetailGrid>
            <DetailItem>
              <Text className="gray-7 d-block">Connector</Text>
              <Text>{call.connector || 'Not provided'}</Text>
            </DetailItem>
            <DetailItem>
              <Text className="gray-7 d-block">Tool name</Text>
              <Text>{call.toolName || 'Unknown tool'}</Text>
            </DetailItem>
          </DetailGrid>
          {call.arguments !== undefined && (
            <>
              <Text className="gray-7 d-block mt-3">Arguments</Text>
              <SqlBlock>{stringifyValue(call.arguments)}</SqlBlock>
            </>
          )}
          {call.error !== undefined ? (
            <Alert
              className="mt-3"
              type="error"
              showIcon
              message="Tool error"
              description={<SqlBlock>{stringifyValue(call.error)}</SqlBlock>}
            />
          ) : call.result !== undefined ? (
            <>
              <Text className="gray-7 d-block mt-3">Result</Text>
              <SqlBlock>{stringifyValue(call.result)}</SqlBlock>
            </>
          ) : null}
        </StructuredCard>
      ))}
    </StructuredFrame>
  );
}

function WorkflowTimeline({ workflow }: { workflow: WorkflowPayload }) {
  if (
    !workflow.workflowName &&
    !workflow.workflowUid &&
    !workflow.events.length
  ) {
    return null;
  }
  return (
    <StructuredFrame data-testid="runtime-workflow-result">
      <div className="d-flex justify-space-between align-center mb-3">
        <div>
          <Text strong>Workflow events</Text>
          <div>
            <Text className="gray-7 text-sm">
              {workflow.workflowName || 'Workflow name unavailable'}
              {workflow.workflowUid ? ` / ${workflow.workflowUid}` : ''}
            </Text>
          </div>
        </div>
        <Tag>{workflow.events.length}</Tag>
      </div>
      {workflow.events.length ? (
        <Timeline>
          {workflow.events.map((event, index) => (
            <Timeline.Item key={`${event.nodeId || event.nodeName}-${index}`}>
              <StructuredCard>
                <div className="d-flex justify-space-between gap-2">
                  <Text strong>
                    {event.nodeName || event.nodeId || 'Workflow node'}
                  </Text>
                  <Tag>{event.status || event.event || 'event'}</Tag>
                </div>
                {event.nodeId && (
                  <Text className="gray-7 text-sm d-block">{event.nodeId}</Text>
                )}
                {event.input !== undefined && (
                  <>
                    <Text className="gray-7 d-block mt-3">Input</Text>
                    <SqlBlock>{stringifyValue(event.input)}</SqlBlock>
                  </>
                )}
                {event.output !== undefined && (
                  <>
                    <Text className="gray-7 d-block mt-3">Output</Text>
                    <SqlBlock>{stringifyValue(event.output)}</SqlBlock>
                  </>
                )}
              </StructuredCard>
            </Timeline.Item>
          ))}
        </Timeline>
      ) : (
        <Alert
          type="info"
          showIcon
          message="No structured workflow events were returned."
          description="The workflow completed without node-level timeline data."
        />
      )}
    </StructuredFrame>
  );
}

function StructuredPayload({ payload }: { payload: unknown }) {
  const readableText = getReadablePayloadText(payload);
  const references = collectKnowledgeReferences(payload);
  const toolCalls = collectToolCalls(payload);
  const workflow = collectWorkflowPayload(payload);
  const hasStructured =
    references.length ||
    toolCalls.length ||
    workflow.workflowName ||
    workflow.workflowUid ||
    workflow.events.length;

  return (
    <>
      {readableText && <MarkdownBlock content={readableText} />}
      <KnowledgeReferences references={references} />
      <ToolCalls calls={toolCalls} />
      <WorkflowTimeline workflow={workflow} />
      <RuntimeDetails payload={payload} />
      {!hasStructured && !readableText && (
        <Alert
          className="mt-3"
          type="info"
          showIcon
          message="Runtime returned an unsupported structured payload."
          description="Open Runtime details for the original response."
        />
      )}
    </>
  );
}

export default function DbgptRuntimeContent({
  content = '',
  payload,
}: {
  content?: string;
  payload?: unknown;
}) {
  const parsedContent =
    payload === undefined ? parseJsonContent(content) : undefined;
  const structuredPayload = payload !== undefined ? payload : parsedContent;

  if (structuredPayload !== undefined) {
    return (
      <>
        {content.trim() && parsedContent === undefined && (
          <MarkdownBlock content={content} />
        )}
        <StructuredPayload payload={structuredPayload} />
      </>
    );
  }

  return (
    <>
      {splitRuntimeContent(content).map((part, index) =>
        part.kind === 'vis-db-chart' ? (
          <RuntimeDbChart key={`chart-${index}`} raw={part.content} />
        ) : (
          <MarkdownBlock key={`markdown-${index}`} content={part.content} />
        ),
      )}
    </>
  );
}
