import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Alert,
  Badge,
  Button,
  Collapse,
  Divider,
  Empty,
  Form,
  Input,
  Layout,
  Modal,
  Space,
  Spin,
  Switch,
  Tooltip,
  Typography,
  message,
  notification,
} from 'antd';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import CaretLeftOutlined from '@ant-design/icons/CaretLeftOutlined';
import CaretRightOutlined from '@ant-design/icons/CaretRightOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import ExportOutlined from '@ant-design/icons/ExportOutlined';
import FileAddOutlined from '@ant-design/icons/FileAddOutlined';
import FrownOutlined from '@ant-design/icons/FrownOutlined';
import ImportOutlined from '@ant-design/icons/ImportOutlined';
import InfoCircleOutlined from '@ant-design/icons/InfoCircleOutlined';
import SaveOutlined from '@ant-design/icons/SaveOutlined';
import styled from 'styled-components';
import ReactFlow, {
  Background,
  BaseEdge,
  Connection,
  Controls,
  EdgeProps,
  Handle,
  Node,
  NodeProps,
  Position,
  ReactFlowInstance,
  ReactFlowProvider,
  addEdge,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  DbgptFlow,
  DbgptFlowData,
  DbgptFlowNode,
  DbgptFlowNodeParameter,
  DbgptFlowNodePort,
  DbgptFlowPayload,
  fetchDbgpt,
  getUniqueFlowNodeId,
  mapFlowDataToReactFlow,
  mapReactFlowToFlowData,
} from '@/lib/dbgpt';
import { Path } from '@/utils/enum';

const { Sider } = Layout;
const { Text, Paragraph } = Typography;
const FLOW_NODE_TAGS = JSON.stringify({ order: 'higher-order' });

const CanvasFrame = styled.div`
  height: calc(100vh - 56px);
  min-height: 720px;
  overflow: hidden;
  background: #f8fafc;
`;

const CanvasHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 48px;
  padding: 8px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
`;

const NodeLibrary = styled(Sider)`
  &.ant-layout-sider {
    background: rgba(255, 255, 255, 0.88);
    border-right: 1px solid #dbe4f0;
  }
`;

const SiderInner = styled.div`
  width: 280px;
  height: 100%;
  padding: 16px;
  overflow: auto;
`;

const StaticNodeItem = styled.div`
  display: flex;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;
  cursor: grab;

  &:hover {
    background: #f1f5f9;
  }
`;

const NodeIcon = styled.div<{ $tone?: 'resource' | 'operator' }>`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  background: ${(props) =>
    props.$tone === 'resource'
      ? 'linear-gradient(135deg, #0ea5e9, #2563eb)'
      : 'linear-gradient(135deg, #7c3aed, #4f46e5)'};
`;

const FlowNodeShell = styled.div<{
  $selected?: boolean;
  $invalid?: boolean;
  $resource?: boolean;
}>`
  width: 320px;
  padding: 12px;
  border: 1px ${(props) => (props.$resource ? 'dashed' : 'solid')}
    ${(props) =>
      props.$invalid ? '#dc2626' : props.$selected ? '#2867f5' : '#cbd5e1'};
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
  cursor: grab;
`;

const FlowNodeSection = styled.div`
  margin-top: 10px;
  padding: 8px;
  border-radius: 8px;
  background: #f8fafc;
`;

const PortRow = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  min-height: 28px;
  color: #475569;
  font-size: 12px;
`;

const CanvasBody = styled.div`
  display: flex;
  height: calc(100% - 48px);
`;

const ReactFlowArea = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
`;

const zeroWidthTriggerDefaultStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 48,
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  border: '1px solid #d6d8da',
  borderRadius: 8,
  right: -8,
};

const groupNodes = (data: DbgptFlowNode[]) => {
  const groups: Array<{
    category: string;
    categoryLabel: string;
    nodes: DbgptFlowNode[];
  }> = [];
  const categoryMap: Record<
    string,
    { category: string; categoryLabel: string; nodes: DbgptFlowNode[] }
  > = {};
  data.forEach((item) => {
    const category = item.category || 'default';
    if (!categoryMap[category]) {
      categoryMap[category] = {
        category,
        categoryLabel: item.category_label || category,
        nodes: [],
      };
      groups.push(categoryMap[category]);
    }
    categoryMap[category].nodes.push(item);
  });
  return groups;
};

const removeIndexFromNodeId = (id: string) => id.replace(/_\d+$/, '');

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function StaticNodes({ nodes }: { nodes: DbgptFlowNode[] }) {
  const onDragStart = (event: DragEvent, node: DbgptFlowNode) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(node));
    event.dataTransfer.effectAllowed = 'move';
  };

  if (!nodes.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div>
      {nodes.map((node) => (
        <StaticNodeItem
          key={node.id}
          draggable
          onDragStart={(event) => onDragStart(event, node)}
        >
          <NodeIcon $tone={node.flow_type}>{node.flow_type === 'resource' ? 'R' : 'O'}</NodeIcon>
          <div style={{ minWidth: 0 }}>
            <Text strong ellipsis style={{ display: 'block' }}>
              {node.label}
            </Text>
            <Paragraph
              className="gray-7 text-sm mb-0"
              ellipsis={{ rows: 2 }}
              title={node.description}
            >
              {node.description || node.name}
            </Paragraph>
          </div>
        </StaticNodeItem>
      ))}
    </div>
  );
}

function AddNodesSider({ error }: { error?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [operators, setOperators] = useState<DbgptFlowNode[]>([]);
  const [resources, setResources] = useState<DbgptFlowNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllNodes, setShowAllNodes] = useState(false);

  const loadNodes = async (tags?: string) => {
    setLoading(true);
    try {
      const data = await fetchDbgpt<DbgptFlowNode[]>(
        `/api/v2/serve/awel/nodes${tags ? `?tags=${encodeURIComponent(tags)}` : ''}`,
      );
      setOperators((data || []).filter((node) => node.flow_type === 'operator'));
      setResources((data || []).filter((node) => node.flow_type === 'resource'));
      window.localStorage.setItem('dbgpt_flow_nodes', JSON.stringify(data || []));
    } catch (_err) {
      setOperators([]);
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes(FLOW_NODE_TAGS);
  }, []);

  const triggerStyle = useMemo(() => {
    if (collapsed) {
      return {
        ...zeroWidthTriggerDefaultStyle,
        right: -16,
        borderRadius: '0px 8px 8px 0',
        borderLeft: '1px solid #d5e5f6',
      };
    }
    return {
      ...zeroWidthTriggerDefaultStyle,
      borderLeft: '1px solid #d6d8da',
    };
  }, [collapsed]);

  const renderPanels = (
    list: DbgptFlowNode[],
    groups: ReturnType<typeof groupNodes>,
  ) => {
    const visibleGroups = searchValue
      ? groupNodes(
          list.filter((node) =>
            `${node.label} ${node.name} ${node.description}`
              .toLowerCase()
              .includes(searchValue.toLowerCase()),
          ),
        )
      : groups;
    return visibleGroups.map(({ category, categoryLabel, nodes }) => (
      <Collapse.Panel
        key={category}
        header={categoryLabel}
        extra={
          <Badge
            showZero
            count={nodes.length}
            style={{
              backgroundColor: nodes.length > 0 ? '#52c41a' : '#7f9474',
            }}
          />
        }
      >
        <StaticNodes nodes={nodes} />
      </Collapse.Panel>
    ));
  };

  const operatorGroups = useMemo(() => groupNodes(operators), [operators]);
  const resourceGroups = useMemo(() => groupNodes(resources), [resources]);

  return (
    <NodeLibrary
      width={280}
      collapsible
      collapsed={collapsed}
      collapsedWidth={0}
      trigger={
        collapsed ? (
          <CaretRightOutlined className="text-base" />
        ) : (
          <CaretLeftOutlined className="text-base" />
        )
      }
      zeroWidthTriggerStyle={triggerStyle}
      onCollapse={(value) => setCollapsed(value)}
    >
      <SiderInner>
        <div className="d-flex justify-space-between align-center mb-3">
          <Text strong>Add node</Text>
          <Switch
            size="small"
            checkedChildren="All"
            unCheckedChildren="Core"
            checked={showAllNodes}
            onChange={(value) => {
              setShowAllNodes(value);
              loadNodes(value ? undefined : FLOW_NODE_TAGS);
            }}
          />
        </div>
        <Input.Search
          allowClear
          placeholder="Search node"
          onSearch={setSearchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          className="mb-3"
        />
        {error && (
          <Alert
            className="mb-3"
            type="warning"
            showIcon
            message="Node service unavailable"
            description={error}
          />
        )}
        <Spin spinning={loading}>
          <Text strong className="mb-2 d-block">
            Operators
          </Text>
          <Collapse
            bordered={false}
            defaultActiveKey={operatorGroups[0]?.category}
          >
            {renderPanels(operators, operatorGroups)}
          </Collapse>
          <Text strong className="mt-4 mb-2 d-block">
            Resources
          </Text>
          <Collapse
            bordered={false}
            defaultActiveKey={resourceGroups[0]?.category}
          >
            {renderPanels(resources, resourceGroups)}
          </Collapse>
        </Spin>
      </SiderInner>
    </NodeLibrary>
  );
}

function NodePort({
  node,
  port,
  type,
  label,
  index,
}: {
  node: DbgptFlowNode;
  port: DbgptFlowNodePort | DbgptFlowNodeParameter;
  type: 'target' | 'source';
  label: 'inputs' | 'outputs' | 'parameters';
  index: number;
}) {
  const handleId = `${node.id}|${label}|${index}`;
  return (
    <PortRow style={{ justifyContent: type === 'source' ? 'flex-end' : 'flex-start' }}>
      {type === 'target' && (
        <Handle
          type="target"
          id={handleId}
          position={Position.Left}
          style={{ left: -14, width: 9, height: 9 }}
        />
      )}
      <Tooltip title={port.description || port.type_name}>
        <span>
          {port.label || port.name}
          {port.optional === false ? <span className="red-6 ml-1">*</span> : null}
        </span>
      </Tooltip>
      {type === 'source' && (
        <Handle
          type="source"
          id={handleId}
          position={Position.Right}
          style={{ right: -14, width: 9, height: 9 }}
        />
      )}
    </PortRow>
  );
}

function ParameterValue({
  parameter,
  onChange,
}: {
  parameter: DbgptFlowNodeParameter;
  onChange: (value: unknown) => void;
}) {
  if (parameter.category === 'resource') {
    return null;
  }
  const value = parameter.value as string;
  return (
    <Input
      size="small"
      value={value}
      placeholder={String(parameter.placeholder || parameter.label || '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CanvasNode({ data }: NodeProps<DbgptFlowNode>) {
  const reactFlow = useReactFlow();
  const node = data;
  const inputs = node.inputs || [];
  const outputs = node.outputs || [];
  const parameters = node.parameters || [];

  const copyNode = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const nodes = reactFlow.getNodes();
    const originalNode = nodes.find((item) => item.id === node.id);
    if (!originalNode) return;
    const newNodeId = getUniqueFlowNodeId(originalNode.data, nodes);
    reactFlow.setNodes((currentNodes) => [
      ...currentNodes,
      {
        ...originalNode,
        id: newNodeId,
        position: {
          x: originalNode.position.x + 360,
          y: originalNode.position.y,
        },
        data: {
          ...originalNode.data,
          id: newNodeId,
          selected: false,
        },
        selected: false,
      },
    ]);
  };

  const deleteNode = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    reactFlow.setNodes((nodes) => nodes.filter((item) => item.id !== node.id));
    reactFlow.setEdges((edges) =>
      edges.filter((edge) => edge.source !== node.id && edge.target !== node.id),
    );
  };

  const updateParameter = (name: string, value: unknown) => {
    reactFlow.setNodes((nodes) =>
      nodes.map((item) => {
        if (item.id !== node.id) return item;
        return {
          ...item,
          data: {
            ...item.data,
            parameters: (item.data.parameters || []).map((parameter) =>
              parameter.name === name ? { ...parameter, value } : parameter,
            ),
          },
        };
      }),
    );
  };

  return (
    <FlowNodeShell
      $selected={node.selected}
      $invalid={node.invalid}
      $resource={node.flow_type === 'resource'}
    >
      <div className="d-flex justify-space-between align-start gx-2">
        <Space align="start" size={10}>
          <NodeIcon $tone={node.flow_type}>
            {node.flow_type === 'resource' ? 'R' : 'O'}
          </NodeIcon>
          <div style={{ minWidth: 0 }}>
            <Text strong ellipsis style={{ display: 'block', maxWidth: 210 }}>
              {node.label}
            </Text>
            <Text className="gray-7 text-sm">{node.category_label}</Text>
          </div>
        </Space>
        <Space size={4}>
          <Tooltip title={node.description}>
            <Button size="small" type="text" icon={<InfoCircleOutlined />} />
          </Tooltip>
          <Button size="small" type="text" icon={<CopyOutlined />} onClick={copyNode} />
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={deleteNode}
          />
        </Space>
      </div>

      {inputs.length > 0 && (
        <FlowNodeSection>
          <Text strong className="text-sm">
            Inputs
          </Text>
          {inputs.map((input, index) => (
            <NodePort
              key={`${node.id}-input-${index}`}
              node={node}
              port={input}
              type="target"
              label="inputs"
              index={index}
            />
          ))}
        </FlowNodeSection>
      )}

      {parameters.length > 0 && (
        <FlowNodeSection>
          <Text strong className="text-sm">
            Parameters
          </Text>
          {parameters.map((parameter, index) => (
            <div key={`${node.id}-param-${index}`} className="mt-2">
              {parameter.category === 'resource' ? (
                <NodePort
                  node={node}
                  port={parameter}
                  type="target"
                  label="parameters"
                  index={index}
                />
              ) : (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text className="gray-7 text-sm">
                    {parameter.label}
                    {parameter.optional === false ? (
                      <span className="red-6 ml-1">*</span>
                    ) : null}
                  </Text>
                  <ParameterValue
                    parameter={parameter}
                    onChange={(value) => updateParameter(parameter.name, value)}
                  />
                </Space>
              )}
            </div>
          ))}
        </FlowNodeSection>
      )}

      {(outputs.length > 0 || node.flow_type === 'resource') && (
        <FlowNodeSection>
          <Text strong className="text-sm">
            Outputs
          </Text>
          {node.flow_type === 'resource' ? (
            <NodePort
              node={node}
              port={node as unknown as DbgptFlowNodePort}
              type="source"
              label="outputs"
              index={0}
            />
          ) : (
            outputs.map((output, index) => (
              <NodePort
                key={`${node.id}-output-${index}`}
                node={node}
                port={output}
                type="source"
                label="outputs"
                index={index}
              />
            ))
          )}
        </FlowNodeSection>
      )}
    </FlowNodeShell>
  );
}

function ButtonEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const [edgePath, edgeCenterX, edgeCenterY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const reactFlow = useReactFlow();
  return (
    <>
      <BaseEdge id={id} style={style} path={edgePath} markerEnd={markerEnd} />
      <foreignObject
        width={40}
        height={40}
        x={edgeCenterX - 20}
        y={edgeCenterY - 20}
        requiredExtensions="http://www.w3.org/1999/xhtml"
      >
        <button
          type="button"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: 0,
            background: '#94a3b8',
            color: '#fff',
            cursor: 'pointer',
            lineHeight: '18px',
          }}
          onClick={(event) => {
            event.stopPropagation();
            reactFlow.setEdges((edges) => edges.filter((edge) => edge.id !== id));
          }}
        >
          x
        </button>
      </foreignObject>
    </>
  );
}

const nodeTypes = { customNode: CanvasNode };
const edgeTypes = { buttonedge: ButtonEdge };

const checkRequired = (flowData: DbgptFlowData): [boolean, Node | undefined, string] => {
  const nodes = flowData.nodes || [];
  const edges = flowData.edges || [];
  if (!nodes.length) return [false, undefined, 'Please add nodes first.'];

  for (const node of nodes) {
    const data = node.data;
    const inputs = data.inputs || [];
    const parameters = data.parameters || [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      if (
        input.optional === false &&
        !edges.some((edge) => edge.targetHandle === `${node.id}|inputs|${index}`)
      ) {
        return [false, node as unknown as Node, `The input ${input.label} of node ${data.label} is required.`];
      }
    }
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      if (
        parameter.optional === false &&
        parameter.category === 'resource' &&
        !edges.some((edge) => edge.targetHandle === `${node.id}|parameters|${index}`)
      ) {
        return [false, node as unknown as Node, `The parameter ${parameter.label} of node ${data.label} is required.`];
      }
      if (
        parameter.optional === false &&
        parameter.category !== 'resource' &&
        (parameter.value === undefined || parameter.value === null || parameter.value === '')
      ) {
        return [false, node as unknown as Node, `The parameter ${parameter.label} of node ${data.label} is required.`];
      }
    }
  }
  return [true, nodes[0] as unknown as Node, ''];
};

function SaveFlowModal({
  open,
  flowInfo,
  reactFlow,
  onClose,
  onSaved,
}: {
  open: boolean;
  flowInfo?: DbgptFlow;
  reactFlow?: ReactFlowInstance;
  onClose: () => void;
  onSaved: (flow: DbgptFlow) => void;
}) {
  const [form] = Form.useForm<DbgptFlowPayload>();
  const [saving, setSaving] = useState(false);
  const isDeployed =
    flowInfo?.state === 'deployed' || flowInfo?.state === 'running';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      label: flowInfo?.label,
      name: flowInfo?.name,
      description: flowInfo?.description,
      editable: flowInfo?.editable ?? true,
      state: isDeployed ? 'deployed' : 'developing',
    });
  }, [open, flowInfo, isDeployed, form]);

  const onLabelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const label = event.target.value;
    form.setFieldsValue({
      name: label.replace(/\s+/g, '_').toLowerCase(),
    });
  };

  const submit = async (values: DbgptFlowPayload) => {
    if (!reactFlow) return;
    setSaving(true);
    try {
      const flowData = mapReactFlowToFlowData(reactFlow.toObject() as DbgptFlowData);
      const payload: DbgptFlowPayload = {
        name: values.name,
        label: values.label,
        description: values.description || '',
        editable: values.editable ?? true,
        state: values.state || 'developing',
        flow_data: flowData,
        variables: flowInfo?.variables,
      };
      const result = flowInfo?.uid
        ? await fetchDbgpt<DbgptFlow>(`/api/v2/serve/awel/flows/${flowInfo.uid}`, {
            method: 'PUT',
            body: JSON.stringify({
              ...payload,
              uid: flowInfo.uid,
            }),
          })
        : await fetchDbgpt<DbgptFlow>('/api/v2/serve/awel/flows', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      message.success('Flow saved.');
      onSaved(result);
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to save flow.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={open}
      title="Save flow"
      onCancel={onClose}
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item
          label="Title"
          name="label"
          rules={[{ required: true, message: 'Please input flow title.' }]}
        >
          <Input onChange={onLabelChange} />
        </Form.Item>
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'Please input flow name.' },
            {
              pattern: /^[a-zA-Z0-9_-]+$/,
              message: 'Can only contain numbers, letters, underscores, and dashes.',
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item label="Editable" name="editable" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item label="Deploy" name="state" valuePropName="checked" getValueFromEvent={(checked) => (checked ? 'deployed' : 'developing')} getValueProps={(value) => ({ checked: value === 'deployed' })}>
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function Canvas() {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance>();
  const [flowInfo, setFlowInfo] = useState<DbgptFlow>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [saveOpen, setSaveOpen] = useState(false);
  const flowId = getQueryValue(router.query.id);

  const loadFlow = async (id: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchDbgpt<DbgptFlow>(`/api/v2/serve/awel/flows/${id}`);
      const flowData = mapFlowDataToReactFlow(data.flow_data);
      setFlowInfo(data);
      setNodes((flowData.nodes || []) as any);
      setEdges((flowData.edges || []) as any);
      window.requestAnimationFrame(() => reactFlow.fitView());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load flow.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (flowId) loadFlow(flowId);
  }, [flowId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const onNodesClick = (_event: unknown, clickedNode: Node<DbgptFlowNode>) => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          selected: node.id === clickedNode.id,
        },
      })),
    );
  };

  const onConnect = (connection: Connection) => {
    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          type: 'buttonedge',
          id: `${connection.source}|${connection.sourceHandle}|${connection.target}|${connection.targetHandle}`,
        },
        currentEdges,
      ),
    );
  };

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const nodeStr = event.dataTransfer.getData('application/reactflow');
      if (!reactFlowBounds || !nodeStr) return;
      const nodeData = JSON.parse(nodeStr) as DbgptFlowNode;
      const position = reactFlow.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      const nodeId = getUniqueFlowNodeId(nodeData, reactFlow.getNodes());
      const newNode = {
        id: nodeId,
        position,
        type: 'customNode',
        data: {
          ...nodeData,
          id: nodeId,
          selected: true,
        },
      };
      setNodes((currentNodes) =>
        currentNodes
          .concat(newNode)
          .map((node) => ({
            ...node,
            data: {
              ...node.data,
              selected: node.id === newNode.id,
            },
          })),
      );
    },
    [reactFlow, setNodes],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const openSave = () => {
    const flowData = reactFlow.toObject() as DbgptFlowData;
    const [valid, node, warning] = checkRequired(flowData);
    if (!valid && !node) {
      message.warning(warning);
      return;
    }
    if (!valid && node) {
      setNodes((currentNodes) =>
        currentNodes.map((item) => ({
          ...item,
          data: {
            ...item.data,
            invalid: item.id === node.id,
          },
        })),
      );
      notification.error({
        message: 'Invalid flow',
        description: warning,
        icon: <FrownOutlined className="red-6" />,
      });
      return;
    }
    setSaveOpen(true);
  };

  const exportFlow = () => {
    const data = JSON.stringify(reactFlow.toObject(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${flowInfo?.name || 'workflow'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFlow = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text()) as DbgptFlowData;
        const flowData = mapFlowDataToReactFlow(data);
        setNodes((flowData.nodes || []) as any);
        setEdges((flowData.edges || []) as any);
        message.success('Flow imported.');
      } catch (_err) {
        message.error('Invalid flow file.');
      }
    };
    input.click();
  };

  return (
    <CanvasFrame>
      <CanvasHeader>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(Path.Workflow)}>
            Workflow
          </Button>
          <Divider type="vertical" />
          <div>
            <Text strong>{flowInfo?.label || 'New flow'}</Text>
            {flowInfo?.state && <StatusLabel state={flowInfo.state} />}
          </div>
        </Space>
        <Space>
          <Tooltip title="Template">
            <Button icon={<FileAddOutlined />} onClick={() => message.info('Template selection uses DB-GPT templates when that API is enabled.')} />
          </Tooltip>
          <Tooltip title="Import">
            <Button icon={<ImportOutlined />} onClick={importFlow} />
          </Tooltip>
          {flowInfo?.uid && (
            <Tooltip title="Export">
              <Button icon={<ExportOutlined />} onClick={exportFlow} />
            </Tooltip>
          )}
          <Tooltip title="Save">
            <Button type="primary" icon={<SaveOutlined />} onClick={openSave}>
              Save
            </Button>
          </Tooltip>
        </Space>
      </CanvasHeader>

      <CanvasBody>
        <AddNodesSider error={error} />
        <ReactFlowArea ref={reactFlowWrapper}>
          {error && !flowId ? (
            <Alert
              type="warning"
              showIcon
              message="DB-GPT workflow service is unavailable"
              description={error}
              style={{ margin: 16 }}
            />
          ) : null}
          <Spin spinning={loading}>
            <div style={{ height: 'calc(100vh - 104px)', minHeight: 672 }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onInit={setReactFlowInstance}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodesClick}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                minZoom={0.1}
                fitView
                deleteKeyCode={['Backspace', 'Delete']}
              >
                <Controls position="bottom-center" />
                <Background color="#94a3b8" gap={16} />
              </ReactFlow>
            </div>
          </Spin>
        </ReactFlowArea>
      </CanvasBody>

      <SaveFlowModal
        open={saveOpen}
        flowInfo={flowInfo}
        reactFlow={reactFlowInstance}
        onClose={() => setSaveOpen(false)}
        onSaved={(flow) => {
          setFlowInfo(flow);
          if (!flowId && flow.uid) {
            router.replace(
              `${Path.Workflow}/canvas?id=${encodeURIComponent(flow.uid)}`,
              undefined,
              { shallow: true },
            );
          }
        }}
      />
    </CanvasFrame>
  );
}

function StatusLabel({ state }: { state?: string }) {
  if (!state) return null;
  const color =
    state === 'deployed' || state === 'running'
      ? 'green'
      : state === 'load_failed'
        ? 'red'
        : 'blue';
  return (
    <Badge
      color={color}
      text={<Text className="gray-7 text-sm ml-2">{state}</Text>}
      className="ml-3"
    />
  );
}

export default function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
