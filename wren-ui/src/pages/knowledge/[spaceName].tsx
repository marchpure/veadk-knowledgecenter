import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import CloudUploadOutlined from '@ant-design/icons/CloudUploadOutlined';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import NodeIndexOutlined from '@ant-design/icons/NodeIndexOutlined';
import PartitionOutlined from '@ant-design/icons/PartitionOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import styled from 'styled-components';
import {
  ConstructEmpty,
  ConstructLayout,
  ConstructSection,
} from '@/components/construct/ConstructLayout';
import {
  DbgptChunkStrategy,
  DbgptKnowledgeChunk,
  DbgptKnowledgeChunkResponse,
  DbgptKnowledgeDocument,
  DbgptKnowledgeDocumentResponse,
  DbgptKnowledgeSpace,
  DbgptKnowledgeStats,
  DbgptKnowledgeSyncResponse,
  DbgptRecallChunk,
  fetchDbgpt,
} from '@/lib/dbgpt';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;
const { Dragger } = Upload;

const PAGE_SIZE = 12;

type RecallFormValues = {
  question: string;
  recall_top_k?: number;
  recall_score_threshold?: number;
  recall_retrievers?: string[];
};

const MetricPanel = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
`;

const MetricCard = styled.div`
  padding: 16px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const ChunkGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
`;

const ChunkCard = styled.div`
  min-height: 180px;
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const ChunkContent = styled.div`
  margin-top: 10px;
  color: #334155;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow: auto;
`;

const UploadBody = styled.div`
  .ant-upload.ant-upload-drag {
    background: #f8fafc;
    border-color: rgba(148, 163, 184, 0.6);
    border-radius: 8px;
  }
`;

const MetricLabel = styled.div`
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
`;

const MetricValue = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #111827;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
`;

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getDocumentStatusColor = (status?: string) => {
  if (!status) return 'default';
  const normalized = status.toLowerCase();
  if (normalized === 'finished') return 'green';
  if (normalized === 'running' || normalized === 'todo') return 'blue';
  if (normalized === 'failed') return 'red';
  return 'default';
};

const summarizeMeta = (value?: string) => {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

export default function KnowledgeDetail() {
  const router = useRouter();
  const spaceName = getQueryValue(router.query.spaceName) || '';
  const [space, setSpace] = useState<DbgptKnowledgeSpace | null>(null);
  const [stats, setStats] = useState<DbgptKnowledgeStats | null>(null);
  const [documents, setDocuments] = useState<DbgptKnowledgeDocument[]>([]);
  const [documentPage, setDocumentPage] = useState(1);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [selectedDocument, setSelectedDocument] =
    useState<DbgptKnowledgeDocument | null>(null);
  const [chunks, setChunks] = useState<DbgptKnowledgeChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [strategies, setStrategies] = useState<DbgptChunkStrategy[]>([]);
  const [recallRetrievers, setRecallRetrievers] = useState<string[]>([]);
  const [recallResults, setRecallResults] = useState<DbgptRecallChunk[]>([]);
  const [loading, setLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [recalling, setRecalling] = useState(false);
  const [error, setError] = useState('');

  const defaultStrategy = useMemo(() => {
    return (
      strategies.find((strategy) => strategy.strategy === 'Automatic')
        ?.strategy ||
      strategies[0]?.strategy ||
      'Automatic'
    );
  }, [strategies]);
  const documentCount =
    stats?.document_count ?? documentTotal ?? Number(space?.docs || 0);

  const loadSpace = useCallback(async () => {
    if (!spaceName) return;
    setLoading(true);
    setError('');
    try {
      const spaces = await fetchDbgpt<DbgptKnowledgeSpace[]>(
        '/api/v1/knowledge/space/list',
        {
          method: 'POST',
          body: JSON.stringify({ name: spaceName }),
        },
      );
      const currentSpace =
        (spaces || []).find((item) => item.name === spaceName) || spaces?.[0];
      setSpace(currentSpace || null);
      if (currentSpace?.id) {
        const statData = await fetchDbgpt<DbgptKnowledgeStats>(
          `/api/v2/serve/knowledge/${currentSpace.id}/stats`,
        ).catch(() => null);
        setStats(statData);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load this knowledge space.',
      );
    } finally {
      setLoading(false);
    }
  }, [spaceName]);

  const loadDocuments = useCallback(
    async (nextPage = documentPage) => {
      if (!spaceName) return;
      setDocumentsLoading(true);
      try {
        const data = await fetchDbgpt<DbgptKnowledgeDocumentResponse>(
          `/api/v1/knowledge/${encodeURIComponent(spaceName)}/document/list`,
          {
            method: 'POST',
            body: JSON.stringify({
              page: nextPage,
              page_size: PAGE_SIZE,
            }),
          },
        );
        setDocuments(data?.data || []);
        setDocumentPage(data?.page || nextPage);
        setDocumentTotal(data?.total || 0);
      } catch (err) {
        message.error(
          err instanceof Error ? err.message : 'Unable to load documents.',
        );
        setDocuments([]);
        setDocumentTotal(0);
      } finally {
        setDocumentsLoading(false);
      }
    },
    [documentPage, spaceName],
  );

  const loadCatalog = useCallback(async () => {
    if (!spaceName) return;
    const [strategyData, retrievers] = await Promise.all([
      fetchDbgpt<DbgptChunkStrategy[]>(
        '/api/v1/knowledge/document/chunkstrategies',
      ).catch(() => []),
      fetchDbgpt<string[]>(
        `/api/v1/knowledge/${encodeURIComponent(spaceName)}/recall_retrievers`,
      ).catch(() => []),
    ]);
    setStrategies(strategyData || []);
    setRecallRetrievers(retrievers || []);
  }, [spaceName]);

  useEffect(() => {
    loadSpace();
    loadDocuments(1);
    loadCatalog();
  }, [loadCatalog, loadDocuments, loadSpace]);

  const refreshAll = async () => {
    await Promise.all([loadSpace(), loadDocuments(documentPage)]);
  };

  const loadChunks = async (document: DbgptKnowledgeDocument) => {
    setSelectedDocument(document);
    setChunksLoading(true);
    try {
      const data = await fetchDbgpt<DbgptKnowledgeChunkResponse>(
        `/api/v1/knowledge/${encodeURIComponent(spaceName)}/chunk/list`,
        {
          method: 'POST',
          body: JSON.stringify({
            document_id: String(document.id),
            page: 1,
            page_size: 50,
          }),
        },
      );
      setChunks(data?.data || []);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Unable to load chunks.',
      );
      setChunks([]);
    } finally {
      setChunksLoading(false);
    }
  };

  const uploadAndSync = async () => {
    const files = fileList
      .map((item) => item.originFileObj)
      .filter(Boolean) as File[];
    if (!files.length) {
      message.warning('Select one or more documents.');
      return;
    }
    setUploading(true);
    try {
      const uploaded: Array<{ name: string; doc_id: number }> = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('doc_name', file.name);
        formData.append('doc_file', file);
        formData.append('doc_type', 'DOCUMENT');
        const response = await fetch(
          `/api/dbgpt/api/v1/knowledge/${encodeURIComponent(
            spaceName,
          )}/document/upload`,
          {
            method: 'POST',
            body: formData,
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            payload?.error ||
              payload?.err_msg ||
              `Upload failed for ${file.name}`,
          );
        }
        const docId = payload?.data ?? payload;
        if (!Number.isInteger(docId)) {
          throw new Error(
            `Upload did not return a document id for ${file.name}`,
          );
        }
        uploaded.push({ name: file.name, doc_id: docId });
      }

      if (uploaded.length) {
        await fetchDbgpt<DbgptKnowledgeSyncResponse>(
          `/api/v1/knowledge/${encodeURIComponent(spaceName)}/document/sync_batch`,
          {
            method: 'POST',
            body: JSON.stringify(
              uploaded.map((item) => ({
                doc_id: item.doc_id,
                name: item.name,
                chunk_parameters: { chunk_strategy: defaultStrategy },
              })),
            ),
          },
        );
      }
      message.success('Documents uploaded and segmentation started.');
      setUploadOpen(false);
      setFileList([]);
      await refreshAll();
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const runRecallTest = async (values: RecallFormValues) => {
    setRecalling(true);
    try {
      const data = await fetchDbgpt<DbgptRecallChunk[]>(
        `/api/v1/knowledge/${encodeURIComponent(spaceName)}/recall_test`,
        {
          method: 'POST',
          body: JSON.stringify({
            recall_top_k: values.recall_top_k || 3,
            recall_score_threshold: values.recall_score_threshold,
            recall_retrievers: values.recall_retrievers?.length
              ? values.recall_retrievers
              : recallRetrievers,
            question: values.question,
          }),
        },
      );
      setRecallResults(data || []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Recall test failed.');
      setRecallResults([]);
    } finally {
      setRecalling(false);
    }
  };

  const columns: ColumnsType<DbgptKnowledgeDocument> = [
    {
      title: 'Document',
      dataIndex: 'doc_name',
      render: (value, record) => (
        <Button type="link" className="p-0" onClick={() => loadChunks(record)}>
          {value}
        </Button>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'doc_type',
      width: 120,
      render: (value) => <Tag>{value || 'DOCUMENT'}</Tag>,
    },
    {
      title: 'Chunks',
      dataIndex: 'chunk_size',
      width: 100,
      render: (value) => value ?? 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (value) => (
        <Tag color={getDocumentStatusColor(value)}>{value || 'UNKNOWN'}</Tag>
      ),
    },
    {
      title: 'Updated',
      dataIndex: 'gmt_modified',
      width: 220,
      render: (value) => value || '-',
    },
  ];

  return (
    <ConstructLayout
      activeKey="knowledge"
      icon={<PartitionOutlined />}
      title={spaceName || 'Knowledge detail'}
      description="Manage DB-GPT knowledge documents, segmentation, chunks, and recall testing inside VeADK."
      loading={loading && !space}
      actions={
        <>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push(Path.Knowledge)}
          >
            Back
          </Button>
          <Button icon={<ReloadOutlined />} onClick={refreshAll}>
            Refresh
          </Button>
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => setUploadOpen(true)}
          >
            Upload
          </Button>
        </>
      }
    >
      {error ? (
        <ConstructEmpty
          title="Knowledge space could not be opened"
          description={error}
          action={<Button onClick={refreshAll}>Retry</Button>}
        />
      ) : (
        <>
          <MetricPanel>
            <MetricCard>
              <MetricLabel>Documents</MetricLabel>
              <MetricValue>
                <FileTextOutlined />
                <span>{documentCount}</span>
              </MetricValue>
            </MetricCard>
            <MetricCard>
              <MetricLabel>Chunks</MetricLabel>
              <MetricValue>
                <PartitionOutlined />
                <span>{stats?.chunk_count ?? 0}</span>
              </MetricValue>
            </MetricCard>
            <MetricCard>
              <MetricLabel>Graph nodes</MetricLabel>
              <MetricValue>
                <NodeIndexOutlined />
                <span>{stats?.graph_vertex_count ?? 0}</span>
              </MetricValue>
            </MetricCard>
            <MetricCard>
              <MetricLabel>Sync</MetricLabel>
              <MetricValue>
                <span>{stats?.sync_status || 'READY'}</span>
              </MetricValue>
            </MetricCard>
          </MetricPanel>

          <ConstructSection
            title={space?.name || spaceName}
            description={space?.desc || stats?.desc || 'DB-GPT knowledge space'}
            action={
              <Space wrap>
                {space?.domain_type && <Tag>{space.domain_type}</Tag>}
                {space?.vector_type && (
                  <Tag color="blue">{space.vector_type}</Tag>
                )}
                {(space?.index_methods || stats?.index_methods || [])?.map(
                  (method) => (
                    <Tag color="purple" key={method}>
                      {method}
                    </Tag>
                  ),
                )}
              </Space>
            }
          >
            <Tabs defaultActiveKey="documents">
              <Tabs.TabPane
                tab={
                  <span>
                    <FileTextOutlined /> Documents
                  </span>
                }
                key="documents"
              >
                <Table
                  rowKey="id"
                  size="middle"
                  loading={documentsLoading}
                  columns={columns}
                  dataSource={documents}
                  pagination={{
                    current: documentPage,
                    pageSize: PAGE_SIZE,
                    total: documentTotal,
                    onChange: loadDocuments,
                  }}
                  locale={{
                    emptyText: (
                      <ConstructEmpty
                        title="No documents"
                        description="Upload documents to start segmentation and retrieval."
                        action={
                          <Button
                            type="primary"
                            icon={<CloudUploadOutlined />}
                            onClick={() => setUploadOpen(true)}
                          >
                            Upload
                          </Button>
                        }
                      />
                    ),
                  }}
                />
              </Tabs.TabPane>
              <Tabs.TabPane
                tab={
                  <span>
                    <PartitionOutlined /> Chunks
                  </span>
                }
                key="chunks"
              >
                {!selectedDocument ? (
                  <Alert
                    type="info"
                    showIcon
                    message="Select a document to inspect its chunks."
                  />
                ) : (
                  <Spin spinning={chunksLoading}>
                    <div className="mb-3">
                      <Title level={5} className="mb-0">
                        {selectedDocument.doc_name}
                      </Title>
                      <Text className="gray-7">
                        {chunks.length} chunks loaded from DB-GPT.
                      </Text>
                    </div>
                    {chunks.length ? (
                      <ChunkGrid>
                        {chunks.map((chunk, index) => (
                          <ChunkCard key={chunk.id || index}>
                            <Space wrap>
                              <Tag color="blue">#{index + 1}</Tag>
                              {chunk.recall_score != null && (
                                <Tag>score {chunk.recall_score}</Tag>
                              )}
                            </Space>
                            <ChunkContent>{chunk.content}</ChunkContent>
                            {chunk.meta_info && (
                              <Paragraph
                                className="gray-7 text-sm mt-3 mb-0"
                                ellipsis={{ rows: 4, expandable: true }}
                              >
                                {summarizeMeta(chunk.meta_info)}
                              </Paragraph>
                            )}
                          </ChunkCard>
                        ))}
                      </ChunkGrid>
                    ) : (
                      <ConstructEmpty
                        title="No chunks"
                        description="The document may still be syncing, or segmentation has not generated chunks yet."
                      />
                    )}
                  </Spin>
                )}
              </Tabs.TabPane>
              <Tabs.TabPane
                tab={
                  <span>
                    <SearchOutlined /> Recall test
                  </span>
                }
                key="recall"
              >
                <Row gutter={[16, 16]}>
                  <Col xs={24} lg={10}>
                    <Form
                      layout="vertical"
                      initialValues={{
                        recall_top_k: 3,
                        recall_retrievers: recallRetrievers,
                      }}
                      onFinish={runRecallTest}
                    >
                      <Form.Item
                        label="Question"
                        name="question"
                        rules={[
                          {
                            required: true,
                            message: 'Enter a recall test question.',
                          },
                        ]}
                      >
                        <Input.TextArea
                          autoSize={{ minRows: 3, maxRows: 7 }}
                          placeholder="Ask a question to test retrieval"
                        />
                      </Form.Item>
                      <Form.Item label="Top K" name="recall_top_k">
                        <Input type="number" min={1} max={20} />
                      </Form.Item>
                      <Form.Item
                        label="Score threshold"
                        name="recall_score_threshold"
                      >
                        <Input type="number" step={0.1} />
                      </Form.Item>
                      <Form.Item label="Retrievers" name="recall_retrievers">
                        <Select
                          mode="multiple"
                          allowClear
                          options={recallRetrievers.map((item) => ({
                            label: item,
                            value: item,
                          }))}
                        />
                      </Form.Item>
                      <Button
                        type="primary"
                        htmlType="submit"
                        loading={recalling}
                        icon={<SearchOutlined />}
                      >
                        Run recall test
                      </Button>
                    </Form>
                  </Col>
                  <Col xs={24} lg={14}>
                    <Spin spinning={recalling}>
                      {recallResults.length ? (
                        <ChunkGrid>
                          {recallResults.map((chunk) => (
                            <ChunkCard key={chunk.chunk_id}>
                              <Space wrap>
                                <Tag color="blue">#{chunk.chunk_id}</Tag>
                                <Tag>score {chunk.score}</Tag>
                                {typeof chunk.metadata?.source === 'string' && (
                                  <Tag>{chunk.metadata.source}</Tag>
                                )}
                              </Space>
                              <ChunkContent>{chunk.content}</ChunkContent>
                            </ChunkCard>
                          ))}
                        </ChunkGrid>
                      ) : (
                        <ConstructEmpty
                          title="No recall results"
                          description="Run a recall test against the current knowledge space."
                        />
                      )}
                    </Spin>
                  </Col>
                </Row>
              </Tabs.TabPane>
            </Tabs>
          </ConstructSection>
        </>
      )}

      <Modal
        title="Upload documents"
        visible={uploadOpen}
        destroyOnClose
        width={760}
        confirmLoading={uploading}
        okText="Upload and sync"
        onCancel={() => {
          setUploadOpen(false);
          setFileList([]);
        }}
        onOk={uploadAndSync}
      >
        <UploadBody>
          <Dragger
            multiple
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: nextFileList }) => setFileList(nextFileList)}
            accept=".pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.txt,.md,.zip,.csv"
          >
            <p className="ant-upload-drag-icon">
              <CloudUploadOutlined />
            </p>
            <p className="ant-upload-text">Select or drop files</p>
            <p className="ant-upload-hint">
              PDF, PowerPoint, Excel, Word, Text, Markdown, Zip, and CSV.
            </p>
          </Dragger>
          <Alert
            className="mt-3"
            type="info"
            showIcon
            message={`Chunk strategy: ${defaultStrategy}`}
            description="After upload, VeADK starts DB-GPT sync_batch so the documents are segmented and indexed."
          />
        </UploadBody>
      </Modal>
    </ConstructLayout>
  );
}
