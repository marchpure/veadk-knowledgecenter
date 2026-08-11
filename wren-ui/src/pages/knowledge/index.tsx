import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Button,
  Space,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { debounce } from 'lodash';
import FileTextOutlined from '@ant-design/icons/FileTextOutlined';
import NodeIndexOutlined from '@ant-design/icons/NodeIndexOutlined';
import PartitionOutlined from '@ant-design/icons/PartitionOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReadOutlined from '@ant-design/icons/ReadOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';
import ClockCircleOutlined from '@ant-design/icons/ClockCircleOutlined';
import RightOutlined from '@ant-design/icons/RightOutlined';
import {
  ConstructCard,
  ConstructEmpty,
  ConstructGrid,
  ConstructLayout,
  ConstructToolbar,
} from '@/components/construct/ConstructLayout';
import {
  DbgptKnowledgeSpace,
  DbgptKnowledgeStats,
  fetchDbgpt,
} from '@/lib/dbgpt';

const { Text } = Typography;
const { Option } = Select;

type SpaceFormValues = {
  name: string;
  owner: string;
  desc?: string;
  vector_type: string;
  domain_type: string;
  index_methods?: string[];
};

const indexMethodLabels: Record<string, string> = {
  VectorStore: 'Vector store',
  FullText: 'Full text',
  KnowledgeGraph: 'Knowledge graph',
};

const formatDate = (value?: string) => {
  if (!value) return 'Not updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const getIndexStatus = (stats?: DbgptKnowledgeStats) => {
  if (!stats?.sync_status && !stats?.graph_build_status) return 'Ready';
  return stats.sync_status || stats.graph_build_status || 'Ready';
};

const getSpaceLogo = (space: DbgptKnowledgeSpace) => {
  if (space.domain_type === 'FinancialReport') return <FileTextOutlined />;
  if (space.vector_type === 'KnowledgeGraph') return <NodeIndexOutlined />;
  return <PartitionOutlined />;
};

export default function Knowledge() {
  const router = useRouter();
  const [form] = Form.useForm<SpaceFormValues>();
  const [spaces, setSpaces] = useState<DbgptKnowledgeSpace[]>([]);
  const [stats, setStats] = useState<Record<string, DbgptKnowledgeStats>>({});
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadSpaces = async (params?: { name?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbgpt<DbgptKnowledgeSpace[]>(
        '/api/v1/knowledge/space/list',
        {
          method: 'POST',
          body: JSON.stringify(params || {}),
        },
      );
      setSpaces(data || []);
      const statEntries = await Promise.all(
        (data || []).map(async (space) => {
          try {
            const value = await fetchDbgpt<DbgptKnowledgeStats>(
              `/api/v2/serve/knowledge/${space.id}/stats`,
            );
            return [space.name, value] as const;
          } catch {
            return [space.name, {}] as const;
          }
        }),
      );
      setStats(Object.fromEntries(statEntries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load spaces.');
      setSpaces([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSpaces();
  }, []);

  const onSearch = useMemo(
    () =>
      debounce((value: string) => {
        loadSpaces(value ? { name: value } : undefined);
      }, 300),
    [],
  );

  const handleCreate = async (values: SpaceFormValues) => {
    setSubmitting(true);
    try {
      await fetchDbgpt('/api/v1/knowledge/space/add', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          owner: values.owner,
          desc: values.desc || '',
          vector_type: values.vector_type,
          domain_type: values.domain_type,
          index_methods: values.index_methods?.length
            ? values.index_methods
            : [values.vector_type],
        }),
      });
      message.success('Knowledge space created.');
      setModalOpen(false);
      form.resetFields();
      await loadSpaces();
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : 'Failed to create knowledge space.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConstructLayout
      activeKey="knowledge"
      icon={<PartitionOutlined />}
      title="Knowledge"
      description="Knowledge follows DB-GPT's knowledge space flow: create a space, attach sources, parse and segment documents, build indexes, then open the space detail."
      loading={loading && spaces.length === 0}
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          Create knowledge
        </Button>
      }
    >
      <ConstructToolbar
        left={
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search knowledge spaces"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              onSearch(event.target.value);
            }}
            style={{ width: 280 }}
          />
        }
        right={<Tag>{spaces.length} spaces</Tag>}
      />

      <Spin spinning={loading}>
        {error ? (
          <ConstructEmpty
            title="DB-GPT knowledge service is unavailable"
            description={error}
            action={<Button onClick={() => loadSpaces()}>Retry</Button>}
          />
        ) : spaces.length === 0 ? (
          <ConstructEmpty
            title="No knowledge spaces"
            description="Create a knowledge space before uploading sources or configuring retrieval."
            action={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setModalOpen(true)}
              >
                Create knowledge
              </Button>
            }
          />
        ) : (
          <ConstructGrid>
            {spaces.map((space) => {
              const spaceStats = stats[space.name] || {};
              const documentCount =
                spaceStats.document_count ?? Number(space.docs || 0);
              const indexStatus = getIndexStatus(spaceStats);
              return (
                <ConstructCard
                  key={space.id}
                  icon={getSpaceLogo(space)}
                  title={space.name}
                  onClick={() =>
                    router.push(
                      `/knowledge/${encodeURIComponent(String(space.name))}`,
                    )
                  }
                  tags={
                    <>
                      <Tag icon={<ReadOutlined />}>{documentCount} docs</Tag>
                      <Tag color={indexStatus === 'Ready' ? 'green' : 'blue'}>
                        {indexStatus}
                      </Tag>
                      <Tag color="blue">
                        {spaceStats.vector_type ||
                          space.vector_type ||
                          'Vector store'}
                      </Tag>
                    </>
                  }
                  description={space.desc || 'No description.'}
                  footer={
                    <>
                      <Space size={[6, 6]} wrap>
                        {(space.index_methods || [])
                          .slice(0, 2)
                          .map((method) => (
                            <Tag color="purple" key={method}>
                              {indexMethodLabels[method] || method}
                            </Tag>
                          ))}
                        {spaceStats.graph_vertex_count != null && (
                          <Tag icon={<NodeIndexOutlined />} color="geekblue">
                            {spaceStats.graph_vertex_count}
                          </Tag>
                        )}
                        {spaceStats.graph_edge_count != null && (
                          <Tag icon={<ShareAltOutlined />} color="geekblue">
                            {spaceStats.graph_edge_count}
                          </Tag>
                        )}
                        <Tag icon={<ClockCircleOutlined />}>
                          {formatDate(space.gmt_modified)}
                        </Tag>
                      </Space>
                      <Button
                        size="small"
                        type="link"
                        icon={<RightOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(
                            `/knowledge/${encodeURIComponent(String(space.name))}`,
                          );
                        }}
                      >
                        Open
                      </Button>
                    </>
                  }
                />
              );
            })}
          </ConstructGrid>
        )}
      </Spin>

      <Modal
        title="New knowledge space"
        visible={modalOpen}
        destroyOnClose
        confirmLoading={submitting}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        width={760}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            owner: 'WrenAI',
            vector_type: 'VectorStore',
            domain_type: 'Normal',
            index_methods: ['VectorStore', 'FullText'],
          }}
          onFinish={handleCreate}
        >
          <Form.Item
            label="Space name"
            name="name"
            rules={[{ required: true, message: 'Please input a space name.' }]}
          >
            <Input placeholder="customer_support_policy" />
          </Form.Item>
          <Form.Item label="Owner" name="owner" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Description" name="desc">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item
            label="Primary index"
            name="vector_type"
            rules={[{ required: true }]}
          >
            <Select>
              <Option value="VectorStore">Vector store</Option>
              <Option value="FullText">Full text</Option>
              <Option value="KnowledgeGraph">Knowledge graph</Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Index methods"
            name="index_methods"
            rules={[{ required: true }]}
          >
            <Select mode="multiple">
              <Option value="VectorStore">Vector store</Option>
              <Option value="FullText">Full text</Option>
              <Option value="KnowledgeGraph">Knowledge graph</Option>
            </Select>
          </Form.Item>
          <Form.Item label="Domain type" name="domain_type">
            <Select>
              <Option value="Normal">Normal</Option>
              <Option value="GitRepo">Git repository</Option>
              <Option value="FinancialReport">Financial report</Option>
            </Select>
          </Form.Item>
          <Text className="gray-7 text-sm">
            Source upload, parser selection, segmentation, and retrieval tuning
            are handled in the DB-GPT space detail flow.
          </Text>
        </Form>
      </Modal>
    </ConstructLayout>
  );
}
