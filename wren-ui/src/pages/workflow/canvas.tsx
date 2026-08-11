import {
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  Select,
  Space,
  Spin,
  Switch,
  Table,
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
import type { EdgeTypes, NodeTypes } from 'reactflow';
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
  position: relative;

  .react-flow__controls {
    left: 16px;
    bottom: 16px;
    border: 1px solid #dbe4f0;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
    overflow: hidden;
  }

  .react-flow__controls-button {
    width: 30px;
    height: 30px;
    border-bottom: 0;
    color: #475569;
    background: rgba(255, 255, 255, 0.94);
  }

  .react-flow__controls-button:hover {
    color: #1d4ed8;
    background: #f8fafc;
  }
`;

const ConnectionPanel = styled.div`
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 5;
  width: 340px;
  padding: 12px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
`;

const EdgeSummary = styled.div`
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 5;
  max-width: 340px;
  padding: 8px 10px;
  border: 1px solid #dbe4f0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
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

type FlowHandleKind = 'input' | 'output' | 'parameter';

const buildHandleId = (nodeId: string, kind: FlowHandleKind, index: number) =>
  `${nodeId}:${kind}:${index}`;

const parseHandleId = (handleId?: string | null) => {
  if (!handleId) return null;
  const colon = handleId.match(/^(.+):(input|output|parameter):(\d+)$/);
  if (colon) {
    return {
      nodeId: colon[1],
      kind: colon[2] as FlowHandleKind,
      index: Number(colon[3]),
    };
  }
  const pipe = handleId.match(/^(.+)\|(inputs|outputs|parameters)\|(\d+)$/);
  if (pipe) {
    const kindMap = {
      inputs: 'input',
      outputs: 'output',
      parameters: 'parameter',
    } as const;
    return {
      nodeId: pipe[1],
      kind: kindMap[pipe[2] as keyof typeof kindMap],
      index: Number(pipe[3]),
    };
  }
  return null;
};

const normalizeHandleId = (handleId?: string | null) => {
  const parsed = parseHandleId(handleId);
  return parsed
    ? buildHandleId(parsed.nodeId, parsed.kind, parsed.index)
    : handleId;
};

const buildConnectionId = (connection: Connection) =>
  [
    connection.source,
    normalizeHandleId(connection.sourceHandle),
    connection.target,
    normalizeHandleId(connection.targetHandle),
  ].join(':');

type PortOption = {
  value: string;
  nodeId: string;
  label: string;
};

const getOutputOptions = (nodes: Node<DbgptFlowNode>[]): PortOption[] =>
  nodes.flatMap((node) => {
    const outputs =
      node.data.flow_type === 'resource' || !(node.data.outputs || []).length
        ? [{ label: node.data.label || node.data.name, name: node.data.name }]
        : node.data.outputs || [];
    return outputs.map((output, index) => ({
      value: buildHandleId(node.id, 'output', index),
      nodeId: node.id,
      label: `${node.data.label || node.data.name} / ${output.label || output.name || 'Output'}`,
    }));
  });

const getInputOptions = (nodes: Node<DbgptFlowNode>[]): PortOption[] =>
  nodes.flatMap((node) => {
    const inputs = (node.data.inputs || []).map((input, index) => ({
      value: buildHandleId(node.id, 'input', index),
      nodeId: node.id,
      label: `${node.data.label || node.data.name} / ${input.label || input.name || 'Input'}`,
    }));
    const resourceParameters = (node.data.parameters || [])
      .map((parameter, index) =>
        parameter.category === 'resource'
          ? {
              value: buildHandleId(node.id, 'parameter', index),
              nodeId: node.id,
              label: `${node.data.label || node.data.name} / ${parameter.label || parameter.name || 'Resource parameter'}`,
            }
          : null,
      )
      .filter(Boolean) as PortOption[];
    return [...inputs, ...resourceParameters];
  });

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function StaticNodes({
  nodes,
  emptyText = 'No nodes found.',
}: {
  nodes: DbgptFlowNode[];
  emptyText?: string;
}) {
  const onDragStart = (event: DragEvent, node: DbgptFlowNode) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(node));
    event.dataTransfer.effectAllowed = 'move';
  };

  if (!nodes.length) {
    return (
      <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} />
    );
  }

  return (
    <div>
      {nodes.map((node) => (
        <StaticNodeItem
          key={node.id}
          draggable
          onDragStart={(event) => onDragStart(event, node)}
        >
          <NodeIcon $tone={node.flow_type}>
            {node.flow_type === 'resource' ? 'R' : 'O'}
          </NodeIcon>
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

function AddNodesSider({
  flowLoadError,
  onNodesLoaded,
}: {
  flowLoadError?: string;
  onNodesLoaded?: (nodes: DbgptFlowNode[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [operators, setOperators] = useState<DbgptFlowNode[]>([]);
  const [resources, setResources] = useState<DbgptFlowNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [nodeLoadError, setNodeLoadError] = useState<string | null>(null);
  const [showAllNodes, setShowAllNodes] = useState(false);

  const loadNodes = async (tags?: string) => {
    setLoading(true);
    setNodeLoadError(null);
    try {
      const data = await fetchDbgpt<DbgptFlowNode[]>(
        `/api/v2/serve/awel/nodes${tags ? `?tags=${encodeURIComponent(tags)}` : ''}`,
      );
      const nextNodes = data || [];
      setOperators(nextNodes.filter((node) => node.flow_type === 'operator'));
      setResources(nextNodes.filter((node) => node.flow_type === 'resource'));
      window.localStorage.setItem(
        'dbgpt_flow_nodes',
        JSON.stringify(nextNodes),
      );
      onNodesLoaded?.(nextNodes);
    } catch (err) {
      setOperators([]);
      setResources([]);
      setNodeLoadError(
        err instanceof Error
          ? err.message
          : 'Unable to load DB-GPT workflow nodes.',
      );
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
    if (nodeLoadError) {
      return (
        <Collapse.Panel key="load-error" header="Unavailable">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="DB-GPT node service is unavailable."
          />
          <Button
            size="small"
            block
            onClick={() => loadNodes(showAllNodes ? undefined : FLOW_NODE_TAGS)}
          >
            Retry
          </Button>
        </Collapse.Panel>
      );
    }
    const visibleGroups = searchValue
      ? groupNodes(
          list.filter((node) =>
            `${node.label} ${node.name} ${node.description}`
              .toLowerCase()
              .includes(searchValue.toLowerCase()),
          ),
        )
      : groups;
    if (!list.length) {
      return (
        <Collapse.Panel key="empty-nodes" header="Empty">
          <StaticNodes nodes={[]} emptyText="No available nodes." />
        </Collapse.Panel>
      );
    }
    if (!visibleGroups.length) {
      return (
        <Collapse.Panel key="search-empty" header="Search">
          <StaticNodes nodes={[]} emptyText="No matching nodes." />
        </Collapse.Panel>
      );
    }
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
        {flowLoadError && (
          <Alert
            className="mb-3"
            type="warning"
            showIcon
            message="Flow load failed"
            description={flowLoadError}
          />
        )}
        {nodeLoadError && (
          <Alert
            className="mb-3"
            type="error"
            showIcon
            message="DB-GPT node service is unavailable"
            description={nodeLoadError}
            action={
              <Button
                size="small"
                onClick={() =>
                  loadNodes(showAllNodes ? undefined : FLOW_NODE_TAGS)
                }
              >
                Retry
              </Button>
            }
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
  const kind =
    label === 'outputs' ? 'output' : label === 'inputs' ? 'input' : 'parameter';
  const handleId = buildHandleId(node.id, kind, index);
  return (
    <PortRow
      style={{ justifyContent: type === 'source' ? 'flex-end' : 'flex-start' }}
    >
      {type === 'target' && (
        <Handle
          type="target"
          id={handleId}
          position={Position.Left}
          data-testid={`workflow-handle-${handleId}`}
          style={{ left: -14, width: 9, height: 9 }}
        />
      )}
      <Tooltip title={port.description || port.type_name}>
        <span>
          {port.label || port.name}
          {port.optional === false ? (
            <span className="red-6 ml-1">*</span>
          ) : null}
        </span>
      </Tooltip>
      {type === 'source' && (
        <Handle
          type="source"
          id={handleId}
          position={Position.Right}
          data-testid={`workflow-handle-${handleId}`}
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

type CanvasNodeData = DbgptFlowNode & {
  onDirty?: () => void;
};

function CanvasNode({ data }: NodeProps<CanvasNodeData>) {
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
    node.onDirty?.();
  };

  const deleteNode = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    reactFlow.setNodes((nodes) => nodes.filter((item) => item.id !== node.id));
    reactFlow.setEdges((edges) =>
      edges.filter(
        (edge) => edge.source !== node.id && edge.target !== node.id,
      ),
    );
    node.onDirty?.();
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
    node.onDirty?.();
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
          <Button
            size="small"
            type="text"
            icon={<CopyOutlined />}
            onClick={copyNode}
          />
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
  data,
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
            reactFlow.setEdges((edges) =>
              edges.filter((edge) => edge.id !== id),
            );
            data?.onDirty?.();
          }}
        >
          x
        </button>
      </foreignObject>
    </>
  );
}

const nodeTypes: NodeTypes = { customNode: CanvasNode };
const edgeTypes: EdgeTypes = { buttonedge: ButtonEdge };

const checkRequired = (
  flowData: DbgptFlowData,
): [boolean, Node | undefined, string] => {
  const nodes = flowData.nodes || [];
  const edges = flowData.edges || [];
  if (!nodes.length) return [false, undefined, 'Please add nodes first.'];
  const hasTargetHandle = (
    nodeId: string,
    kind: FlowHandleKind,
    index: number,
  ) =>
    edges.some(
      (edge) =>
        normalizeHandleId(edge.targetHandle || edge.target_handle) ===
        buildHandleId(nodeId, kind, index),
    );

  for (const node of nodes) {
    const data = node.data;
    const inputs = data.inputs || [];
    const parameters = data.parameters || [];
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      if (
        input.optional === false &&
        !hasTargetHandle(node.id, 'input', index)
      ) {
        return [
          false,
          node as unknown as Node,
          `The input ${input.label} of node ${data.label} is required.`,
        ];
      }
    }
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      if (
        parameter.optional === false &&
        parameter.category === 'resource' &&
        !hasTargetHandle(node.id, 'parameter', index)
      ) {
        return [
          false,
          node as unknown as Node,
          `The parameter ${parameter.label} of node ${data.label} is required.`,
        ];
      }
      if (
        parameter.optional === false &&
        parameter.category !== 'resource' &&
        (parameter.value === undefined ||
          parameter.value === null ||
          parameter.value === '')
      ) {
        return [
          false,
          node as unknown as Node,
          `The parameter ${parameter.label} of node ${data.label} is required.`,
        ];
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const isDeployed =
    flowInfo?.state === 'deployed' || flowInfo?.state === 'running';

  useEffect(() => {
    if (!open) return;
    setSaveError(null);
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
    setSaveError(null);
    try {
      const flowData = mapReactFlowToFlowData(
        reactFlow.toObject() as DbgptFlowData,
      );
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
        ? await fetchDbgpt<DbgptFlow>(
            `/api/v2/serve/awel/flows/${flowInfo.uid}`,
            {
              method: 'PUT',
              body: JSON.stringify({
                ...payload,
                uid: flowInfo.uid,
              }),
            },
          )
        : await fetchDbgpt<DbgptFlow>('/api/v2/serve/awel/flows', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
      message.success('Flow saved.');
      onSaved(result);
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save flow.',
      );
      message.error(
        error instanceof Error ? error.message : 'Failed to save flow.',
      );
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
        {saveError && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            message="Unable to save flow"
            description={saveError}
          />
        )}
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
              message:
                'Can only contain numbers, letters, underscores, and dashes.',
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
        <Form.Item
          label="Deploy"
          name="state"
          valuePropName="checked"
          getValueFromEvent={(checked) => (checked ? 'deployed' : 'developing')}
          getValueProps={(value) => ({ checked: value === 'deployed' })}
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function TemplateFlowModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (flow: DbgptFlow) => void;
}) {
  const [templates, setTemplates] = useState<DbgptFlow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await fetchDbgpt<{
        items: DbgptFlow[];
        total_count: number;
        total_pages: number;
        page: number;
        page_size: number;
      }>('/api/v2/serve/awel/flow/templates');
      setTemplates(data?.items || []);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Unable to load flow templates.',
      );
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadTemplates();
  }, [open]);

  return (
    <Modal
      visible={open}
      title="Import from template"
      width={920}
      footer={null}
      destroyOnClose
      onCancel={onClose}
    >
      <Table
        rowKey="uid"
        loading={loading}
        dataSource={templates}
        pagination={templates.length > 8 ? { pageSize: 8 } : false}
        columns={[
          {
            title: 'Name',
            dataIndex: 'name',
            width: '24%',
          },
          {
            title: 'Label',
            dataIndex: 'label',
            width: '24%',
          },
          {
            title: 'Description',
            dataIndex: 'description',
            ellipsis: true,
          },
          {
            title: 'Action',
            key: 'action',
            width: 120,
            render: (_, record: DbgptFlow) => (
              <Button
                type="link"
                onClick={() => {
                  onImport(record);
                  onClose();
                }}
              >
                Import
              </Button>
            ),
          },
        ]}
      />
    </Modal>
  );
}

function Canvas() {
  const router = useRouter();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const suppressDirtyRef = useRef(false);
  const reactFlow = useReactFlow();
  const [nodes, setNodes, baseOnNodesChange] = useNodesState([]);
  const [edges, setEdges, baseOnEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance>();
  const [flowInfo, setFlowInfo] = useState<DbgptFlow>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [panelSourceHandle, setPanelSourceHandle] = useState<string>();
  const [panelTargetHandle, setPanelTargetHandle] = useState<string>();
  const flowId = getQueryValue(router.query.id);
  const outputOptions = useMemo(
    () => getOutputOptions(nodes as Node<DbgptFlowNode>[]),
    [nodes],
  );
  const inputOptions = useMemo(
    () => getInputOptions(nodes as Node<DbgptFlowNode>[]),
    [nodes],
  );

  const markDirty = useCallback(() => {
    if (!suppressDirtyRef.current) setDirty(true);
  }, []);

  const attachDirtyHandlers = useCallback(
    (flowData: DbgptFlowData): DbgptFlowData => ({
      ...flowData,
      nodes: (flowData.nodes || []).map((node) => ({
        ...node,
        data: {
          ...node.data,
          onDirty: markDirty,
        },
      })),
      edges: (flowData.edges || []).map((edge) => ({
        ...edge,
        data: {
          ...(edge as any).data,
          onDirty: markDirty,
        },
      })),
    }),
    [markDirty],
  );

  const loadFlow = async (id: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const data = await fetchDbgpt<DbgptFlow>(
        `/api/v2/serve/awel/flows/${id}`,
      );
      const flowData = attachDirtyHandlers(
        mapFlowDataToReactFlow(data.flow_data),
      );
      setFlowInfo(data);
      suppressDirtyRef.current = true;
      setNodes((flowData.nodes || []) as any);
      setEdges((flowData.edges || []) as any);
      setDirty(false);
      window.requestAnimationFrame(() => {
        suppressDirtyRef.current = false;
      });
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
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  const onNodesChange = useCallback(
    (changes) => {
      if (changes.some((change) => change.type !== 'select')) markDirty();
      baseOnNodesChange(changes);
    },
    [baseOnNodesChange, markDirty],
  );

  const onEdgesChange = useCallback(
    (changes) => {
      if (changes.some((change) => change.type !== 'select')) markDirty();
      baseOnEdgesChange(changes);
    },
    [baseOnEdgesChange, markDirty],
  );

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

  const addWorkflowConnection = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle ||
        !connection.targetHandle
      ) {
        message.warning('Please connect a source output to a target input.');
        return false;
      }
      const sourceHandle = normalizeHandleId(connection.sourceHandle);
      const targetHandle = normalizeHandleId(connection.targetHandle);
      const source = parseHandleId(sourceHandle);
      const target = parseHandleId(targetHandle);
      if (!source || source.kind !== 'output') {
        message.warning('The source must be an output handle.');
        return false;
      }
      if (!target || !['input', 'parameter'].includes(target.kind)) {
        message.warning(
          'The target must be an input or resource parameter handle.',
        );
        return false;
      }
      if (connection.source === connection.target) {
        message.warning('Connect two different nodes.');
        return false;
      }
      const normalizedConnection: Connection = {
        ...connection,
        sourceHandle,
        targetHandle,
      };
      const id = buildConnectionId(normalizedConnection);
      let created = false;
      setEdges((currentEdges) => {
        const duplicated = currentEdges.some((edge) => edge.id === id);
        if (duplicated) return currentEdges;
        created = true;
        return addEdge(
          {
            ...normalizedConnection,
            type: 'buttonedge',
            data: { onDirty: markDirty },
            id,
          },
          currentEdges,
        );
      });
      if (!created) {
        message.info('This connection already exists.');
        return false;
      }
      markDirty();
      message.success('Connection added.');
      return true;
    },
    [markDirty, setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      addWorkflowConnection(connection);
    },
    [addWorkflowConnection],
  );

  const addConnectionFromPanel = () => {
    const sourceOption = outputOptions.find(
      (option) => option.value === panelSourceHandle,
    );
    const targetOption = inputOptions.find(
      (option) => option.value === panelTargetHandle,
    );
    const added = addWorkflowConnection({
      source: sourceOption?.nodeId,
      sourceHandle: panelSourceHandle,
      target: targetOption?.nodeId,
      targetHandle: panelTargetHandle,
    });
    if (added) {
      setPanelSourceHandle(undefined);
      setPanelTargetHandle(undefined);
    }
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
          onDirty: markDirty,
        },
      };
      setNodes((currentNodes) =>
        currentNodes.concat(newNode).map((node) => ({
          ...node,
          data: {
            ...node.data,
            selected: node.id === newNode.id,
          },
        })),
      );
      markDirty();
    },
    [markDirty, reactFlow, setNodes],
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
        const flowData = attachDirtyHandlers(mapFlowDataToReactFlow(data));
        suppressDirtyRef.current = true;
        setNodes((flowData.nodes || []) as any);
        setEdges((flowData.edges || []) as any);
        setDirty(true);
        window.requestAnimationFrame(() => {
          suppressDirtyRef.current = false;
        });
        message.success('Flow imported.');
      } catch (_err) {
        message.error('Invalid flow file.');
      }
    };
    input.click();
  };

  const importTemplate = (template: DbgptFlow) => {
    const flowData = attachDirtyHandlers(
      mapFlowDataToReactFlow(template.flow_data),
    );
    suppressDirtyRef.current = true;
    setNodes((flowData.nodes || []) as any);
    setEdges((flowData.edges || []) as any);
    setDirty(true);
    window.requestAnimationFrame(() => {
      suppressDirtyRef.current = false;
    });
    setFlowInfo(
      (current) =>
        ({
          ...current,
          label: template.label,
          name: template.name,
          description: template.description,
          flow_data: template.flow_data,
          variables: template.variables,
        }) as DbgptFlow,
    );
    window.requestAnimationFrame(() => reactFlow.fitView());
    message.success('Template imported.');
  };

  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'test' &&
      process.env.NEXT_PUBLIC_ENABLE_E2E_HELPERS !== '1'
    ) {
      return;
    }
    (window as any).__VEADK_WORKFLOW_TEST__ = {
      addNode: (nodeData: DbgptFlowNode, position = { x: 120, y: 120 }) => {
        const nodeId = getUniqueFlowNodeId(nodeData, reactFlow.getNodes());
        const newNode = {
          id: nodeId,
          position,
          type: 'customNode',
          data: {
            ...nodeData,
            id: nodeId,
            selected: true,
            onDirty: markDirty,
          },
        };
        setNodes((currentNodes) =>
          currentNodes.concat(newNode).map((node) => ({
            ...node,
            data: {
              ...node.data,
              selected: node.id === newNode.id,
            },
          })),
        );
        markDirty();
        return nodeId;
      },
    };
    return () => {
      delete (window as any).__VEADK_WORKFLOW_TEST__;
    };
  }, [markDirty, reactFlow, setNodes]);

  return (
    <CanvasFrame>
      <CanvasHeader>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push(Path.Workflow)}
          >
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
            <Button
              icon={<FileAddOutlined />}
              onClick={() => setTemplateOpen(true)}
            />
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
        <AddNodesSider flowLoadError={error} />
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
              <ConnectionPanel data-testid="workflow-connection-panel">
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div className="d-flex justify-space-between align-center">
                    <Text strong>Connections</Text>
                    <Badge count={edges.length} showZero />
                  </div>
                  <Select
                    data-testid="workflow-source-select"
                    allowClear
                    showSearch
                    size="small"
                    value={panelSourceHandle}
                    placeholder="Source output"
                    style={{ width: '100%' }}
                    options={outputOptions.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    onChange={setPanelSourceHandle}
                  />
                  <Select
                    data-testid="workflow-target-select"
                    allowClear
                    showSearch
                    size="small"
                    value={panelTargetHandle}
                    placeholder="Target input"
                    style={{ width: '100%' }}
                    options={inputOptions.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                    onChange={setPanelTargetHandle}
                  />
                  <Button
                    size="small"
                    type="primary"
                    block
                    disabled={!panelSourceHandle || !panelTargetHandle}
                    onClick={addConnectionFromPanel}
                  >
                    Add connection
                  </Button>
                </Space>
              </ConnectionPanel>
              <EdgeSummary data-testid="workflow-edge-summary">
                <Text className="gray-7 text-sm">
                  {edges.length} connection{edges.length === 1 ? '' : 's'}
                </Text>
                {edges.length > 0 && (
                  <div className="mt-1">
                    {edges.slice(0, 3).map((edge) => (
                      <Text
                        key={edge.id}
                        className="gray-7 text-xs d-block"
                        ellipsis
                      >
                        {`${edge.source} -> ${edge.target}`}
                      </Text>
                    ))}
                  </div>
                )}
              </EdgeSummary>
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
                <Controls position="bottom-left" showInteractive={false} />
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
          setDirty(false);
          if (!flowId && flow.uid) {
            router.replace(
              `${Path.Workflow}/canvas?id=${encodeURIComponent(flow.uid)}`,
              undefined,
              { shallow: true },
            );
          }
        }}
      />
      <TemplateFlowModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onImport={importTemplate}
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
