import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'antd';
import ApiOutlined from '@ant-design/icons/ApiOutlined';
import BookOutlined from '@ant-design/icons/BookOutlined';
import CheckCircleFilled from '@ant-design/icons/CheckCircleFilled';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import DingtalkOutlined from '@ant-design/icons/DingtalkOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import ExclamationCircleFilled from '@ant-design/icons/ExclamationCircleFilled';
import GithubOutlined from '@ant-design/icons/GithubOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReadOutlined from '@ant-design/icons/ReadOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import ThunderboltFilled from '@ant-design/icons/ThunderboltFilled';
import WarningFilled from '@ant-design/icons/WarningFilled';
import styled from 'styled-components';
import {
  ConstructEmpty,
  ConstructLayout,
  ConstructToolbar,
} from '@/components/construct/ConstructLayout';
import {
  ConnectorAuthField,
  ConnectorCatalogEntry,
  ConnectorInstance,
  ConnectorStatus,
  ConnectorToolSummary,
  ConnectorToolsResponse,
  fetchDbgpt,
  normalizeConnector,
} from '@/lib/dbgpt';

type StatusFilter = 'all' | 'active' | 'inactive' | 'attention';

type GridItem =
  | { kind: 'template'; template: ConnectorCatalogEntry; instanceCount: number }
  | {
      kind: 'instance';
      instance: ConnectorInstance;
      template?: ConnectorCatalogEntry;
    };

type FormValues = {
  connector_type: string;
  display_name: string;
  server_uri?: string;
  fields?: Record<string, string>;
};

type BrandToken = {
  icon: React.ReactNode;
  gradient: string;
  ring: string;
};

const attentionStatuses = new Set<ConnectorStatus>([
  'error',
  'needs_reactivation',
]);

const CONNECTOR_CONFIG_FIELDS = new Set([
  'server_uri',
  'transport',
  'auth_type',
  'header_name',
  'description',
]);

const CUSTOM_RENDERED_FIELDS = new Set([
  'server_uri',
  'transport',
  'description',
]);

const TRANSPORT_META: Record<
  string,
  { label: string; placeholder: string; description: string }
> = {
  streamable_http: {
    label: 'Streamable HTTP endpoint',
    placeholder: 'https://your-mcp-server/mcp',
    description: 'Use this for modern hosted MCP servers.',
  },
  sse: {
    label: 'SSE endpoint',
    placeholder: 'http://your-mcp-server/sse',
    description: 'Use this for legacy SSE MCP servers.',
  },
};

const CUSTOM_MCP_TEMPLATE: ConnectorCatalogEntry = {
  type: 'custom_mcp',
  display_name: 'Custom MCP',
  description: 'Connect any Streamable HTTP or SSE MCP server.',
  category: 'custom',
  is_custom: true,
  auth_fields: [
    {
      name: 'transport',
      label: 'Transport',
      type: 'select',
      required: true,
      options: ['streamable_http', 'sse'],
      default: 'streamable_http',
    },
    {
      name: 'auth_type',
      label: 'Authentication',
      type: 'select',
      required: true,
      options: ['none', 'bearer', 'token'],
      default: 'none',
    },
    {
      name: 'token',
      label: 'Token',
      type: 'password',
      required: true,
    },
    {
      name: 'header_name',
      label: 'Header name',
      type: 'text',
      required: true,
      default: 'Authorization',
    },
  ],
};

const STATUS_META: Record<
  ConnectorStatus,
  { dot: string; text: string; bg: string; icon: React.ReactNode }
> = {
  active: {
    dot: '#10b981',
    text: '#047857',
    bg: '#ecfdf5',
    icon: <CheckCircleFilled />,
  },
  needs_reactivation: {
    dot: '#f59e0b',
    text: '#b45309',
    bg: '#fffbeb',
    icon: <WarningFilled />,
  },
  error: {
    dot: '#f43f5e',
    text: '#be123c',
    bg: '#fff1f2',
    icon: <ExclamationCircleFilled />,
  },
  disconnected: {
    dot: '#94a3b8',
    text: '#475569',
    bg: '#f1f5f9',
    icon: <ExclamationCircleFilled />,
  },
};

const BRAND_TOKENS: Record<string, BrandToken> = {
  github: {
    icon: <GithubOutlined />,
    gradient: 'linear-gradient(135deg, #1f2937, #020617)',
    ring: 'rgba(30, 41, 59, 0.20)',
  },
  feishu: {
    icon: <span style={{ fontSize: 11, fontWeight: 800 }}>Lark</span>,
    gradient: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
    ring: 'rgba(14, 165, 233, 0.22)',
  },
  dingtalk: {
    icon: <DingtalkOutlined />,
    gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    ring: 'rgba(37, 99, 235, 0.22)',
  },
  yuque: {
    icon: <ReadOutlined />,
    gradient: 'linear-gradient(135deg, #10b981, #059669)',
    ring: 'rgba(16, 185, 129, 0.22)',
  },
  notion: {
    icon: <BookOutlined />,
    gradient: 'linear-gradient(135deg, #374151, #111827)',
    ring: 'rgba(55, 65, 81, 0.20)',
  },
  linear: {
    icon: <span style={{ fontSize: 16, fontWeight: 800 }}>L</span>,
    gradient: 'linear-gradient(135deg, #6366f1, #7c3aed)',
    ring: 'rgba(99, 102, 241, 0.22)',
  },
  tavily: {
    icon: <span style={{ fontSize: 16, fontWeight: 800 }}>T</span>,
    gradient: 'linear-gradient(135deg, #14b8a6, #0891b2)',
    ring: 'rgba(20, 184, 166, 0.22)',
  },
  deepwiki: {
    icon: <BookOutlined />,
    gradient: 'linear-gradient(135deg, #f59e0b, #ea580c)',
    ring: 'rgba(245, 158, 11, 0.22)',
  },
  custom_mcp: {
    icon: <ApiOutlined />,
    gradient: 'linear-gradient(135deg, #7c3aed, #c026d3)',
    ring: 'rgba(124, 58, 237, 0.22)',
  },
};

const FALLBACK_BRAND: BrandToken = {
  icon: <ApiOutlined />,
  gradient: 'linear-gradient(135deg, #64748b, #334155)',
  ring: 'rgba(100, 116, 139, 0.22)',
};

const ConnectorGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding-bottom: 56px;
`;

const ConnectorCardShell = styled.div<{
  $template?: boolean;
  $interactive?: boolean;
  $ring: string;
}>`
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 230px;
  padding: 18px;
  overflow: hidden;
  border: 1px ${(props) => (props.$template ? 'dashed' : 'solid')}
    ${(props) => (props.$template ? '#cbd5e1' : 'rgba(226, 232, 240, 0.96)')};
  border-radius: 12px;
  background: ${(props) =>
    props.$template
      ? 'rgba(255, 255, 255, 0.58)'
      : 'rgba(255, 255, 255, 0.88)'};
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.06);
  cursor: ${(props) => (props.$interactive ? 'pointer' : 'default')};
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;

  &:hover {
    transform: ${(props) => (props.$interactive ? 'translateY(-2px)' : 'none')};
    border-color: ${(props) =>
      props.$template ? '#a78bfa' : 'rgba(40, 103, 245, 0.34)'};
    box-shadow:
      0 14px 34px rgba(15, 23, 42, 0.11),
      0 0 0 4px ${(props) => props.$ring};
  }
`;

const CardWash = styled.div<{ $gradient: string }>`
  position: absolute;
  top: -48px;
  right: -48px;
  width: 128px;
  height: 128px;
  border-radius: 999px;
  background: ${(props) => props.$gradient};
  filter: blur(30px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;

  ${ConnectorCardShell}:hover & {
    opacity: 0.24;
  }
`;

const BrandTile = styled.div<{ $gradient: string }>`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  color: #fff;
  font-size: 20px;
  background: ${(props) => props.$gradient};
  box-shadow: 0 8px 22px rgba(15, 23, 42, 0.12);
`;

const CardHeader = styled.div`
  position: relative;
  display: flex;
  gap: 14px;
  min-width: 0;
`;

const CardTitle = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
`;

const MetaLine = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 11px;
`;

const StatusPill = styled.span<{ $status: ConnectorStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 6px;
  color: ${(props) => STATUS_META[props.$status].text};
  background: ${(props) => STATUS_META[props.$status].bg};
  font-size: 11px;
  font-weight: 600;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: ${(props) => STATUS_META[props.$status].dot};
  }
`;

const TemplateBadge = styled.span`
  display: inline-flex;
  padding: 2px 7px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  color: #64748b;
  background: #f8fafc;
  font-size: 11px;
  font-weight: 600;
`;

const CardDescription = styled.p`
  min-height: 42px;
  margin: 16px 0 0;
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 18px;
`;

const SoftChip = styled.span<{ $accent?: boolean }>`
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border: 1px solid ${(props) => (props.$accent ? '#ddd6fe' : '#e2e8f0')};
  border-radius: 7px;
  color: ${(props) => (props.$accent ? '#6d28d9' : '#475569')};
  background: ${(props) => (props.$accent ? '#f5f3ff' : '#f8fafc')};
  font-size: 11px;
  font-weight: 600;
`;

const CardActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
`;

const ToolsModalBody = styled.div`
  display: flex;
  height: min(720px, 80vh);
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
`;

const ToolsSidebar = styled.aside`
  flex: 0 0 320px;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const ToolsList = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 8px;
`;

const ToolButton = styled.button<{ $active?: boolean }>`
  display: flex;
  width: 100%;
  gap: 10px;
  padding: 10px 12px;
  margin: 2px 0;
  border: 0;
  border-radius: 8px;
  background: ${(props) => (props.$active ? '#f5f3ff' : 'transparent')};
  box-shadow: ${(props) => (props.$active ? 'inset 3px 0 0 #7c3aed' : 'none')};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${(props) => (props.$active ? '#f5f3ff' : '#f1f5f9')};
  }
`;

const ToolsDetail = styled.main`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 28px;
`;

const TypeChip = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 6px;
  color: #2563eb;
  background: #eff6ff;
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
`;

const brandFor = (type: string) => BRAND_TOKENS[type] || FALLBACK_BRAND;
const unwrapList = <T,>(value: T[] | undefined) => value || [];

const withCustomMcpTemplate = (items: ConnectorCatalogEntry[]) => {
  const hasCustomMcp = items.some(
    (item) => item.type === CUSTOM_MCP_TEMPLATE.type,
  );
  return hasCustomMcp ? items : [CUSTOM_MCP_TEMPLATE, ...items];
};

const filterOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Attention', value: 'attention' },
];

function ConnectorCard({
  item,
  onActivate,
  onEdit,
  onDelete,
  onTest,
  onOpenTools,
}: {
  item: GridItem;
  onActivate: (template: ConnectorCatalogEntry) => void;
  onEdit: (connector: ConnectorInstance) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => void;
  onOpenTools: (connector: ConnectorInstance) => void;
}) {
  const isTemplate = item.kind === 'template';
  const type = isTemplate ? item.template.type : item.instance.connector_type;
  const brand = brandFor(type);
  const displayName = isTemplate
    ? item.template.display_name
    : item.instance.display_name;
  const category = isTemplate
    ? item.template.category
    : item.template?.category ||
      (item.instance.is_custom ? 'custom' : 'project');
  const description = isTemplate
    ? item.template.description || 'Connector template.'
    : (item.instance.config?.description as string) ||
      (item.instance.connector_type === 'custom_mcp'
        ? ''
        : item.template?.description) ||
      '';

  return (
    <ConnectorCardShell
      $template={isTemplate}
      $interactive={!isTemplate}
      $ring={brand.ring}
      role={!isTemplate ? 'button' : undefined}
      tabIndex={!isTemplate ? 0 : undefined}
      onClick={!isTemplate ? () => onOpenTools(item.instance) : undefined}
      onKeyDown={
        !isTemplate
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenTools(item.instance);
              }
            }
          : undefined
      }
    >
      <CardWash $gradient={brand.gradient} />
      <CardHeader>
        <BrandTile $gradient={brand.gradient}>{brand.icon}</BrandTile>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <CardTitle>
            <Tooltip title={displayName} mouseEnterDelay={0.5}>
              <span className="text-truncate" style={{ maxWidth: 210 }}>
                {displayName}
              </span>
            </Tooltip>
            {isTemplate ? (
              <TemplateBadge>Template</TemplateBadge>
            ) : (
              <StatusPill $status={item.instance.status}>
                {item.instance.status}
              </StatusPill>
            )}
          </CardTitle>
          <MetaLine>
            <span>{category}</span>
            <span>·</span>
            <span>MCP / SSE</span>
            {!isTemplate && item.instance.created_at && (
              <>
                <span>·</span>
                <span>{item.instance.created_at.slice(0, 10)}</span>
              </>
            )}
          </MetaLine>
        </div>
      </CardHeader>

      <CardDescription>{description || 'No description.'}</CardDescription>

      <ChipRow>
        <SoftChip>{type}</SoftChip>
        <SoftChip $accent>
          {isTemplate || item.template ? 'official' : 'custom'}
        </SoftChip>
        {isTemplate && (
          <SoftChip>{item.template.auth_fields.length} auth fields</SoftChip>
        )}
      </ChipRow>

      <CardActions>
        {isTemplate ? (
          <>
            <span className="gray-7 text-sm">Ready to activate</span>
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={(event) => {
                event.stopPropagation();
                onActivate(item.template);
              }}
            >
              Activate
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onTest(item.instance.id);
              }}
            >
              Test
            </Button>
            <span>
              <Tooltip title="Edit">
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(item.instance);
                  }}
                />
              </Tooltip>
              <Popconfirm
                title="Delete this connector?"
                onConfirm={() => onDelete(item.instance.id)}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={(event) => event.stopPropagation()}
                />
              </Popconfirm>
            </span>
          </>
        )}
      </CardActions>
    </ConnectorCardShell>
  );
}

function ConnectorToolsModal({
  connector,
  open,
  onClose,
}: {
  connector: ConnectorInstance | null;
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<ConnectorToolsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const loadTools = async () => {
    if (!connector?.id) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchDbgpt<ConnectorToolsResponse>(
        `/api/v2/serve/connectors/${connector.id}/tools`,
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tools.');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      loadTools();
    }
  }, [open, connector?.id]);

  const tools = data?.state === 'active' ? data.tools || [] : [];
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return tools;
    return tools.filter((tool) =>
      `${tool.original_name || ''} ${tool.name} ${tool.description || ''}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [tools, query]);
  const selectedTool = filtered[selectedIdx];

  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered.length, selectedIdx]);

  const copyName = (name: string) => {
    navigator.clipboard?.writeText(name);
    message.success(`Copied ${name}`);
  };

  return (
    <Modal
      visible={open}
      footer={null}
      width={960}
      destroyOnClose
      onCancel={onClose}
      bodyStyle={{ padding: 0 }}
      title={null}
    >
      <ToolsModalBody>
        <ToolsSidebar>
          <div className="p-4 border-bottom">
            <div className="d-flex align-center gx-3">
              <BrandTile
                $gradient={brandFor(connector?.connector_type || '').gradient}
              >
                <ThunderboltFilled />
              </BrandTile>
              <div style={{ minWidth: 0 }}>
                <div className="gray-10 text-medium text-truncate">
                  {connector?.display_name || ''}
                </div>
                <div className="gray-7 text-sm">
                  {connector?.connector_type || ''}
                  {data?.state ? ` · ${data.state}` : ''}
                </div>
              </div>
            </div>
            <Input
              className="mt-3"
              prefix={<SearchOutlined />}
              allowClear
              value={query}
              placeholder="Search tools"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ToolsList>
            {loading ? (
              <Spin className="d-flex justify-center mt-6" />
            ) : error ? (
              <Alert
                type="warning"
                showIcon
                message="Unable to load tools"
                description={error}
                action={<Button onClick={loadTools}>Retry</Button>}
              />
            ) : data?.state === 'inactive' ? (
              <EmptyMessage text="Connector is inactive." />
            ) : data?.state === 'not_mcp' ? (
              <EmptyMessage text="This connector does not expose MCP tools." />
            ) : filtered.length === 0 ? (
              <EmptyMessage text="No tools found." />
            ) : (
              filtered.map((tool, index) => (
                <ToolButton
                  key={tool.name}
                  $active={index === selectedIdx}
                  onClick={() => setSelectedIdx(index)}
                >
                  <span
                    style={{
                      flex: '0 0 auto',
                      width: 6,
                      height: 6,
                      borderRadius: 999,
                      marginTop: 8,
                      background: index === selectedIdx ? '#7c3aed' : '#cbd5e1',
                    }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span className="d-block gray-10 text-sm text-medium text-truncate">
                      {tool.original_name || tool.name}
                    </span>
                    <span className="d-block gray-7 text-sm text-truncate">
                      {tool.description || '-'}
                    </span>
                  </span>
                </ToolButton>
              ))
            )}
          </ToolsList>
          {data?.state === 'active' && (
            <div className="px-4 py-2 border-top gray-7 text-sm">
              {filtered.length} / {tools.length} tools
            </div>
          )}
        </ToolsSidebar>
        <ToolsDetail>
          {selectedTool ? (
            <ToolDetail tool={selectedTool} onCopy={copyName} />
          ) : (
            <EmptyMessage text="Select a tool to inspect its schema." />
          )}
        </ToolsDetail>
      </ToolsModalBody>
    </Modal>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="d-flex justify-center align-center gray-7 text-sm p-8">
      {text}
    </div>
  );
}

function ToolDetail({
  tool,
  onCopy,
}: {
  tool: ConnectorToolSummary;
  onCopy: (name: string) => void;
}) {
  const argEntries = Object.entries(tool.args || {}).filter(
    ([key, value]) =>
      key !== '_truncated' &&
      !(value && typeof value === 'object' && (value as any)._truncated),
  );
  const displayName = tool.original_name || tool.name;

  return (
    <div>
      <div className="d-flex justify-space-between align-start gx-4 mb-3">
        <div style={{ minWidth: 0 }}>
          <div className="gray-10 text-lg text-bold text-truncate">
            {displayName}
          </div>
          <div className="gray-7 mt-2" style={{ lineHeight: 1.7 }}>
            {tool.description || '-'}
          </div>
        </div>
        <Button icon={<CopyOutlined />} onClick={() => onCopy(displayName)}>
          Copy
        </Button>
      </div>
      <Divider />
      <div className="gray-10 text-medium mb-3">Input schema</div>
      {argEntries.length === 0 ? (
        <div className="gray-7 text-sm">No parameters.</div>
      ) : (
        <div
          style={{
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                <th style={{ textAlign: 'left', padding: 10 }}>Name</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Type</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Required</th>
                <th style={{ textAlign: 'left', padding: 10 }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {argEntries.map(([name, info]) => (
                <tr key={name} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 10, fontFamily: 'monospace' }}>
                    {name}
                  </td>
                  <td style={{ padding: 10 }}>
                    <TypeChip>{(info as any)?.type || 'any'}</TypeChip>
                  </td>
                  <td style={{ padding: 10 }}>
                    {(info as any)?.required ? (
                      <span className="green-6 text-bold">yes</span>
                    ) : (
                      <span className="gray-6">no</span>
                    )}
                  </td>
                  <td style={{ padding: 10 }}>
                    {(info as any)?.description || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Tools() {
  const [form] = Form.useForm<FormValues>();
  const [catalog, setCatalog] = useState<ConnectorCatalogEntry[]>([]);
  const [connectors, setConnectors] = useState<ConnectorInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ConnectorInstance | null>(null);
  const [prefilledType, setPrefilledType] = useState<string | undefined>();
  const [toolsConnector, setToolsConnector] =
    useState<ConnectorInstance | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | null>(null);

  const selectedType = Form.useWatch('connector_type', form);
  const watchedFields = Form.useWatch('fields', form) || {};
  const selectedTransport = watchedFields.transport || 'streamable_http';
  const selectedAuthType = watchedFields.auth_type;
  const selectedTemplate = useMemo(
    () => catalog.find((item) => item.type === selectedType),
    [catalog, selectedType],
  );
  const transportMeta =
    TRANSPORT_META[selectedTransport] || TRANSPORT_META.streamable_http;

  const loadCatalog = async () => {
    setCatalogLoading(true);
    try {
      const data = await fetchDbgpt<ConnectorCatalogEntry[]>(
        '/api/v2/serve/connectors/types',
      );
      setCatalog(withCustomMcpTemplate(data || []));
    } catch (err) {
      setCatalog(withCustomMcpTemplate([]));
      throw err;
    } finally {
      setCatalogLoading(false);
    }
  };

  const loadConnectors = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbgpt<ConnectorInstance[]>(
        '/api/v2/serve/connectors/',
      );
      setConnectors(unwrapList(data).map(normalizeConnector));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load tools.');
      setConnectors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog().catch((err) => {
      message.warning(
        err instanceof Error
          ? `Connector catalog unavailable: ${err.message}`
          : 'Connector catalog unavailable.',
      );
    });
    loadConnectors();
  }, []);

  const catalogByType = useMemo(() => {
    return Object.fromEntries(catalog.map((item) => [item.type, item]));
  }, [catalog]);

  const instanceCountByType = useMemo(() => {
    return connectors.reduce<Record<string, number>>((acc, connector) => {
      acc[connector.connector_type] = (acc[connector.connector_type] || 0) + 1;
      return acc;
    }, {});
  }, [connectors]);

  const gridItems = useMemo<GridItem[]>(() => {
    const templates = catalog
      .filter(
        (template) =>
          template.type === 'custom_mcp' || !instanceCountByType[template.type],
      )
      .sort(
        (a, b) =>
          Number(b.type === 'custom_mcp') - Number(a.type === 'custom_mcp'),
      )
      .map((template) => ({
        kind: 'template' as const,
        template,
        instanceCount: 0,
      }));
    const instances = connectors.map((instance) => ({
      kind: 'instance' as const,
      instance,
      template: catalogByType[instance.connector_type],
    }));
    return [...templates, ...instances];
  }, [catalog, catalogByType, connectors, instanceCountByType]);

  const visibleItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return gridItems.filter((item) => {
      if (statusFilter === 'inactive' && item.kind !== 'template') return false;
      if (
        statusFilter === 'active' &&
        (item.kind !== 'instance' || item.instance.status !== 'active')
      ) {
        return false;
      }
      if (
        statusFilter === 'attention' &&
        (item.kind !== 'instance' ||
          !attentionStatuses.has(item.instance.status))
      ) {
        return false;
      }
      if (!keyword) return true;
      const text =
        item.kind === 'template'
          ? `${item.template.display_name} ${item.template.type} ${item.template.description}`
          : `${item.instance.display_name} ${item.instance.connector_type}`;
      return text.toLowerCase().includes(keyword);
    });
  }, [gridItems, search, statusFilter]);

  const openCreate = (type?: string) => {
    const template =
      catalog.find((item) => item.type === type) ||
      (type === CUSTOM_MCP_TEMPLATE.type ? CUSTOM_MCP_TEMPLATE : undefined);
    setEditing(null);
    setPrefilledType(type);
    form.resetFields();
    form.setFieldsValue({
      connector_type: type,
      display_name:
        template && template.is_custom !== true ? template.display_name : '',
      server_uri: '',
      fields: {
        transport: 'streamable_http',
        auth_type: 'none',
      },
    });
    setFormOpen(true);
  };

  const openEdit = (connector: ConnectorInstance) => {
    setEditing(connector);
    setPrefilledType(undefined);
    form.resetFields();
    form.setFieldsValue({
      connector_type: connector.connector_type,
      display_name: connector.display_name,
      server_uri: String(connector.config?.server_uri || ''),
      fields: Object.entries(connector.config || {}).reduce<
        Record<string, string>
      >(
        (acc, [key, value]) => {
          if (key !== 'server_uri' && value != null) acc[key] = String(value);
          return acc;
        },
        {
          transport: 'streamable_http',
          auth_type: 'none',
        },
      ),
    });
    setFormOpen(true);
  };

  useEffect(() => {
    if (!selectedTemplate || editing) return;
    const currentFields = form.getFieldValue('fields') || {};
    const nextFields = {
      transport: 'streamable_http',
      auth_type: 'none',
      ...currentFields,
    };
    selectedTemplate.auth_fields?.forEach((field) => {
      if (
        field.default !== undefined &&
        (nextFields[field.name] === undefined || nextFields[field.name] === '')
      ) {
        nextFields[field.name] = field.default;
      }
    });
    if (
      selectedTemplate.description &&
      selectedTemplate.is_custom !== true &&
      !nextFields.description
    ) {
      nextFields.description = selectedTemplate.description;
    }
    form.setFieldsValue({
      fields: nextFields,
      display_name:
        form.getFieldValue('display_name') ||
        (selectedTemplate.is_custom !== true
          ? selectedTemplate.display_name
          : ''),
    });
  }, [editing, form, selectedTemplate]);

  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const fields = values.fields || {};
      const credentials: Record<string, string> = {};
      const config: Record<string, unknown> = {};
      if (values.server_uri) config.server_uri = values.server_uri;
      if (fields.transport) config.transport = fields.transport;
      if (fields.description) config.description = fields.description;

      selectedTemplate?.auth_fields?.forEach((field) => {
        if (CUSTOM_RENDERED_FIELDS.has(field.name)) return;
        const value = fields[field.name];
        if (value === undefined || value === '') return;
        if (CONNECTOR_CONFIG_FIELDS.has(field.name)) {
          config[field.name] = value;
        } else {
          credentials[field.name] = value;
        }
      });

      const payload = {
        connector_type: values.connector_type,
        display_name: values.display_name,
        credentials,
        config,
      };
      if (editing) {
        await fetchDbgpt(`/api/v2/serve/connectors/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchDbgpt('/api/v2/serve/connectors/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      message.success(editing ? 'Connector updated.' : 'Connector created.');
      setFormOpen(false);
      await loadConnectors();
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Failed to save connector.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const deleteConnector = async (id: string) => {
    try {
      await fetchDbgpt(`/api/v2/serve/connectors/${id}`, {
        method: 'DELETE',
      });
      message.success('Connector deleted.');
      await loadConnectors();
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Failed to delete connector.',
      );
    }
  };

  const testConnector = async (id: string) => {
    try {
      const result = await fetchDbgpt<{ success: boolean; message?: string }>(
        `/api/v2/serve/connectors/${id}/test`,
        { method: 'POST' },
      );
      if (result?.success) {
        message.success(result.message || 'Connection test passed.');
      } else {
        message.error(result?.message || 'Connection test failed.');
      }
      await loadConnectors();
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Failed to test connector.',
      );
    }
  };

  const renderAuthField = (field: ConnectorAuthField) => {
    if (CUSTOM_RENDERED_FIELDS.has(field.name)) return null;
    if (
      field.name === 'token' &&
      !['bearer', 'token'].includes(selectedAuthType || 'none')
    ) {
      return null;
    }
    if (field.name === 'header_name' && selectedAuthType !== 'token') {
      return null;
    }
    const name = ['fields', field.name];
    const fieldRequired =
      field.required && !(Boolean(editing) && field.type === 'password');
    if (field.type === 'select') {
      return (
        <Form.Item
          key={field.name}
          label={field.label}
          name={name}
          rules={[{ required: fieldRequired }]}
          initialValue={field.default}
        >
          <Select>
            {field.options?.map((option) => (
              <Select.Option value={option} key={option}>
                {option}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      );
    }
    return (
      <Form.Item
        key={field.name}
        label={field.label}
        name={name}
        rules={[{ required: fieldRequired }]}
        initialValue={field.default}
      >
        {field.type === 'password' ? (
          <Input.Password />
        ) : (
          <Input type={field.type === 'url' ? 'url' : 'text'} />
        )}
      </Form.Item>
    );
  };

  return (
    <ConstructLayout
      activeKey="tools"
      icon={<ApiOutlined />}
      title="Tools"
      description="Connectors"
      loading={(loading || catalogLoading) && gridItems.length === 0}
      actions={
        <>
          <Button
            icon={<ApiOutlined />}
            onClick={() => openCreate('custom_mcp')}
          >
            Custom MCP
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreate()}
          >
            Add connector
          </Button>
        </>
      }
    >
      <ConstructToolbar
        left={
          <>
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search tools"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: 280 }}
            />
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                size="small"
                type={statusFilter === option.value ? 'primary' : 'default'}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </>
        }
        right={<Tag>{connectors.length} instances</Tag>}
      />

      <Spin spinning={loading || catalogLoading}>
        {error ? (
          <ConstructEmpty
            title="DB-GPT connector service is unavailable"
            description={error}
            action={<Button onClick={() => loadConnectors()}>Retry</Button>}
          />
        ) : visibleItems.length === 0 ? (
          <ConstructEmpty
            title="No connectors found"
            description="Add a connector or clear the current filter. This page does not display fake integrations."
            action={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openCreate()}
              >
                Add connector
              </Button>
            }
          />
        ) : (
          <ConnectorGrid>
            {visibleItems.map((item) => (
              <ConnectorCard
                key={
                  item.kind === 'template'
                    ? `template-${item.template.type}`
                    : `connector-${item.instance.id}`
                }
                item={item}
                onActivate={(template) => openCreate(template.type)}
                onEdit={openEdit}
                onDelete={deleteConnector}
                onTest={testConnector}
                onOpenTools={setToolsConnector}
              />
            ))}
          </ConnectorGrid>
        )}
      </Spin>

      <Modal
        visible={formOpen}
        title={editing ? 'Edit connector' : 'Add connector'}
        width={760}
        destroyOnClose
        confirmLoading={submitting}
        onCancel={() => setFormOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label="Connector type"
            name="connector_type"
            rules={[{ required: true }]}
          >
            <Select disabled={Boolean(prefilledType) || Boolean(editing)}>
              {[...catalog]
                .sort(
                  (a, b) =>
                    Number(b.type === 'custom_mcp') -
                    Number(a.type === 'custom_mcp'),
                )
                .map((item) => (
                  <Select.Option value={item.type} key={item.type}>
                    {item.display_name}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
          <Form.Item
            label="Display name"
            name="display_name"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          {selectedType && (
            <Form.Item
              label="Transport"
              name={['fields', 'transport']}
              rules={[{ required: true }]}
              initialValue="streamable_http"
            >
              <Radio.Group>
                {(
                  selectedTemplate?.auth_fields?.find(
                    (field) => field.name === 'transport',
                  )?.options || ['streamable_http', 'sse']
                ).map((option) => (
                  <Radio.Button value={option} key={option}>
                    {option === 'streamable_http'
                      ? 'Streamable HTTP'
                      : option.toUpperCase()}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </Form.Item>
          )}
          {selectedType && (
            <Form.Item
              label={transportMeta.label}
              name="server_uri"
              rules={[
                { required: true, message: 'Please input MCP server URL.' },
                {
                  pattern: /^https?:\/\/.+/i,
                  message: 'Server URL must start with http:// or https://.',
                },
              ]}
              extra={transportMeta.description}
            >
              <Input placeholder={transportMeta.placeholder} />
            </Form.Item>
          )}
          <Form.Item label="Description" name={['fields', 'description']}>
            <Input.TextArea rows={3} />
          </Form.Item>
          {selectedTemplate?.auth_fields?.map(renderAuthField)}
        </Form>
      </Modal>

      <ConnectorToolsModal
        open={Boolean(toolsConnector)}
        connector={toolsConnector}
        onClose={() => setToolsConnector(null)}
      />
    </ConstructLayout>
  );
}
