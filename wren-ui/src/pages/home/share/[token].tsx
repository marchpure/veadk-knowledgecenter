import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Collapse,
  Empty,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import CodeOutlined from '@ant-design/icons/CodeOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import styled from 'styled-components';
import MarkdownBlock from '@/components/editor/MarkdownBlock';
import { ConstructLayout } from '@/components/construct/ConstructLayout';
import { useSharedThreadResponseQuery } from '@/apollo/client/graphql/home.generated';
import {
  ChartTaskStatus,
  ThreadResponseAnswerStatus,
} from '@/apollo/client/graphql/__types__';
import { usePreviewDataMutation } from '@/apollo/client/graphql/home.generated';
import PreviewData from '@/components/dataPreview/PreviewData';
import { Path } from '@/utils/enum';

const SQLCodeBlock = dynamic(() => import('@/components/code/SQLCodeBlock'), {
  ssr: false,
});
const Chart = dynamic(() => import('@/components/chart'), {
  ssr: false,
});

const { Paragraph, Text, Title } = Typography;

const ShareShell = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const MainPanel = styled.div`
  min-height: calc(100vh - 220px);
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
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

const QuestionPanel = styled.div`
  padding: 14px 16px;
  margin-bottom: 16px;
  border: 1px solid rgba(40, 103, 245, 0.22);
  border-radius: 8px;
  background: rgba(40, 103, 245, 0.05);
`;

const AnswerPanel = styled.div`
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const SqlPanel = styled.div`
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const SqlHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.94);
  background: #f8fafc;
`;

const ChartPanel = styled.div`
  margin-top: 16px;
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px;
    border: 1px solid rgba(226, 232, 240, 0.94);
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #f8fafc;
    color: #475569;
    font-weight: 600;
  }
`;

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isAnswerFinished = (status?: ThreadResponseAnswerStatus | null) =>
  status === ThreadResponseAnswerStatus.FINISHED;

const isChartFinished = (status?: ChartTaskStatus | null) =>
  status === ChartTaskStatus.FINISHED;

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

export default function HomeSharePage() {
  const router = useRouter();
  const token = getQueryValue(router.query.token);
  const { data, loading, error, refetch } = useSharedThreadResponseQuery({
    variables: { token: token || '' },
    skip: !router.isReady || !token,
  });
  const [previewData, previewDataResult] = usePreviewDataMutation({
    onError: (previewError) => {
      message.error(previewError.message || 'Unable to preview result data.');
    },
  });
  const share = data?.sharedThreadResponse;
  const response = share?.response;
  const answer = response?.answerDetail;
  const chart = response?.chartDetail;
  const chartSpec = chart?.chartSchema;
  const chartValues = useMemo(() => {
    const values = chartSpec?.data?.values;
    return Array.isArray(values) ? values : [];
  }, [chartSpec]);

  const copiedUrl = () =>
    typeof window === 'undefined' ? '' : window.location.href;

  const onCopyLink = async () => {
    try {
      await copyToClipboard(copiedUrl());
      message.success('Share link copied.');
    } catch {
      message.error('Unable to copy share link.');
    }
  };

  const onPreviewData = async () => {
    if (!response?.id) return;
    await previewData({
      variables: { where: { responseId: response.id, limit: 500 } },
    });
  };

  return (
    <ConstructLayout
      activeKey="home"
      icon={<CheckCircleOutlined />}
      title="Shared GenBI Answer"
      description={
        response?.question ||
        'A shared WrenAI GenBI answer with SQL, answer, and chart context.'
      }
      loading={loading && !share}
      actions={
        <>
          <Button
            icon={<LeftOutlined />}
            onClick={() => router.push(Path.Home)}
          >
            Home
          </Button>
          <Button icon={<CopyOutlined />} onClick={onCopyLink}>
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
          description={error.message}
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : (
        <Spin spinning={loading}>
          <ShareShell>
            <MainPanel>
              {response ? (
                <>
                  <QuestionPanel>
                    <Text className="gray-7 d-block">
                      <MessageOutlined className="mr-2" />
                      Question
                    </Text>
                    <Title level={4} className="mb-0 mt-2">
                      {response.question}
                    </Title>
                  </QuestionPanel>

                  {isAnswerFinished(answer?.status) && answer?.content ? (
                    <AnswerPanel>
                      <Text className="gray-7 d-block mb-2">Answer</Text>
                      <MarkdownBlock content={answer.content} />
                    </AnswerPanel>
                  ) : (
                    <Alert
                      type="info"
                      showIcon
                      message="Answer is not finished"
                      description={`Current answer status: ${answer?.status || 'not started'}`}
                    />
                  )}

                  {response.sql && (
                    <SqlPanel>
                      <SqlHeader>
                        <Text strong>
                          <CodeOutlined className="mr-2" />
                          Wren SQL
                        </Text>
                        <div className="d-flex align-center gx-2">
                          <Button
                            size="small"
                            loading={previewDataResult.loading}
                            onClick={onPreviewData}
                          >
                            View results
                          </Button>
                          <Text copyable={{ text: response.sql }} />
                        </div>
                      </SqlHeader>
                      <SQLCodeBlock
                        code={response.sql}
                        showLineNumbers
                        maxHeight="360"
                        copyable
                      />
                      {previewDataResult.data?.previewData && (
                        <div style={{ padding: 12 }}>
                          <PreviewData
                            loading={previewDataResult.loading}
                            error={previewDataResult.error}
                            previewData={previewDataResult.data.previewData}
                            locale={{
                              emptyText: (
                                <Empty description="No rows returned." />
                              ),
                            }}
                          />
                          <div className="text-right mt-2">
                            <Text className="gray-7 text-sm">
                              Showing up to 500 rows
                            </Text>
                          </div>
                        </div>
                      )}
                    </SqlPanel>
                  )}

                  {isChartFinished(chart?.status) && chartSpec && (
                    <ChartPanel>
                      <Text className="gray-7 d-block mb-2">
                        <BarChartOutlined className="mr-2" />
                        Chart
                      </Text>
                      {chart.description && (
                        <Paragraph className="gray-7">
                          {chart.description}
                        </Paragraph>
                      )}
                      {chartValues.length ? (
                        <Chart
                          width="100%"
                          spec={chartSpec}
                          values={chartValues}
                          hideActions
                        />
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="Chart schema is available, but no inline data was saved with it."
                        />
                      )}
                    </ChartPanel>
                  )}

                  {response.breakdownDetail?.steps?.length ? (
                    <Collapse className="mt-4" bordered={false}>
                      <Collapse.Panel header="Reasoning and SQL steps" key="1">
                        <DataTable>
                          <thead>
                            <tr>
                              <th>Step</th>
                              <th>Summary</th>
                              <th>SQL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {response.breakdownDetail.steps.map(
                              (step, index) => (
                                <tr key={`${step.cteName || 'step'}-${index}`}>
                                  <td>{step.cteName || index + 1}</td>
                                  <td>{step.summary}</td>
                                  <td>
                                    <Text code>{step.sql}</Text>
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </DataTable>
                      </Collapse.Panel>
                    </Collapse>
                  ) : null}
                </>
              ) : (
                <Empty description="Shared answer was not found." />
              )}
            </MainPanel>

            <SidePanel>
              <SideCard>
                <Title level={5} className="mb-0">
                  Result
                </Title>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Answer</Text>
                  <Tag
                    color={isAnswerFinished(answer?.status) ? 'green' : 'gold'}
                  >
                    {answer?.status || 'not started'}
                  </Tag>
                </div>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Chart</Text>
                  <Tag
                    color={isChartFinished(chart?.status) ? 'green' : 'default'}
                  >
                    {chart?.status || 'not generated'}
                  </Tag>
                </div>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Rows used in answer</Text>
                  <Tag>{answer?.numRowsUsedInLLM ?? 0}</Tag>
                </div>
              </SideCard>

              <SideCard>
                <Title level={5} className="mb-0">
                  Share
                </Title>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Token</Text>
                  <Text copyable>{token || 'unset'}</Text>
                </div>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Response ID</Text>
                  <Text>{share?.responseId || 'unset'}</Text>
                </div>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Thread ID</Text>
                  <Text>{share?.threadId || 'unset'}</Text>
                </div>
              </SideCard>

              <SideCard>
                <Title level={5} className="mb-0">
                  Source
                </Title>
                <div className="mt-3">
                  <Text className="gray-7 d-block">SQL</Text>
                  <Tag icon={<DatabaseOutlined />}>
                    {response?.sql ? 'available' : 'not available'}
                  </Tag>
                </div>
                <div className="mt-3">
                  <Text className="gray-7 d-block">Trace ID</Text>
                  <Text copyable>
                    {response?.askingTask?.traceId ||
                      response?.adjustmentTask?.traceId ||
                      'unset'}
                  </Text>
                </div>
              </SideCard>
            </SidePanel>
          </ShareShell>
        </Spin>
      )}
    </ConstructLayout>
  );
}
