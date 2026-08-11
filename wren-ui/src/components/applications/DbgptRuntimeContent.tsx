import { Alert, Table, Tabs, Typography } from 'antd';
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
  return (
    <ChartFrame>
      {chart.title && (
        <Text strong className="d-block mb-1">
          {chart.title}
        </Text>
      )}
      {chart.describe && (
        <Paragraph className="gray-7 mb-2">{chart.describe}</Paragraph>
      )}
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
      </Tabs>
    </ChartFrame>
  );
}

export default function DbgptRuntimeContent({ content }: { content: string }) {
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
