import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Button,
  Dropdown,
  Form,
  Input,
  Menu,
  Modal,
  Pagination,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EllipsisOutlined from '@ant-design/icons/EllipsisOutlined';
import ForkOutlined from '@ant-design/icons/ForkOutlined';
import MessageOutlined from '@ant-design/icons/MessageOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import {
  ConstructCard,
  ConstructEmpty,
  ConstructGrid,
  ConstructLayout,
  ConstructToolbar,
  StatusTag,
} from '@/components/construct/ConstructLayout';
import {
  DbgptDialogue,
  DbgptFlow,
  DbgptFlowPayload,
  DbgptFlowResponse,
  fetchDbgpt,
} from '@/lib/dbgpt';
import { Path } from '@/utils/enum';

const { Text } = Typography;
const PAGE_SIZE = 12;

type CopyFlowFormValues = {
  name: string;
  label: string;
  editable: boolean;
  deploy: boolean;
};

const getFlowEditorPath = (flow: DbgptFlow) => {
  if (flow.define_type === 'python') {
    return `${Path.Workflow}/libro?id=${encodeURIComponent(flow.uid)}`;
  }
  return `${Path.Workflow}/canvas?id=${encodeURIComponent(flow.uid)}`;
};

export default function Workflow() {
  const router = useRouter();
  const [copyForm] = Form.useForm<CopyFlowFormValues>();
  const [flows, setFlows] = useState<DbgptFlow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState<DbgptFlow | null>(null);

  const loadFlows = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbgpt<DbgptFlowResponse>(
        `/api/v2/serve/awel/flows?page=${nextPage}&page_size=${PAGE_SIZE}`,
      );
      setFlows(data?.items || []);
      setTotal(data?.total_count || 0);
      setPage(data?.page || nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load flows.');
      setFlows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlows(1);
  }, []);

  const startFlowChat = async (flow: DbgptFlow) => {
    setActionLoading(`chat:${flow.uid}`);
    try {
      const dialogue = await fetchDbgpt<DbgptDialogue>(
        '/api/v1/chat/dialogue/new?chat_mode=chat_agent',
        {
          method: 'POST',
          body: JSON.stringify({ chat_mode: 'chat_agent' }),
        },
      );
      router.push({
        pathname: `${Path.Workflow}/run/[flowId]`,
        query: {
          flowId: flow.uid,
          id: dialogue.conv_uid,
        },
      });
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Unable to start flow chat.',
      );
    } finally {
      setActionLoading('');
    }
  };

  const deleteFlow = async (flow: DbgptFlow) => {
    setActionLoading(`delete:${flow.uid}`);
    try {
      await fetchDbgpt(`/api/v2/serve/awel/flows/${flow.uid}`, {
        method: 'DELETE',
      });
      message.success('Flow deleted.');
      await loadFlows(page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Unable to delete flow.');
    } finally {
      setActionLoading('');
    }
  };

  const openCopyFlow = (flow: DbgptFlow) => {
    setCopySource(flow);
    copyForm.setFieldsValue({
      label: `${flow.label || flow.name} Copy`,
      name: `${flow.name}_copy`,
      editable: true,
      deploy: false,
    });
    setCopyOpen(true);
  };

  const copyFlow = async (values: CopyFlowFormValues) => {
    if (!copySource) return;
    setActionLoading(`copy:${copySource.uid}`);
    try {
      const payload: DbgptFlowPayload = {
        name: values.name,
        label: values.label,
        description: copySource.description || '',
        editable: values.editable,
        state: values.deploy ? 'deployed' : 'developing',
        flow_data: copySource.flow_data,
        variables: copySource.variables,
      };
      await fetchDbgpt<DbgptFlow>('/api/v2/serve/awel/flows', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      message.success('Flow copied.');
      setCopyOpen(false);
      setCopySource(null);
      await loadFlows(1);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Unable to copy flow.');
    } finally {
      setActionLoading('');
    }
  };

  const renderFlowMenu = (flow: DbgptFlow) => (
    <Menu
      onClick={(info) => {
        info.domEvent.stopPropagation();
        if (info.key === 'copy') openCopyFlow(flow);
        if (info.key === 'delete') {
          Modal.confirm({
            title: 'Delete flow',
            content: `Delete "${flow.label || flow.name}"? This action cannot be undone.`,
            okText: 'Delete',
            okButtonProps: { danger: true },
            cancelText: 'Cancel',
            onOk: () => deleteFlow(flow),
          });
        }
      }}
    >
      <Menu.Item key="copy" icon={<CopyOutlined />}>
        Copy
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="delete" danger icon={<DeleteOutlined />}>
        Delete
      </Menu.Item>
    </Menu>
  );

  return (
    <ConstructLayout
      activeKey="workflow"
      icon={<ForkOutlined />}
      title="Workflow"
      description="Create and operate DB-GPT AWEL workflows. Flows are loaded from DB-GPT, edited in the canvas, copied, deleted, and invoked through chat_flow."
      loading={loading && flows.length === 0}
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push(Path.Workflow + '/canvas')}
        >
          Create flow
        </Button>
      }
    >
      <ConstructToolbar
        left={<Tag>{total} flows</Tag>}
        right={<Button onClick={() => loadFlows(page)}>Refresh</Button>}
      />

      <Spin spinning={loading}>
        {error ? (
          <ConstructEmpty
            title="DB-GPT workflow service is unavailable"
            description={error}
            action={<Button onClick={() => loadFlows(1)}>Retry</Button>}
          />
        ) : flows.length === 0 ? (
          <ConstructEmpty
            title="No workflow found"
            description="Create an AWEL flow before composing database, knowledge, and tools. This page does not show sample workflows."
            action={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push(Path.Workflow + '/canvas')}
              >
                Create flow
              </Button>
            }
          />
        ) : (
          <>
            <ConstructGrid>
              {flows.map((flow) => (
                <ConstructCard
                  key={flow.uid}
                  icon={<ForkOutlined />}
                  title={flow.label || flow.name}
                  onClick={() => router.push(getFlowEditorPath(flow))}
                  tags={
                    <>
                      {flow.source && (
                        <Tag color={flow.source === 'DBGPT-WEB' ? 'green' : 'blue'}>
                          {flow.source}
                        </Tag>
                      )}
                      {flow.define_type && <Tag color="purple">{flow.define_type}</Tag>}
                      <Tag>{flow.editable ? 'Editable' : 'Read only'}</Tag>
                      <StatusTag status={flow.state} />
                    </>
                  }
                  description={flow.description || 'No description.'}
                  footer={
                    <>
                      <span>
                        {flow.nick_name || 'owner unset'}
                        {flow.gmt_modified ? ` · ${flow.gmt_modified}` : ''}
                      </span>
                      <span>
                        <Button
                          size="small"
                          type="primary"
                          icon={<MessageOutlined />}
                          loading={actionLoading === `chat:${flow.uid}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            startFlowChat(flow);
                          }}
                        >
                          Chat
                        </Button>
                        <Dropdown overlay={renderFlowMenu(flow)} trigger={['click']}>
                          <Button
                            size="small"
                            className="ml-2"
                            icon={<EllipsisOutlined />}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </Dropdown>
                      </span>
                    </>
                  }
                />
              ))}
            </ConstructGrid>
            <div className="d-flex justify-end mt-4">
              <Pagination
                current={page}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={(nextPage) => loadFlows(nextPage)}
              />
            </div>
          </>
        )}
      </Spin>

      <div className="mt-4">
        <Text className="gray-7 text-sm">
          Workflow actions call DB-GPT directly. The chat entry creates a
          chat_agent dialogue, then the VeADK run page invokes DB-GPT with
          chat_mode=chat_flow and the flow uid as select_param.
        </Text>
      </div>

      <Modal
        visible={copyOpen}
        title="Copy AWEL flow"
        destroyOnClose
        confirmLoading={copySource ? actionLoading === `copy:${copySource.uid}` : false}
        onCancel={() => {
          setCopyOpen(false);
          setCopySource(null);
        }}
        onOk={() => copyForm.submit()}
      >
        <Form form={copyForm} layout="vertical" onFinish={copyFlow}>
          <Form.Item
            label="Name"
            name="name"
            rules={[
              { required: true, message: 'Enter a flow name.' },
              {
                pattern: /^[a-zA-Z0-9_-]+$/,
                message: 'Can only contain numbers, letters, underscores, and dashes.',
              },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Label"
            name="label"
            rules={[{ required: true, message: 'Enter a flow label.' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Editable" name="editable" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="Deploy after copy" name="deploy" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </ConstructLayout>
  );
}
