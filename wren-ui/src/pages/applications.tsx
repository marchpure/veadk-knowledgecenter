import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Form,
  InputNumber,
  Input,
  Menu,
  Modal,
  Pagination,
  Select,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import ApiOutlined from '@ant-design/icons/ApiOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import CodeOutlined from '@ant-design/icons/CodeOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import DeploymentUnitOutlined from '@ant-design/icons/DeploymentUnitOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import EllipsisOutlined from '@ant-design/icons/EllipsisOutlined';
import FileExcelOutlined from '@ant-design/icons/FileExcelOutlined';
import FileOutlined from '@ant-design/icons/FileOutlined';
import ForkOutlined from '@ant-design/icons/ForkOutlined';
import GlobalOutlined from '@ant-design/icons/GlobalOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';
import PictureOutlined from '@ant-design/icons/PictureOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import ReadOutlined from '@ant-design/icons/ReadOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';
import StopOutlined from '@ant-design/icons/StopOutlined';
import ToolOutlined from '@ant-design/icons/ToolOutlined';
import styled from 'styled-components';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  ConstructEmpty,
  ConstructLayout,
  ConstructToolbar,
  StatusTag,
} from '@/components/construct/ConstructLayout';
import {
  DbgptApp,
  DbgptAgent,
  DbgptAppListResponse,
  DbgptAppPayload,
  DbgptAppParamNeed,
  DbgptAppResource,
  DbgptConfigurableParam,
  ConnectorInstance,
  DbgptFlow,
  DbgptNativeScene,
  DbgptPrompt,
  DbgptPromptListResponse,
  DbgptResourceOption,
  DbgptStrategy,
  DbgptTeamMode,
  fetchDbgpt,
  mapFlowDataToReactFlow,
  normalizeConnector,
} from '@/lib/dbgpt';
import {
  createAppDialogue,
  getApiInvocationEndpoint,
  getAppActionHint,
  getAppChatMode,
  getAppCompleteness,
  getAppRuntimeReady,
  getAppResourceCount,
  getAppRuntimeContract,
  getDialogueCreationEndpoint,
  getRecommendQuestions,
} from '@/lib/dbgptRuntime';
import {
  findVeadkDataProductBinding,
  parseResourceConfig,
} from '@/lib/veadkApplicationResources';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;
const PAGE_SIZE = 12;

type TabKey = 'all' | 'published' | 'unpublished';
type AppModalMode = 'create' | 'edit';
type ResourcePublishKind = 'database' | 'knowledge' | 'tool';
type RuntimeStatusTone = 'default' | 'success' | 'error';

type RuntimeStatus = {
  label: string;
  detail?: string;
  tone: RuntimeStatusTone;
};

type ResourceAvailabilityState = 'checking' | 'available' | 'unavailable';

type ResourceAvailability = {
  state: ResourceAvailabilityState;
  label: string;
  detail?: string;
};

type ResourceAvailabilityMap = Record<string, ResourceAvailability>;

type AppFormValues = {
  app_name: string;
  app_describe: string;
  team_mode: string;
};

type ConfigureFormValues = {
  agent_names?: string[];
  agent_details?: Record<string, AgentDetailFormValue>;
  flow_name?: string;
  chat_scene?: string;
  bind_value?: string;
  model?: string;
  temperature?: number;
  max_new_tokens?: number;
  prompt_template?: string;
  recommend_questions?: Array<{ question?: string; valid?: boolean }>;
};

type AgentDetailFormValue = {
  llm_strategy?: string;
  llm_strategy_value?: string[];
  prompt_template?: string;
  resources?: DbgptAppResource[];
};

type CatalogState = {
  agents: DbgptAgent[];
  strategies: DbgptStrategy[];
  strategyValues: string[];
  resourceTypes: string[];
  nativeScenes: DbgptNativeScene[];
  prompts: DbgptPrompt[];
  models: string[];
  flows: DbgptFlow[];
  connectors: ConnectorInstance[];
};

const emptyCatalog: CatalogState = {
  agents: [],
  strategies: [],
  strategyValues: [],
  resourceTypes: [],
  nativeScenes: [],
  prompts: [],
  models: [],
  flows: [],
  connectors: [],
};

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

async function loadCatalogSection<T>(
  label: string,
  request: Promise<T>,
  fallback: T,
) {
  try {
    return { label, data: await request, error: '' };
  } catch (err) {
    return {
      label,
      data: fallback,
      error: `${label}: ${getErrorMessage(err, 'request failed')}`,
    };
  }
}

const tabOptions: Array<{ label: string; value: TabKey }> = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Unpublished', value: 'unpublished' },
];

const AppGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 18px;
`;

const AppCard = styled.div<{ $runtime?: boolean; $interactive?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 378px;
  height: 100%;
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  cursor: ${(props) => (props.$interactive ? 'pointer' : 'default')};
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;

  &:hover {
    border-color: ${(props) =>
      props.$interactive ? 'rgba(40, 103, 245, 0.34)' : undefined};
    box-shadow: ${(props) =>
      props.$interactive
        ? '0 14px 34px rgba(15, 23, 42, 0.10)'
        : '0 8px 26px rgba(15, 23, 42, 0.06)'};
    transform: ${(props) => (props.$interactive ? 'translateY(-1px)' : 'none')};
  }
`;

const AppCardWash = styled.div`
  position: absolute;
  top: -52px;
  right: -52px;
  width: 132px;
  height: 132px;
  border-radius: 999px;
  background: linear-gradient(135deg, #2867f5, #7c3aed);
  filter: blur(30px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;

  ${AppCard}:hover & {
    opacity: 0.2;
  }
`;

const AppIcon = styled.div<{ $color?: string }>`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  color: #fff;
  font-size: 17px;
  background: ${(props) =>
    props.$color || 'linear-gradient(135deg, #2867f5, #4f46e5)'};
`;

const AppHeader = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
`;

const AppTitle = styled.div`
  display: -webkit-box;
  color: #111827;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const AppMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;

  .ant-tag {
    max-width: 100%;
    margin-right: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const AppDescription = styled(Paragraph)`
  && {
    min-height: 40px;
    margin: 14px 0 0;
    color: #475569;
    font-size: 13px;
    line-height: 1.55;
  }
`;

const AppFooter = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.82);
`;

const FooterActions = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: nowrap;

  .ant-btn {
    height: 32px;
  }

  @media (max-width: 520px) {
    flex-wrap: wrap;
  }
`;

const StudioButton = styled(Button)<{ $variant?: 'gradient' | 'soft' }>`
  && {
    border-radius: 7px;
    border: ${(props) =>
      props.$variant === 'gradient'
        ? '0'
        : '1px solid rgba(191, 219, 254, 0.96)'};
    color: ${(props) => (props.$variant === 'gradient' ? '#fff' : '#1e3a8a')};
    background: ${(props) =>
      props.$variant === 'gradient'
        ? 'linear-gradient(135deg, #2867f5, #7c3aed)'
        : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 52%, #f5f3ff 100%)'};
    box-shadow: ${(props) =>
      props.$variant === 'gradient'
        ? '0 8px 20px rgba(40, 103, 245, 0.22)'
        : '0 5px 14px rgba(37, 99, 235, 0.10)'};
    font-weight: 600;
    letter-spacing: 0;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease,
      border-color 0.18s ease,
      background 0.18s ease;

    .anticon {
      color: inherit;
    }
  }

  &&:hover,
  &&:focus {
    border-color: ${(props) =>
      props.$variant === 'gradient' ? 'transparent' : '#a5b4fc'};
    color: ${(props) => (props.$variant === 'gradient' ? '#fff' : '#1d4ed8')};
    background: ${(props) =>
      props.$variant === 'gradient'
        ? 'linear-gradient(135deg, #1d4ed8, #6d28d9)'
        : 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 56%, #f5f3ff 100%)'};
    box-shadow: ${(props) =>
      props.$variant === 'gradient'
        ? '0 12px 26px rgba(40, 103, 245, 0.28)'
        : '0 10px 24px rgba(40, 103, 245, 0.15), 0 0 0 3px rgba(124, 58, 237, 0.08)'};
    transform: translateY(-1px);
  }

  &&[disabled],
  &&.ant-btn-disabled,
  &&[disabled]:hover,
  &&.ant-btn-disabled:hover {
    border-color: #e2e8f0;
    color: #94a3b8;
    background: #f1f5f9;
    box-shadow: none;
    transform: none;
  }
`;

const FilterButton = styled(Button)<{ $active?: boolean }>`
  && {
    border-radius: 7px;
    border: ${(props) =>
      props.$active ? '0' : '1px solid rgba(191, 219, 254, 0.9)'};
    color: ${(props) => (props.$active ? '#fff' : '#1e3a8a')};
    background: ${(props) =>
      props.$active
        ? 'linear-gradient(135deg, #2867f5, #7c3aed)'
        : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 56%, #f5f3ff 100%)'};
    box-shadow: ${(props) =>
      props.$active
        ? '0 8px 18px rgba(40, 103, 245, 0.20)'
        : '0 4px 12px rgba(37, 99, 235, 0.07)'};
    font-weight: 600;
  }

  &&:hover,
  &&:focus {
    border-color: ${(props) => (props.$active ? 'transparent' : '#a5b4fc')};
    color: ${(props) => (props.$active ? '#fff' : '#1d4ed8')};
    background: ${(props) =>
      props.$active
        ? 'linear-gradient(135deg, #1d4ed8, #6d28d9)'
        : 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 56%, #f5f3ff 100%)'};
    box-shadow: ${(props) =>
      props.$active
        ? '0 10px 22px rgba(40, 103, 245, 0.24)'
        : '0 8px 18px rgba(40, 103, 245, 0.11)'};
  }
`;

const FooterMeta = styled.div`
  min-width: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ModeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const ModeCard = styled.button<{ $selected?: boolean }>`
  display: flex;
  width: 100%;
  min-height: 88px;
  padding: 14px;
  border: 1px solid
    ${(props) =>
      props.$selected ? 'rgba(40, 103, 245, 0.72)' : 'rgba(217, 217, 217, 1)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$selected ? 'rgba(40, 103, 245, 0.06)' : '#fff'};
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(40, 103, 245, 0.72);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
  }

  &:disabled {
    cursor: not-allowed;
    background: ${(props) =>
      props.$selected ? 'rgba(15, 23, 42, 0.05)' : '#fff'};
    border-color: ${(props) =>
      props.$selected ? 'rgba(148, 163, 184, 0.72)' : 'rgba(217, 217, 217, 1)'};
    box-shadow: none;
  }
`;

const ModeIcon = styled.img`
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  object-fit: contain;
`;

const ModeContent = styled.div`
  min-width: 0;
  margin-left: 12px;
`;

const ModeName = styled.div`
  color: #111827;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
`;

const ModeDescription = styled.div`
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
`;

const ModalCreateLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(260px, 0.9fr);
  gap: 24px;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const ModeExplainer = styled.aside`
  padding: 18px;
  border-left: 1px solid rgba(226, 232, 240, 0.94);
  background: #f8fafc;

  @media (max-width: 820px) {
    border-left: 0;
    border-top: 1px solid rgba(226, 232, 240, 0.94);
  }
`;

const ModeExplainerHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
`;

const ModeExplainerIcon = styled.span`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 10px;
  background: #fff;
  border: 1px solid rgba(226, 232, 240, 0.94);
`;

const DetailLabel = styled.div`
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
`;

const DetailValue = styled.div`
  margin-top: 4px;
  color: #111827;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
`;

const ConfigureShell = styled.div`
  min-height: calc(100vh - 56px);
`;

const ConfigureHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0 20px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.92);
`;

const ConfigureTitle = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
`;

const ConfigureContent = styled.div`
  max-width: 1320px;
  margin: 0 auto;
  padding-top: 18px;
`;

const BuilderGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`;

const BuilderMain = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
`;

const BuilderAside = styled.aside`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  position: sticky;
  top: 72px;

  @media (max-width: 1120px) {
    position: static;
  }
`;

const BuilderIntro = styled.div`
  padding: 16px 18px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const BuilderIntroHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
`;

const Panel = styled.div`
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const PanelTitle = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
`;

const AgentGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
`;

const AgentOption = styled.div<{ $selected?: boolean }>`
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 8px 10px;
  border: 1px solid
    ${(props) =>
      props.$selected
        ? 'rgba(40, 103, 245, 0.70)'
        : 'rgba(226, 232, 240, 0.96)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$selected ? 'rgba(40, 103, 245, 0.06)' : '#fff'};
  cursor: pointer;
  user-select: none;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(40, 103, 245, 0.58);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
  }
`;

const OptionCheck = styled.span<{ $selected?: boolean; $single?: boolean }>`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  margin: 2px 10px 0 0;
  border: 1px solid
    ${(props) =>
      props.$selected
        ? 'rgba(40, 103, 245, 0.92)'
        : 'rgba(148, 163, 184, 0.9)'};
  border-radius: ${(props) => (props.$single ? '50%' : '4px')};
  background: ${(props) => (props.$selected ? '#2867f5' : '#fff')};

  &::after {
    content: '';
    display: ${(props) => (props.$selected ? 'block' : 'none')};
    width: 6px;
    height: 6px;
    border-radius: ${(props) => (props.$single ? '50%' : '2px')};
    background: #fff;
  }
`;

const AgentDetailBox = styled.div`
  margin-top: 16px;
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #f8fafc;
`;

const ResourceRow = styled.div`
  display: grid;
  grid-template-columns: 1.2fr 1.4fr 1fr auto;
  gap: 10px;
  align-items: center;
  margin-bottom: 10px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const AgentConfigShell = styled.div`
  display: grid;
  grid-template-columns: 192px minmax(0, 1fr);
  min-height: 430px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const AgentTabs = styled.div`
  padding: 10px;
  border-right: 1px solid rgba(226, 232, 240, 0.94);
  background: #f8fafc;

  @media (max-width: 920px) {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    border-right: none;
    border-bottom: 1px solid rgba(226, 232, 240, 0.94);
  }
`;

const AgentTab = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 38px;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-radius: 8px;
  background: ${(props) =>
    props.$active ? 'rgba(40, 103, 245, 0.09)' : 'transparent'};
  color: ${(props) => (props.$active ? '#2867f5' : '#334155')};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(40, 103, 245, 0.07);
  }

  @media (max-width: 920px) {
    width: auto;
    min-width: 150px;
  }
`;

const AgentDetailPanel = styled.div`
  min-width: 0;
  padding: 18px;
`;

const ResourceWorkspace = styled.div`
  display: grid;
  grid-template-columns: 182px minmax(0, 1fr);
  min-height: 390px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const ResourceSidebar = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-right: 1px solid rgba(226, 232, 240, 0.94);
  background: #f8fafc;

  @media (max-width: 920px) {
    border-right: none;
    border-bottom: 1px solid rgba(226, 232, 240, 0.94);
  }
`;

const ResourceList = styled.div`
  display: flex;
  flex: 1;
  min-height: 220px;
  flex-direction: column;
  gap: 4px;
  overflow: auto;
`;

const ResourceTab = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 36px;
  gap: 8px;
  padding: 7px 9px;
  border: 0;
  border-radius: 8px;
  background: ${(props) =>
    props.$active ? 'rgba(40, 103, 245, 0.09)' : 'transparent'};
  color: ${(props) => (props.$active ? '#2867f5' : '#334155')};
  text-align: left;
  cursor: pointer;

  &:hover {
    background: rgba(40, 103, 245, 0.07);
  }
`;

const ResourcePanel = styled.div`
  min-width: 0;
  padding: 16px;
`;

const ConfigSummaryItem = styled.div`
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const InvocationGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
`;

const FieldList = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 0.36fr) minmax(0, 1fr);
  gap: 8px 12px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #f8fafc;
`;

const StepRail = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;

  @media (max-width: 920px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const StepItem = styled.div<{ $done?: boolean; $active?: boolean }>`
  padding: 12px;
  border: 1px solid
    ${(props) =>
      props.$active
        ? 'rgba(40, 103, 245, 0.52)'
        : props.$done
          ? 'rgba(34, 197, 94, 0.38)'
          : 'rgba(226, 232, 240, 0.94)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$active
      ? 'rgba(40, 103, 245, 0.06)'
      : props.$done
        ? 'rgba(34, 197, 94, 0.06)'
        : '#fff'};
`;

const FlowPreviewFrame = styled.div`
  height: 420px;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #f8fafc;
`;

const NativeSceneGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
`;

const NativeSceneCard = styled.button<{ $selected?: boolean }>`
  display: flex;
  align-items: flex-start;
  min-height: 92px;
  gap: 10px;
  padding: 12px;
  border: 1px solid
    ${(props) =>
      props.$selected
        ? 'rgba(40, 103, 245, 0.70)'
        : 'rgba(226, 232, 240, 0.96)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$selected ? 'rgba(40, 103, 245, 0.06)' : '#fff'};
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(40, 103, 245, 0.58);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
  }
`;

const ResourceIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  color: #2867f5;
`;

const LifecyclePanel = styled.div`
  padding: 14px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const LifecycleList = styled.div`
  display: grid;
  gap: 10px;
`;

const LifecycleItem = styled.div<{ $done?: boolean; $active?: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 9px;
  border: 1px solid
    ${(props) =>
      props.$active
        ? 'rgba(40, 103, 245, 0.52)'
        : props.$done
          ? 'rgba(34, 197, 94, 0.38)'
          : 'rgba(226, 232, 240, 0.94)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$active
      ? 'rgba(40, 103, 245, 0.06)'
      : props.$done
        ? 'rgba(34, 197, 94, 0.06)'
        : '#fff'};
`;

const LifecycleDot = styled.span<{ $done?: boolean; $active?: boolean }>`
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 50%;
  color: #fff;
  background: ${(props) =>
    props.$done ? '#22c55e' : props.$active ? '#2867f5' : '#94a3b8'};
  font-size: 12px;
  font-weight: 700;
`;

const ResourceSummaryList = styled.div`
  display: grid;
  gap: 8px;
`;

const RouteSummaryList = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
`;

const ResourceSummaryItem = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #f8fafc;
`;

const ResourcePublishGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const ResourcePublishCard = styled.button<{ $selected?: boolean }>`
  min-height: 104px;
  padding: 12px;
  border: 1px solid
    ${(props) =>
      props.$selected
        ? 'rgba(40, 103, 245, 0.70)'
        : 'rgba(226, 232, 240, 0.96)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$selected ? 'rgba(40, 103, 245, 0.06)' : '#fff'};
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background 0.18s ease;

  &:hover {
    border-color: rgba(40, 103, 245, 0.58);
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.07);
  }

  &:disabled {
    cursor: not-allowed;
    background: #f8fafc;
    color: #94a3b8;
    box-shadow: none;
  }
`;

const ResourcePickerShell = styled.div`
  display: grid;
  gap: 12px;
`;

const BoundResourceGrid = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
`;

const CardSection = styled.div`
  display: grid;
  gap: 8px;
  margin-top: 12px;
`;

const MiniResourceList = styled.div`
  display: grid;
  gap: 6px;
`;

const MiniResourceItem = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
  min-height: 52px;
  padding: 9px 10px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 8px;
  background: #fbfdff;
`;

const ResourceName = styled.div`
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ResourceMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  min-width: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;

  span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ant-tag {
    flex: 0 0 auto;
    margin-right: 0;
    font-size: 12px;
  }
`;

const ResourceOverflow = styled.div`
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
`;

const EmptyResourceHint = styled.div`
  padding: 10px 12px;
  border: 1px dashed rgba(148, 163, 184, 0.58);
  border-radius: 8px;
  color: #64748b;
  font-size: 13px;
  background: #f8fafc;
`;

const StatusPanel = styled.div<{ $tone?: RuntimeStatusTone }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 62px;
  padding: 10px 12px;
  border: 1px solid
    ${(props) =>
      props.$tone === 'error'
        ? 'rgba(251, 146, 60, 0.42)'
        : props.$tone === 'success'
          ? 'rgba(34, 197, 94, 0.28)'
          : 'rgba(147, 197, 253, 0.42)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$tone === 'error'
      ? '#fff7ed'
      : props.$tone === 'success'
        ? '#f0fdf4'
        : '#eff6ff'};
`;

const StatusTitle = styled.div`
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.35;
`;

const StatusDescription = styled.div`
  display: -webkit-box;
  margin-top: 3px;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`;

const QuestionChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .ant-tag {
    max-width: 100%;
    margin-right: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const EntryHint = styled.div`
  margin-top: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.94);
`;

const isPublished = (app: DbgptApp) => String(app.published) === 'true';

const agentIconMap: Record<string, ReactNode> = {
  DataScientist: <BarChartOutlined />,
  ToolExpert: <ToolOutlined />,
  CodeEngineer: <CodeOutlined />,
};

const resourceIconMap: Record<string, ReactNode> = {
  all: <AppstoreOutlined />,
  app: <AppstoreOutlined />,
  database: <DatabaseOutlined />,
  knowledge: <ReadOutlined />,
  internet: <GlobalOutlined />,
  plugin: <AppstoreOutlined />,
  skill: <CodeOutlined />,
  tool: <ToolOutlined />,
  'tool(autogpt_plugins)': <ToolOutlined />,
  'tool(mcp(sse))': <ApiOutlined />,
  text_file: <FileOutlined />,
  excel_file: <FileExcelOutlined />,
  image_file: <PictureOutlined />,
  awel_flow: <DeploymentUnitOutlined />,
};

const getAgentIcon = (name?: string) =>
  name ? agentIconMap[name] || <ForkOutlined /> : <ForkOutlined />;

const getResourceIcon = (type?: string) =>
  type ? resourceIconMap[type] || <AppstoreOutlined /> : <AppstoreOutlined />;

const getAppIcon = (mode?: string) => {
  if (mode === 'native_app') return <AppstoreOutlined />;
  if (mode === 'awel_layout') return <DeploymentUnitOutlined />;
  if (mode === 'auto_plan') return <ForkOutlined />;
  if (mode === 'single_agent') return <ToolOutlined />;
  return <AppstoreOutlined />;
};

const getChatScene = (app: DbgptApp) => {
  const scene = app.team_context?.chat_scene;
  return typeof scene === 'string' && scene ? scene : 'chat_agent';
};

const getModeLabel = (mode: string | undefined, teamModes: DbgptTeamMode[]) => {
  if (!mode) return 'Mode unset';
  const matched = teamModes.find((item) => item.value === mode);
  return matched?.name_en || matched?.name_cn || matched?.name || mode;
};

const getTeamModeIcon = (mode: string) => {
  const knownModes = new Set([
    'auto_plan',
    'awel_layout',
    'native_app',
    'single_agent',
  ]);
  return `/icons/app/${knownModes.has(mode) ? mode : 'single_agent'}.png`;
};

const getModeDescription = (
  mode: string | undefined,
  teamModes: DbgptTeamMode[],
) => {
  if (!mode) return '';
  const matched = teamModes.find((item) => item.value === mode);
  return (
    matched?.description_en || matched?.description || matched?.remark || ''
  );
};

const getModeConfigurationTarget = (mode?: string) => {
  if (mode === 'awel_layout') return 'Workflow assembly';
  if (mode === 'single_agent') return 'Single resource app';
  if (mode === 'auto_plan') return 'Composite resource app';
  if (mode === 'native_app') return 'Native DB-GPT template';
  return 'Resource publication';
};

const resourcePublishLabels: Record<ResourcePublishKind, string> = {
  database: 'Database data product',
  knowledge: 'Knowledge space',
  tool: 'Tool connector',
};

const primaryResourceTypes = new Set(['database', 'knowledge', 'tool']);

const toolResourceTypes = ['tool(mcp(sse))', 'tool', 'tool(autogpt_plugins)'];

const getPublishResourceType = (resource?: DbgptAppResource) => {
  if (!resource?.type) return undefined;
  if (resource.type === 'database') return 'database';
  if (resource.type === 'knowledge') return 'knowledge';
  if (resource.type === 'tool' || resource.type.startsWith('tool(')) {
    return 'tool';
  }
  return undefined;
};

const getAvailablePublishKinds = (resourceTypes: string[]) => {
  const kinds: ResourcePublishKind[] = [];
  if (resourceTypes.includes('database')) kinds.push('database');
  if (resourceTypes.includes('knowledge')) kinds.push('knowledge');
  if (
    resourceTypes.some((type) => type === 'tool' || type.startsWith('tool('))
  ) {
    kinds.push('tool');
  }
  return kinds;
};

const getBestResourceTypeForKind = (
  kind: ResourcePublishKind,
  resourceTypes: string[],
) => {
  if (kind === 'tool') {
    return toolResourceTypes.find((type) => resourceTypes.includes(type));
  }
  return resourceTypes.includes(kind) ? kind : undefined;
};

const getPrimaryResourceSelectionField = (type?: string) => {
  if (type === 'database') return 'db_name';
  if (type === 'knowledge') return 'space_name';
  if (type === 'tool') return 'name';
  if (type === 'tool(autogpt_plugins)') return 'tool_name';
  if (type === 'tool(mcp(sse))') return 'mcp_servers';
  return undefined;
};

const getResourceOptionField = (
  params?: DbgptConfigurableParam[],
  type?: string,
) => {
  const preferred = getPrimaryResourceSelectionField(type);
  const preferredParam = preferred
    ? params?.find((param) => param.param_name === preferred)
    : undefined;
  if (preferredParam?.valid_values) return preferredParam.param_name;
  const optionParam = params?.find(
    (param) =>
      Array.isArray(param.valid_values) && param.valid_values.length > 0,
  );
  return optionParam?.param_name || preferred;
};

const buildResourceConfigFromSelection = ({
  type,
  label,
  key,
  params,
  connector,
}: {
  type: string;
  label?: string;
  key?: string;
  params?: DbgptConfigurableParam[];
  connector?: ConnectorInstance;
}) => {
  const config = buildResourceConfigWithFallbacks(params, label || key);
  const field = getResourceOptionField(params, type);
  if (field && key) config[field] = key;
  if (field === 'mcp_servers' && connector?.config?.server_uri) {
    config.mcp_servers = connector.config.server_uri;
  }
  if (type === 'tool(mcp(sse))' && connector) {
    config.connector_id = connector.id;
    config.connector_type = connector.connector_type;
    config.name = connector.display_name || label || key || 'Tool connector';
    if (connector.config?.auth_type)
      config.auth_type = connector.config.auth_type;
    if (connector.config?.transport)
      config.transport = connector.config.transport;
  }
  if (!config.name) config.name = label || key || 'Resource';
  return config;
};

const buildBoundResource = ({
  type,
  label,
  key,
  params,
  connector,
}: {
  type: string;
  label?: string;
  key?: string;
  params?: DbgptConfigurableParam[];
  connector?: ConnectorInstance;
}): DbgptAppResource => {
  const config = buildResourceConfigFromSelection({
    type,
    label,
    key,
    params,
    connector,
  });
  return {
    name: getResourceDisplayName(type, config, label || key),
    type,
    value: JSON.stringify(config),
    is_dynamic: false,
    context: connector
      ? {
          connector_id: connector.id,
          connector_type: connector.connector_type,
          status: connector.status,
        }
      : null,
    version: 'v2',
  };
};

const getAppConfigurationGaps = (app: DbgptApp) => {
  const gaps: string[] = [];
  if (!app.app_name) gaps.push('Add application name.');
  if (!app.team_mode) gaps.push('Choose a work mode.');

  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const selectedAgents = (app.details || []).filter(
      (detail) => detail.agent_name,
    );
    if (!selectedAgents.length) {
      gaps.push('Select at least one agent.');
    } else if (
      app.team_mode === 'single_agent' &&
      selectedAgents.length !== 1
    ) {
      gaps.push('Single Agent mode must use exactly one agent.');
    }
    if (
      selectedAgents.some(
        (detail) =>
          !(detail.resources || []).length && !detail.prompt_template?.trim(),
      )
    ) {
      gaps.push(
        'Bind at least one resource or prompt for every selected agent.',
      );
    }
  }

  if (app.team_mode === 'awel_layout' && !getAppCompleteness(app)) {
    gaps.push('Choose an AWEL workflow.');
  }

  if (app.team_mode === 'native_app' && !getAppCompleteness(app)) {
    gaps.push('Choose a native app template and bind the required resource.');
  }

  if (!isPublished(app)) gaps.push('Publish the application.');
  return gaps;
};

const getBlockingGaps = (app: DbgptApp) =>
  getAppConfigurationGaps(app).filter(
    (gap) => gap !== 'Publish the application.',
  );

const canPublishApp = (app: DbgptApp) => getBlockingGaps(app).length === 0;

const getWorkModeConfigLabel = (app: DbgptApp) => {
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const agentCount = app.details?.length || 0;
    const resourceCount = getAppResourceCount(app);
    if (!agentCount) return 'No agent selected';
    if (!resourceCount) return 'Agent selected, no bound resources';
    return `${agentCount} agent${agentCount > 1 ? 's' : ''}, ${resourceCount} resource${resourceCount > 1 ? 's' : ''}`;
  }
  if (app.team_mode === 'awel_layout') {
    return getAppCompleteness(app)
      ? (app.team_context?.label as string) ||
          (app.team_context?.name as string) ||
          'Workflow selected'
      : 'No workflow selected';
  }
  if (app.team_mode === 'native_app') {
    return getAppCompleteness(app)
      ? `${getChatScene(app)} configured`
      : 'Native scene or resource missing';
  }
  return 'Mode not configured';
};

const getActionTagColor = (app: DbgptApp) => {
  const hint = getAppActionHint(app);
  if (hint === 'Ready') return 'green';
  if (hint === 'No resources') return 'gold';
  return 'orange';
};

const getBrowserOrigin = () =>
  typeof window === 'undefined' ? '' : window.location.origin;

const getApplicationShareUrl = (app: DbgptApp) => {
  const origin = getBrowserOrigin();
  return `${origin}${Path.ApplicationRun}/${encodeURIComponent(app.app_code)}`;
};

const getDingTalkShareUrl = (app: DbgptApp) => {
  const origin = getBrowserOrigin();
  const mobileUrl = `${origin}/mobile/chat/?chat_scene=${encodeURIComponent(
    getAppChatMode(app),
  )}&app_code=${encodeURIComponent(app.app_code)}`;
  return `dingtalk://dingtalkclient/page/link?url=${encodeURIComponent(
    mobileUrl,
  )}&pc_slide=true`;
};

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

const clearApplicationUrlState = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  url.searchParams.delete('app_code');
  window.history.replaceState(null, '', url.toString());
};

const setApplicationConfigureUrlState = (appCode: string) => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.pathname = Path.Applications;
  url.searchParams.set('mode', 'configure');
  url.searchParams.set('app_code', appCode);
  window.history.replaceState(null, '', url.toString());
};

const normalizeResources = (resources?: DbgptAppResource[]) => {
  return (resources || [])
    .filter((resource) => resource.type)
    .map((resource, index) => ({
      name: resource.name || `Resource ${index + 1}`,
      type: resource.type,
      value: resource.is_dynamic ? '' : resource.value || '',
      is_dynamic: Boolean(resource.is_dynamic),
      context: resource.context ?? null,
      version: resource.version || 'v2',
    }));
};

const getOptionLabel = (
  options: DbgptResourceOption[] | undefined,
  value: unknown,
) => {
  if (typeof value !== 'string' || !value) return undefined;
  const option = options?.find((item) => item.key === value);
  return option?.label || value;
};

const getResourceValueLabel = (resource?: DbgptAppResource) => {
  if (!resource) return '';
  if (resource.is_dynamic) return 'Selected at runtime';
  const config = parseResourceValue(resource.value);
  return (
    getResourceDisplayName(resource.type, config, resource.name) ||
    resource.value ||
    ''
  );
};

const getResourcePrimaryValue = (resource?: DbgptAppResource) => {
  const config = parseResourceValue(resource?.value);
  return (
    config.db_name ||
    config.space_name ||
    config.space ||
    config.tool_name ||
    config.mcp_servers ||
    config.name ||
    config.connector_id ||
    resource?.value ||
    ''
  );
};

const getApplicationResources = (app: DbgptApp) =>
  (app.details || []).flatMap((detail) =>
    (detail.resources || []).map((resource) => ({
      agent: detail.agent_name || 'Agent',
      resource,
    })),
  );

const getApplicationResourceBindings = (app: DbgptApp) => {
  const resources = getApplicationResources(app).map(({ agent, resource }) => ({
    key: `${agent}-${resource.type}-${resource.name}-${resource.value}`,
    type: resource.type || 'resource',
    label: resource.name || resource.type || 'Resource',
    value: getResourceValueLabel(resource),
    owner: agent,
  }));

  const nativeResource = getNativeResourceSummary(app);
  if (nativeResource) {
    resources.push({
      key: `native-${nativeResource.type}-${nativeResource.value}`,
      type: nativeResource.type,
      label: getChatScene(app),
      value: nativeResource.value,
      owner: 'Native template',
    });
  }

  if (app.team_mode === 'awel_layout') {
    const workflowName =
      (app.team_context?.label as string) ||
      (app.team_context?.name as string) ||
      '';
    if (workflowName) {
      resources.push({
        key: `workflow-${workflowName}`,
        type: 'workflow',
        label: workflowName,
        value: 'Composes resources inside the selected workflow',
        owner: 'Workflow',
      });
    }
  }

  return resources;
};

const getResourceAvailabilityKey = (resource: DbgptAppResource) => {
  if (resource.type === 'database') {
    const config = parseResourceConfig(resource.value);
    const dbName =
      typeof config.db_name === 'string'
        ? config.db_name
        : typeof config.database === 'string'
          ? config.database
          : '';
    if (dbName.startsWith('veadk:project:')) return dbName;
  }
  if (resource.type === 'knowledge') {
    const config = parseResourceConfig(resource.value);
    return `knowledge:${String(
      config.space_name ||
        config.space ||
        resource.name ||
        resource.value ||
        '',
    )}`;
  }
  if (resource.type === 'tool' || resource.type?.startsWith('tool(')) {
    const config = parseResourceConfig(resource.value);
    return `tool:${String(
      config.connector_id ||
        config.mcp_servers ||
        config.name ||
        resource.name ||
        '',
    )}`;
  }
  return undefined;
};

const getAppAvailabilityKeys = (app: DbgptApp) => {
  const keys = new Set<string>();
  getApplicationResources(app).forEach(({ resource }) => {
    const key = getResourceAvailabilityKey(resource);
    if (key) keys.add(key);
  });
  const nativeBinding = findVeadkDataProductBinding(app);
  if (nativeBinding) keys.add(nativeBinding.key);
  return Array.from(keys);
};

const getResourcePreflightIssues = (
  app: DbgptApp,
  availability: ResourceAvailabilityMap,
  catalog: CatalogState,
) => {
  const issues: string[] = [];
  const keys = getAppAvailabilityKeys(app);
  keys.forEach((key) => {
    const status = availability[key];
    if (status?.state === 'checking') {
      issues.push(`Checking ${status.label}.`);
    }
    if (status?.state === 'unavailable') {
      issues.push(status.detail || `${status.label} is unavailable.`);
    }
  });

  const hasToolResource = getApplicationResources(app).some(
    ({ resource }) =>
      resource.type === 'tool' || resource.type?.startsWith('tool('),
  );
  if (hasToolResource) {
    const hasActiveConnector = catalog.connectors.some(
      (connector) =>
        connector.status === 'active' && Boolean(connector.config?.server_uri),
    );
    if (!hasActiveConnector) {
      issues.push(
        'No active MCP connector. Activate a connector in Tools before binding it.',
      );
    }
    getApplicationResources(app)
      .filter(
        ({ resource }) =>
          resource.type === 'tool' || resource.type?.startsWith('tool('),
      )
      .forEach(({ resource }) => {
        const config = parseResourceConfig(resource.value);
        const connectorId = String(config.connector_id || '');
        const serverUri = String(config.mcp_servers || '');
        const matched = catalog.connectors.find(
          (connector) =>
            (connectorId && connector.id === connectorId) ||
            (serverUri && connector.config?.server_uri === serverUri),
        );
        if (matched && matched.status !== 'active') {
          issues.push(
            `MCP connector ${matched.display_name} is ${matched.status}. Activate it in Tools before publishing.`,
          );
        }
        if (
          (connectorId || serverUri) &&
          !matched &&
          catalog.connectors.length
        ) {
          issues.push(
            'Bound MCP connector is unavailable in the current runtime. Refresh resources or rebind it from Tools.',
          );
        }
      });
  }

  if (app.team_mode === 'awel_layout') {
    const hasWorkflow = Boolean(
      app.team_context?.name || app.team_context?.uid,
    );
    if (!catalog.flows.length) {
      issues.push(
        'No deployed workflow available. Create or deploy a workflow before publishing a workflow application.',
      );
    } else if (!hasWorkflow) {
      issues.push('Choose a deployed workflow before publishing.');
    }
  }

  return Array.from(new Set(issues));
};

const getActionDisabledReason = ({
  app,
  action,
  dirty,
  availability,
  catalog,
}: {
  app: DbgptApp;
  action: 'start' | 'publish' | 'save' | 'bind';
  dirty?: boolean;
  availability: ResourceAvailabilityMap;
  catalog: CatalogState;
}) => {
  const preflightIssues = getResourcePreflightIssues(
    app,
    availability,
    catalog,
  );
  if (action === 'start') {
    if (!isPublished(app)) return 'Publish required.';
    if (dirty) return 'Save changes before running.';
    if (!getAppRuntimeReady(app)) {
      return (
        getBlockingGaps(app)[0] || 'Complete resource binding before running.'
      );
    }
    return preflightIssues[0];
  }
  if (action === 'publish') {
    if (dirty) return 'Save changes before publishing.';
    if (!canPublishApp(app)) {
      return (
        getBlockingGaps(app)[0] ||
        'Complete resource binding before publishing.'
      );
    }
    return preflightIssues[0];
  }
  if (action === 'save') {
    return preflightIssues[0];
  }
  return preflightIssues[0];
};

const getNativeResourceSummary = (app: DbgptApp) => {
  const resource = app.param_need?.find((item) => item.type === 'resource');
  if (!resource?.value) return undefined;
  return {
    type: String(resource.value),
    value: resource.bind_value || 'Selected at runtime',
  };
};

const getApplicationRuntimeRoute = (app: DbgptApp) => {
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const agents = (app.details || [])
      .map((detail) => detail.agent_name)
      .filter(Boolean);
    const resources = getApplicationResources(app);
    return {
      builderKey: 'details',
      builderValue: agents.length ? agents.join(', ') : 'No agent selected',
      runtimeKey: 'chat_agent',
      runtimeValue: resources.length
        ? resources
            .map(({ resource }) => resource.name || resource.type)
            .join(', ')
        : 'No bound resources',
    };
  }

  if (app.team_mode === 'awel_layout') {
    const workflowName =
      (app.team_context?.label as string) ||
      (app.team_context?.name as string) ||
      '';
    return {
      builderKey: 'team_context',
      builderValue: workflowName || 'No workflow selected',
      runtimeKey: 'chat_agent',
      runtimeValue: workflowName || 'Workflow is not configured',
    };
  }

  if (app.team_mode === 'native_app') {
    const resource = app.param_need?.find((item) => item.type === 'resource');
    return {
      builderKey: 'param_need',
      builderValue: getChatScene(app),
      runtimeKey: getChatScene(app),
      runtimeValue:
        resource?.bind_value ||
        (resource?.value
          ? `${resource.value} selected at runtime`
          : 'No resource required'),
    };
  }

  return {
    builderKey: 'work_mode',
    builderValue: app.team_mode || 'Mode unset',
    runtimeKey: 'app_code',
    runtimeValue: app.app_code || 'Application code unavailable',
  };
};

const getApplicationRuntimeStatus = (
  app: DbgptApp,
  availability: ResourceAvailabilityMap = {},
  catalog: CatalogState = emptyCatalog,
): RuntimeStatus => {
  const preflightIssues = getResourcePreflightIssues(
    app,
    availability,
    catalog,
  );
  if (preflightIssues.length) {
    const checking = preflightIssues[0].startsWith('Checking ');
    return {
      label: checking ? 'Checking runtime' : 'Runtime unavailable',
      detail: preflightIssues[0],
      tone: checking ? 'default' : 'error',
    };
  }
  if (isPublished(app) && getAppRuntimeReady(app)) {
    return {
      label: 'Ready',
      detail:
        'Configuration is complete and published. Recent run status is shown after runtime execution.',
      tone: 'success',
    };
  }
  if (getAppRuntimeReady(app)) {
    return {
      label: 'Ready to publish',
      detail: 'Configuration is saved; publish to expose Start.',
      tone: 'default',
    };
  }
  const blockingGaps = getBlockingGaps(app);
  return {
    label: 'Needs configuration',
    detail: blockingGaps[0] || getAppActionHint(app),
    tone: 'error',
  };
};

const getRuntimeStatusColor = (status: RuntimeStatus) => {
  if (status.tone === 'success') return 'green';
  if (status.tone === 'error') return 'orange';
  return 'blue';
};

const getDisplayDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

function TeamModeSelect({
  disabled,
  options,
  value,
  onChange,
}: {
  disabled?: boolean;
  options: DbgptTeamMode[];
  value?: string;
  onChange?: (value: string) => void;
}) {
  if (!options.length) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Work modes are unavailable"
        description="The application service did not return a team mode catalog."
      />
    );
  }

  return (
    <ModeGrid>
      {options.map((item) => {
        const selected = item.value === value;
        return (
          <ModeCard
            key={item.value}
            type="button"
            disabled={disabled}
            $selected={selected}
            onClick={() => onChange?.(item.value)}
          >
            <ModeIcon src={getTeamModeIcon(item.value)} alt="" />
            <ModeContent>
              <ModeName>
                {item.name_en || item.name_cn || item.name || item.value}
              </ModeName>
              <ModeDescription>
                {item.description_en || item.description || item.remark}
              </ModeDescription>
            </ModeContent>
          </ModeCard>
        );
      })}
    </ModeGrid>
  );
}

function ApplicationModal({
  open,
  mode,
  app,
  teamModes,
  teamModesLoading,
  teamModeError,
  submitting,
  onCancel,
  onRetryTeamModes,
  onSubmit,
}: {
  open: boolean;
  mode: AppModalMode;
  app?: DbgptApp | null;
  teamModes: DbgptTeamMode[];
  teamModesLoading: boolean;
  teamModeError: string | null;
  submitting: boolean;
  onCancel: () => void;
  onRetryTeamModes: () => void;
  onSubmit: (values: AppFormValues) => void;
}) {
  const [form] = Form.useForm<AppFormValues>();
  const selectedMode = Form.useWatch('team_mode', form);
  const selectedModeInfo = teamModes.find(
    (item) => item.value === selectedMode,
  );
  const modeDescription = getModeDescription(selectedMode, teamModes);
  const modeRemark =
    selectedModeInfo?.remark_en ||
    selectedModeInfo?.remark ||
    selectedModeInfo?.description_en ||
    selectedModeInfo?.description ||
    '';

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      app_name: app?.app_name || '',
      app_describe: app?.app_describe || '',
      team_mode: app?.team_mode || teamModes[0]?.value,
    });
  }, [app?.app_code, form, open, teamModes]);

  return (
    <Modal
      destroyOnClose
      visible={open}
      title={mode === 'edit' ? 'Edit application' : 'Create application'}
      width={900}
      okText={mode === 'edit' ? 'Save' : 'Create'}
      confirmLoading={submitting}
      onCancel={onCancel}
      onOk={() => {
        form.validateFields().then(onSubmit);
      }}
    >
      <Spin spinning={teamModesLoading}>
        {teamModeError && (
          <Alert
            className="mb-4"
            type="error"
            showIcon
            message="Unable to load work modes"
            description={teamModeError}
            action={
              <Button size="small" onClick={onRetryTeamModes}>
                Retry
              </Button>
            }
          />
        )}
        <ModalCreateLayout>
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item
              label="Work mode"
              name="team_mode"
              rules={[{ required: true, message: 'Select a work mode.' }]}
            >
              <TeamModeSelect disabled={mode === 'edit'} options={teamModes} />
            </Form.Item>
            <Form.Item
              label="Application name"
              name="app_name"
              rules={[
                { required: true, message: 'Enter an application name.' },
                { max: 80, message: 'Use 80 characters or fewer.' },
              ]}
            >
              <Input autoComplete="off" placeholder="Application name" />
            </Form.Item>
            <Form.Item
              label="Description"
              name="app_describe"
              rules={[
                { required: true, message: 'Enter a description.' },
                { max: 500, message: 'Use 500 characters or fewer.' },
              ]}
            >
              <Input.TextArea
                autoComplete="off"
                placeholder="Describe what this application does"
                autoSize={{ minRows: 3, maxRows: 7 }}
              />
            </Form.Item>
          </Form>
          <ModeExplainer>
            <ModeExplainerHeader>
              <ModeExplainerIcon>
                {selectedMode ? (
                  <ModeIcon src={getTeamModeIcon(selectedMode)} alt="" />
                ) : (
                  <AppstoreOutlined />
                )}
              </ModeExplainerIcon>
              <div style={{ minWidth: 0 }}>
                <DetailValue>
                  {getModeLabel(selectedMode, teamModes)}
                </DetailValue>
                <DetailLabel>
                  {modeDescription || 'Select a DB-GPT work mode.'}
                </DetailLabel>
              </div>
            </ModeExplainerHeader>
            {modeRemark && (
              <Paragraph className="gray-7 mb-0">{modeRemark}</Paragraph>
            )}
          </ModeExplainer>
        </ModalCreateLayout>
      </Spin>
    </Modal>
  );
}

function ActionButtonWithReason({
  reason,
  children,
}: {
  reason?: string;
  children: ReactElement;
}) {
  if (!reason) return children;
  return (
    <Tooltip title={reason}>
      <span
        aria-label={reason}
        style={{ display: 'inline-block' }}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </span>
    </Tooltip>
  );
}

const parseResourceValue = (value?: string) => {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const parseStrategyValue = (value?: string) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === 'string' ? item : String(item || '')))
        .filter(Boolean);
    }
  } catch {
    // Older DB-GPT records may store this as a comma-separated string.
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && item !== '""');
};

const isComplexOptionList = (values?: DbgptConfigurableParam['valid_values']) =>
  Array.isArray(values) &&
  values.length > 0 &&
  typeof values[0] === 'object' &&
  values[0] !== null &&
  'key' in values[0];

const isBlankParamValue = (value: unknown) =>
  value === undefined || value === null || value === '';

const buildDefaultResourceConfig = (params?: DbgptConfigurableParam[]) => {
  const defaults: Record<string, unknown> = {};
  (params || []).forEach((param) => {
    if (param.nested_fields) return;
    if (
      param.default_value !== undefined &&
      param.default_value !== null &&
      param.default_value !== ''
    ) {
      defaults[param.param_name] = param.default_value;
      return;
    }
    if (
      param.required &&
      Array.isArray(param.valid_values) &&
      param.valid_values.length === 1
    ) {
      const onlyOption = param.valid_values[0];
      defaults[param.param_name] =
        typeof onlyOption === 'object' && onlyOption !== null
          ? (onlyOption as DbgptResourceOption).key
          : onlyOption;
    }
  });
  return defaults;
};

const buildResourceConfigWithFallbacks = (
  params?: DbgptConfigurableParam[],
  fallbackName?: string,
) => {
  const defaults = buildDefaultResourceConfig(params);
  if (params?.some((param) => param.param_name === 'name') && !defaults.name) {
    defaults.name = fallbackName || 'Resource';
  }
  return defaults;
};

const getResourceDisplayName = (
  type?: string,
  values?: Record<string, unknown>,
  fallbackName?: string,
) => {
  if (typeof values?.name === 'string' && values.name) return values.name;
  if (typeof values?.db_name === 'string' && values.db_name)
    return values.db_name;
  if (typeof values?.space === 'string' && values.space) return values.space;
  if (typeof values?.space_name === 'string' && values.space_name)
    return values.space_name;
  if (typeof values?.tool_name === 'string' && values.tool_name)
    return values.tool_name;
  if (typeof values?.app_code === 'string' && values.app_code)
    return values.app_code;
  return fallbackName || type || 'Resource';
};

const normalizeResourceWithSchema = (
  resource: DbgptAppResource,
  params?: DbgptConfigurableParam[],
  fallbackName?: string,
) => {
  if (!resource.type || resource.is_dynamic || !params?.length) {
    return resource;
  }
  const current = parseResourceValue(resource.value);
  const defaults = buildResourceConfigWithFallbacks(
    params,
    fallbackName || resource.name || resource.type,
  );
  let changed = false;
  Object.entries(defaults).forEach(([key, defaultValue]) => {
    if (current[key] === undefined || current[key] === '') {
      current[key] = defaultValue;
      changed = true;
    }
  });
  const displayName = getResourceDisplayName(
    resource.type,
    current,
    resource.name || fallbackName,
  );
  return changed || displayName !== resource.name
    ? { ...resource, name: displayName, value: JSON.stringify(current) }
    : resource;
};

const renderParamInput = (
  param: DbgptConfigurableParam,
  value: unknown,
  onChange: (value: unknown) => void,
) => {
  const type = param.param_type.toLowerCase();
  const fixed = String(param.ext_metadata?.tags || '').includes('fixed');
  const privacy = String(param.ext_metadata?.tags || '').includes('privacy');

  if (type === 'bool' || type === 'boolean') {
    return (
      <Checkbox
        disabled={fixed}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  if (type === 'int' || type === 'integer' || type === 'number') {
    return (
      <InputNumber
        className="w-100"
        disabled={fixed}
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
      />
    );
  }

  if (type === 'float') {
    return (
      <InputNumber
        className="w-100"
        disabled={fixed}
        step={0.1}
        value={typeof value === 'number' ? value : undefined}
        onChange={onChange}
      />
    );
  }

  if (param.valid_values) {
    return (
      <Select
        showSearch
        disabled={fixed}
        allowClear
        value={typeof value === 'string' ? value : undefined}
        onChange={onChange}
      >
        {isComplexOptionList(param.valid_values)
          ? (param.valid_values as DbgptResourceOption[]).map((item) => (
              <Select.Option key={item.key} value={item.key}>
                {item.label || item.key}
              </Select.Option>
            ))
          : (param.valid_values as string[]).map((item) => (
              <Select.Option key={item} value={item}>
                {item}
              </Select.Option>
            ))}
      </Select>
    );
  }

  if (privacy) {
    return (
      <Input.Password
        disabled={fixed}
        autoComplete="new-password"
        value={typeof value === 'string' ? value : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <Input
      disabled={fixed}
      value={typeof value === 'string' ? value : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};

function ResourceParamEditor({
  param,
  value,
  onChange,
}: {
  param: DbgptConfigurableParam;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const requiredMissing = param.required && isBlankParamValue(value);

  if (param.nested_fields) {
    const nestedValue =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    const selectedType =
      typeof nestedValue.type === 'string' ? nestedValue.type : undefined;
    const selectedFields = selectedType
      ? param.nested_fields[selectedType] || []
      : [];
    return (
      <AgentDetailBox style={{ background: '#f8fafc' }}>
        <Form.Item
          label={param.label || param.param_name}
          tooltip={param.description}
          required={param.required}
          validateStatus={requiredMissing ? 'warning' : undefined}
          help={
            requiredMissing
              ? `Select ${param.label || param.param_name}.`
              : undefined
          }
        >
          <Select
            placeholder={`Select ${param.label || param.param_name}`}
            value={selectedType}
            onChange={(nextType) => {
              const defaults = buildDefaultResourceConfig(
                param.nested_fields?.[nextType],
              );
              onChange({ type: nextType, ...defaults });
            }}
          >
            {Object.keys(param.nested_fields).map((type) => (
              <Select.Option key={type} value={type}>
                {type}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        {selectedFields.map((field) => (
          <ResourceParamEditor
            key={field.param_name}
            param={field}
            value={nestedValue[field.param_name] ?? field.default_value}
            onChange={(nextValue) =>
              onChange({
                ...nestedValue,
                type: selectedType,
                [field.param_name]: nextValue,
              })
            }
          />
        ))}
      </AgentDetailBox>
    );
  }

  return (
    <Form.Item
      label={param.label || param.param_name}
      tooltip={param.description}
      required={param.required}
      validateStatus={requiredMissing ? 'warning' : undefined}
      help={
        requiredMissing
          ? `Enter ${param.label || param.param_name}.`
          : undefined
      }
    >
      {renderParamInput(param, value, onChange)}
    </Form.Item>
  );
}

function ResourceEditor({
  agentName,
  value,
  resourceTypes,
  resourceParamSchemas,
  resourceParamLoading,
  resourceOptions,
  onLoadParamSchema,
  onLoadOptions,
  onChange,
}: {
  agentName?: string;
  value?: DbgptAppResource[];
  resourceTypes: string[];
  resourceParamSchemas: Record<string, DbgptConfigurableParam[]>;
  resourceParamLoading: Record<string, boolean>;
  resourceOptions: Record<string, DbgptResourceOption[]>;
  onLoadParamSchema: (type: string) => void;
  onLoadOptions: (type: string) => void;
  onChange?: (value: DbgptAppResource[]) => void;
}) {
  const resources = value || [];
  const availableTypes = resourceTypes.filter((type) => type !== 'all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [filterType, setFilterType] = useState('all');
  const updateAt = (index: number, patch: Partial<DbgptAppResource>) => {
    const next = resources.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item,
    );
    onChange?.(next);
  };

  const filteredResources = resources
    .map((resource, index) => ({ resource, index }))
    .filter(
      ({ resource }) => filterType === 'all' || resource.type === filterType,
    );
  const activeResource = resources[activeIndex];
  const activeParams = activeResource?.type
    ? resourceParamSchemas[activeResource.type]
    : [];
  const activeConfigValues = parseResourceValue(activeResource?.value);
  const preferredResourceType =
    agentName === 'DataScientist'
      ? 'database'
      : agentName === 'ToolExpert'
        ? 'tool'
        : undefined;

  const updateConfig = (index: number, field: string, nextValue: unknown) => {
    const current = parseResourceValue(resources[index]?.value);
    const next = { ...current, [field]: nextValue };
    const label =
      field === 'db_name'
        ? getOptionLabel(resourceOptions.database, nextValue)
        : undefined;
    updateAt(index, {
      value: JSON.stringify(next),
      ...(label ? { name: label } : {}),
    });
  };

  const appendResource = () => {
    const type =
      preferredResourceType && availableTypes.includes(preferredResourceType)
        ? preferredResourceType
        : availableTypes[0];
    if (type) onLoadParamSchema(type);
    if (type) onLoadOptions(type);
    const nextIndex = resources.length;
    onChange?.([
      ...resources,
      {
        name: `Resource ${nextIndex + 1}`,
        type,
        value: JSON.stringify(
          buildResourceConfigWithFallbacks(
            type ? resourceParamSchemas[type] : undefined,
            `Resource ${nextIndex + 1}`,
          ),
        ),
        is_dynamic: false,
        context: null,
        version: 'v2',
      },
    ]);
    setActiveIndex(nextIndex);
    setFilterType('all');
  };

  useEffect(() => {
    const nextResources = resources.map((resource, index) => {
      return normalizeResourceWithSchema(
        resource,
        resource.type ? resourceParamSchemas[resource.type] : undefined,
        resource.name || `Resource ${index + 1}`,
      );
    });
    const changed = JSON.stringify(nextResources) !== JSON.stringify(resources);
    if (changed) onChange?.(nextResources);
  }, [onChange, resourceParamSchemas, resources]);

  useEffect(() => {
    if (activeIndex > resources.length - 1) {
      setActiveIndex(Math.max(resources.length - 1, 0));
    }
  }, [activeIndex, resources.length]);

  useEffect(() => {
    if (
      activeResource?.type &&
      !activeResource.is_dynamic &&
      !resourceParamSchemas[activeResource.type] &&
      !resourceParamLoading[activeResource.type]
    ) {
      onLoadParamSchema(activeResource.type);
      onLoadOptions(activeResource.type);
    }
  }, [
    activeResource?.is_dynamic,
    activeResource?.type,
    onLoadParamSchema,
    resourceParamLoading,
    resourceParamSchemas,
  ]);

  return (
    <ResourceWorkspace>
      <ResourceSidebar>
        <Select
          value={filterType}
          size="small"
          options={[
            { label: 'All', value: 'all' },
            ...availableTypes.map((type) => ({ label: type, value: type })),
          ]}
          onChange={(nextType) => {
            setFilterType(nextType);
            const nextResource = resources.findIndex(
              (resource) => nextType === 'all' || resource.type === nextType,
            );
            setActiveIndex(nextResource >= 0 ? nextResource : 0);
          }}
        />
        <ResourceList>
          {filteredResources.map(({ resource, index }) => (
            <ResourceTab
              key={`${resource.name || 'resource'}-${index}`}
              type="button"
              $active={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <ResourceIcon>{getResourceIcon(resource.type)}</ResourceIcon>
              <Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                {resource.name || resource.type || `Resource ${index + 1}`}
              </Text>
            </ResourceTab>
          ))}
        </ResourceList>
        <Button
          block
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          onClick={appendResource}
        >
          Add resource
        </Button>
      </ResourceSidebar>

      <ResourcePanel>
        {!activeResource ? (
          <Alert
            type="info"
            showIcon
            message="No resource configured"
            description="Add a database, knowledge base, plugin, file, or dynamic runtime resource for this agent."
          />
        ) : (
          <>
            <ResourceRow>
              <Input
                placeholder="Resource name"
                value={activeResource.name}
                onChange={(event) =>
                  updateAt(activeIndex, { name: event.target.value })
                }
              />
              <Select
                placeholder="Resource type"
                value={activeResource.type}
                options={availableTypes.map((type) => ({
                  label: (
                    <span>
                      <ResourceIcon>{getResourceIcon(type)}</ResourceIcon>
                      {type}
                    </span>
                  ),
                  value: type,
                }))}
                onChange={(type) => {
                  onLoadParamSchema(type);
                  onLoadOptions(type);
                  const defaults = buildResourceConfigWithFallbacks(
                    resourceParamSchemas[type],
                    activeResource.name || `Resource ${activeIndex + 1}`,
                  );
                  updateAt(activeIndex, {
                    type,
                    value: Object.keys(defaults).length
                      ? JSON.stringify(defaults)
                      : '',
                    name: activeResource.name || `Resource ${activeIndex + 1}`,
                    context: null,
                    version: 'v2',
                  });
                }}
              />
              <Switch
                checkedChildren="Dynamic"
                unCheckedChildren="Static"
                checked={Boolean(activeResource.is_dynamic)}
                onChange={(checked) =>
                  updateAt(activeIndex, {
                    is_dynamic: checked,
                    value: checked ? '' : activeResource.value,
                    version: 'v2',
                  })
                }
              />
              <Button
                danger
                onClick={() => {
                  const nextResources = resources.filter(
                    (_, idx) => idx !== activeIndex,
                  );
                  onChange?.(nextResources);
                  setActiveIndex(Math.max(activeIndex - 1, 0));
                }}
              >
                Remove
              </Button>
            </ResourceRow>
            {activeResource.type && !activeResource.is_dynamic && (
              <Spin
                spinning={Boolean(resourceParamLoading[activeResource.type])}
              >
                {activeParams?.length ? (
                  activeParams.map((param) => (
                    <ResourceParamEditor
                      key={param.param_name}
                      param={param}
                      value={
                        activeConfigValues[param.param_name] ??
                        param.default_value
                      }
                      onChange={(nextValue) =>
                        updateConfig(activeIndex, param.param_name, nextValue)
                      }
                    />
                  ))
                ) : (
                  <Alert
                    type="info"
                    showIcon
                    message="No configurable parameters returned for this resource type."
                  />
                )}
              </Spin>
            )}
          </>
        )}
      </ResourcePanel>
    </ResourceWorkspace>
  );
}

function ResourcePublishPanel({
  agentName,
  catalog,
  resourceParamSchemas,
  resourceParamLoading,
  resourceOptions,
  resourceLoading,
  resourceAvailability,
  onLoadParamSchema,
  onLoadOptions,
  onCheckAvailability,
  onPendingResourceIssue,
  onValuesMutated,
}: {
  agentName: string;
  catalog: CatalogState;
  resourceParamSchemas: Record<string, DbgptConfigurableParam[]>;
  resourceParamLoading: Record<string, boolean>;
  resourceOptions: Record<string, DbgptResourceOption[]>;
  resourceLoading: Record<string, boolean>;
  resourceAvailability: ResourceAvailabilityMap;
  onLoadParamSchema: (type: string) => void;
  onLoadOptions: (type: string) => void;
  onCheckAvailability: (keys: string[]) => void;
  onPendingResourceIssue: (agentName: string, issue?: string) => void;
  onValuesMutated: () => void;
}) {
  const form = Form.useFormInstance<ConfigureFormValues>();
  const agentDetails = Form.useWatch('agent_details') || {};
  const resources = agentDetails?.[agentName]?.resources || [];
  const availableKinds = getAvailablePublishKinds(catalog.resourceTypes);
  const [kind, setKind] = useState<ResourcePublishKind>(
    availableKinds[0] || 'database',
  );
  const [selectedKey, setSelectedKey] = useState<string>();
  const resourceType = getBestResourceTypeForKind(kind, catalog.resourceTypes);
  const params = resourceType ? resourceParamSchemas[resourceType] : undefined;
  const fieldName = getResourceOptionField(params, resourceType);
  const selectedConnector =
    kind === 'tool'
      ? catalog.connectors.find((connector) => connector.id === selectedKey)
      : undefined;
  const selectableConnectors = catalog.connectors.filter(
    (connector) =>
      connector.status === 'active' && Boolean(connector.config?.server_uri),
  );
  const selectableOptions =
    kind === 'tool'
      ? selectableConnectors.map((connector) => ({
          label: `${connector.display_name} (${connector.connector_type})`,
          value: connector.id,
          description: String(connector.config?.description || ''),
        }))
      : (resourceType ? resourceOptions[resourceType] : []) || [];
  const selectedAvailability =
    kind === 'database' && selectedKey?.startsWith('veadk:project:')
      ? resourceAvailability[selectedKey]
      : undefined;
  const selectedUnavailable =
    selectedAvailability?.state === 'checking' ||
    selectedAvailability?.state === 'unavailable';
  const boundResources = (resources || [])
    .map((resource, index) => ({ resource, index }))
    .filter(({ resource }) => {
      const type = getPublishResourceType(resource);
      return type && primaryResourceTypes.has(type);
    });

  useEffect(() => {
    if (!availableKinds.includes(kind) && availableKinds.length) {
      setKind(availableKinds[0]);
      setSelectedKey(undefined);
    }
  }, [availableKinds, kind]);

  useEffect(() => {
    if (!resourceType) return;
    onLoadParamSchema(resourceType);
    if (kind !== 'tool') onLoadOptions(resourceType);
  }, [kind, onLoadOptions, onLoadParamSchema, resourceType]);

  useEffect(() => {
    if (kind === 'database' && selectedKey?.startsWith('veadk:project:')) {
      onCheckAvailability([selectedKey]);
    }
  }, [kind, onCheckAvailability, selectedKey]);

  useEffect(() => {
    if (kind !== 'database' || !selectedKey?.startsWith('veadk:project:')) {
      onPendingResourceIssue(agentName, undefined);
      return;
    }
    if (
      selectedAvailability?.state === 'checking' ||
      selectedAvailability?.state === 'unavailable'
    ) {
      onPendingResourceIssue(
        agentName,
        selectedAvailability.detail ||
          'Data product is unavailable in the current runtime.',
      );
      return;
    }
    onPendingResourceIssue(agentName, undefined);
  }, [
    agentName,
    kind,
    onPendingResourceIssue,
    selectedAvailability?.detail,
    selectedAvailability?.state,
    selectedKey,
  ]);

  const updateResources = (nextResources: DbgptAppResource[]) => {
    const currentDetails = form.getFieldValue('agent_details') || {};
    const currentAgent = currentDetails[agentName] || {};
    form.setFieldsValue({
      agent_details: {
        ...currentDetails,
        [agentName]: {
          ...currentAgent,
          resources: nextResources,
        },
      },
    });
    window.setTimeout(onValuesMutated, 0);
  };

  const addBoundResource = () => {
    if (!resourceType) {
      message.warning('This runtime does not expose that resource type.');
      return;
    }
    if (resourceParamLoading[resourceType]) {
      message.info('Resource schema is still loading.');
      return;
    }
    const schema = resourceParamSchemas[resourceType];
    if (!schema) {
      onLoadParamSchema(resourceType);
      message.info('Loading resource schema.');
      return;
    }
    if (!selectedKey) {
      message.warning(`Select a ${resourcePublishLabels[kind]}.`);
      return;
    }
    if (selectedUnavailable) {
      message.warning(
        selectedAvailability?.detail ||
          'Data product is unavailable in the current runtime.',
      );
      return;
    }
    const option =
      kind === 'tool'
        ? (
            selectableOptions as Array<{
              label: string;
              value: string;
              description: string;
            }>
          ).find((item) => item.value === selectedKey)
        : (selectableOptions as DbgptResourceOption[]).find(
            (item) => item.key === selectedKey,
          );
    const key =
      kind === 'tool'
        ? String(selectedConnector?.config?.server_uri || '')
        : selectedKey;
    if (kind === 'tool' && !key) {
      message.warning('Selected connector is missing a server URI.');
      return;
    }
    const nextResource = buildBoundResource({
      type: resourceType,
      label: option?.label || selectedKey,
      key,
      params: schema,
      connector: selectedConnector,
    });
    updateResources([...(resources || []), nextResource]);
    setSelectedKey(undefined);
    onPendingResourceIssue(agentName, undefined);
    message.success(`${resourcePublishLabels[kind]} bound.`);
  };

  const removeBoundResource = (index: number) => {
    updateResources(
      (resources || []).filter((_, itemIndex) => itemIndex !== index),
    );
  };

  if (!agentName) return null;

  return (
    <Panel>
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            Publish resources
          </Title>
          <Text className="gray-7">
            Bind a data product, knowledge space, or tool connector from the
            current runtime. Workflow apps compose these same resources in the
            Workflow page before publishing a compound app.
          </Text>
        </div>
        <Tag>{agentName}</Tag>
      </PanelTitle>

      {!availableKinds.length ? (
        <Alert
          type="warning"
          showIcon
          message="Resource catalog is unavailable"
          description="DB-GPT did not return database, knowledge, or tool resource types."
        />
      ) : (
        <ResourcePickerShell>
          <ResourcePublishGrid>
            {(['database', 'knowledge', 'tool'] as ResourcePublishKind[]).map(
              (item) => {
                const enabled = availableKinds.includes(item);
                return (
                  <ResourcePublishCard
                    key={item}
                    data-testid={`resource-publish-kind-${item}`}
                    type="button"
                    disabled={!enabled}
                    $selected={kind === item}
                    onClick={() => {
                      if (!enabled) return;
                      setKind(item);
                      setSelectedKey(undefined);
                    }}
                  >
                    <div className="d-flex align-center">
                      <ResourceIcon>
                        {getResourceIcon(
                          item === 'tool' ? 'tool(mcp(sse))' : item,
                        )}
                      </ResourceIcon>
                      <Text strong>{resourcePublishLabels[item]}</Text>
                    </div>
                    <DetailLabel className="mt-2">
                      {item === 'database'
                        ? 'Publish a WrenAI/DB-GPT database resource as a lightweight app.'
                        : item === 'knowledge'
                          ? 'Publish one DB-GPT knowledge space for Q&A.'
                          : 'Publish an active MCP connector as a tool-backed app.'}
                    </DetailLabel>
                  </ResourcePublishCard>
                );
              },
            )}
          </ResourcePublishGrid>

          <div>
            <DetailLabel>{resourcePublishLabels[kind]}</DetailLabel>
            <Select
              data-testid="resource-publish-select"
              className="w-100 mt-1"
              showSearch
              allowClear
              loading={
                resourceType
                  ? resourceLoading[resourceType] ||
                    resourceParamLoading[resourceType]
                  : false
              }
              placeholder={
                kind === 'tool'
                  ? 'Select an active tool connector'
                  : `Select ${fieldName || kind}`
              }
              value={selectedKey}
              onChange={setSelectedKey}
              options={
                kind === 'tool'
                  ? selectableOptions.map((item) => ({
                      label: item.label,
                      value: item.value,
                    }))
                  : (selectableOptions as DbgptResourceOption[]).map(
                      (item) => ({
                        label: item.label || item.key,
                        value: item.key,
                      }),
                    )
              }
              notFoundContent={
                kind === 'tool'
                  ? 'No active tool connectors. Create one in Tools.'
                  : 'No resources returned by the runtime.'
              }
            />
            {selectedAvailability?.state === 'checking' && (
              <Alert
                className="mt-3"
                type="info"
                showIcon
                message="Checking data product availability"
                description={selectedAvailability.detail}
              />
            )}
            {selectedAvailability?.state === 'unavailable' && (
              <Alert
                className="mt-3"
                type="error"
                showIcon
                message="Data product unavailable"
                description={selectedAvailability.detail}
                action={
                  <Button
                    size="small"
                    onClick={() => onCheckAvailability([selectedKey || ''])}
                  >
                    Refresh resources
                  </Button>
                }
              />
            )}
            {kind === 'tool' && !selectableConnectors.length && (
              <Alert
                className="mt-3"
                type="info"
                showIcon
                message="No active tool connector"
                description="Open Tools to add and test a custom MCP connector. This selector only lists real active connectors."
                action={
                  <Link href={Path.Tools}>
                    <Button size="small">Open Tools</Button>
                  </Link>
                }
              />
            )}
            <Button
              className="mt-3"
              type="primary"
              icon={<PlusOutlined />}
              disabled={!resourceType || !selectedKey || selectedUnavailable}
              onClick={addBoundResource}
            >
              Bind resource
            </Button>
          </div>

          <BoundResourceGrid>
            <DetailLabel>Bound resources</DetailLabel>
            {boundResources.length ? (
              boundResources.map(({ resource, index }) => (
                <ResourceSummaryItem
                  key={`${resource.type}-${resource.name}-${index}`}
                >
                  <ResourceIcon>{getResourceIcon(resource.type)}</ResourceIcon>
                  <div style={{ minWidth: 0 }}>
                    <Text strong ellipsis>
                      {resource.name || resource.type}
                    </Text>
                    <DetailLabel>
                      {String(getResourcePrimaryValue(resource))}
                    </DetailLabel>
                  </div>
                  <Button
                    size="small"
                    danger
                    onClick={() => removeBoundResource(index)}
                  >
                    Remove
                  </Button>
                </ResourceSummaryItem>
              ))
            ) : (
              <Alert
                type="info"
                showIcon
                message="No resources bound yet"
                description="Bind a real runtime resource here, or use advanced parameters below."
              />
            )}
          </BoundResourceGrid>
        </ResourcePickerShell>
      )}
    </Panel>
  );
}

function AgentConfiguration({
  app,
  catalog,
  resourceParamSchemas,
  resourceParamLoading,
  resourceOptions,
  resourceLoading,
  resourceAvailability,
  onLoadParamSchema,
  onLoadOptions,
  onCheckAvailability,
  onPendingResourceIssue,
  onValuesMutated,
}: {
  app: DbgptApp;
  catalog: CatalogState;
  resourceParamSchemas: Record<string, DbgptConfigurableParam[]>;
  resourceParamLoading: Record<string, boolean>;
  resourceOptions: Record<string, DbgptResourceOption[]>;
  resourceLoading: Record<string, boolean>;
  resourceAvailability: ResourceAvailabilityMap;
  onLoadParamSchema: (type: string) => void;
  onLoadOptions: (type: string) => void;
  onCheckAvailability: (keys: string[]) => void;
  onPendingResourceIssue: (agentName: string, issue?: string) => void;
  onValuesMutated: () => void;
}) {
  const form = Form.useFormInstance<ConfigureFormValues>();
  const selectedAgents = Form.useWatch('agent_names') || [];
  const selectedAgentNames = Array.isArray(selectedAgents)
    ? (selectedAgents as string[])
    : [];
  const selectedAgentKey = selectedAgentNames.join('|');
  const [activeAgent, setActiveAgent] = useState(selectedAgentNames[0] || '');
  const isSingle = app.team_mode === 'single_agent';
  const strategyOptions = catalog.strategies.map((strategy) => ({
    label: strategy.name || strategy.name_cn || strategy.value,
    value: strategy.value,
  }));
  const activeAgentInfo = catalog.agents.find(
    (agent) => agent.name === activeAgent,
  );

  const ensureAgentDefaults = (agentNames: string[]) => {
    const current = form.getFieldValue('agent_details') || {};
    const nextDetails = { ...current };
    let changed = false;
    agentNames.forEach((agentName) => {
      if (!nextDetails[agentName]) {
        nextDetails[agentName] = {
          llm_strategy: 'default',
          llm_strategy_value: [],
          prompt_template: undefined,
          resources: [],
        };
        changed = true;
      }
    });
    if (changed) {
      form.setFieldsValue({ agent_details: nextDetails });
    }
  };

  useEffect(() => {
    if (
      selectedAgentNames.length &&
      !selectedAgentNames.includes(activeAgent)
    ) {
      setActiveAgent(selectedAgentNames[0]);
    }
    if (!selectedAgentNames.length && activeAgent) {
      setActiveAgent('');
    }
    ensureAgentDefaults(selectedAgentNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgent, selectedAgentKey]);

  return (
    <Panel>
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            Agents
          </Title>
          <Text className="gray-7">
            {isSingle
              ? 'Select one agent and bind its resources.'
              : 'Select multiple agents and configure each role.'}
          </Text>
        </div>
        <Tag>{selectedAgents.length} selected</Tag>
      </PanelTitle>
      {!catalog.agents.length ? (
        <Alert
          type="warning"
          showIcon
          message="No agents returned by DB-GPT"
          description="Create or enable agents in DB-GPT before this application can run."
        />
      ) : (
        <>
          <Form.Item
            name="agent_names"
            rules={[{ required: true, message: 'Select at least one agent.' }]}
          >
            <AgentSelectCards
              agents={catalog.agents}
              isSingle={isSingle}
              onSelect={(next, selectedAgent) => {
                ensureAgentDefaults(next);
                setActiveAgent(
                  next.includes(selectedAgent) ? selectedAgent : next[0] || '',
                );
              }}
            />
          </Form.Item>

          {selectedAgentNames.length ? (
            <AgentConfigShell>
              <AgentTabs>
                {selectedAgentNames.map((agentName) => {
                  const agent = catalog.agents.find(
                    (item) => item.name === agentName,
                  );
                  return (
                    <AgentTab
                      key={agentName}
                      type="button"
                      $active={agentName === activeAgent}
                      onClick={() => setActiveAgent(agentName)}
                    >
                      <ResourceIcon>{getAgentIcon(agentName)}</ResourceIcon>
                      <Text ellipsis style={{ minWidth: 0 }}>
                        {agent?.label || agentName}
                      </Text>
                    </AgentTab>
                  );
                })}
              </AgentTabs>
              <AgentDetailPanel>
                <PanelTitle>
                  <div style={{ minWidth: 0 }}>
                    <Title level={5} className="mb-0">
                      {activeAgentInfo?.label || activeAgent}
                    </Title>
                    <Paragraph
                      className="gray-7 mt-1 mb-0"
                      ellipsis={{ rows: 2 }}
                    >
                      {activeAgentInfo?.desc ||
                        activeAgentInfo?.describe ||
                        'Configure prompt, model strategy, and resources for this agent.'}
                    </Paragraph>
                  </div>
                  <Tag>{isSingle ? 'Single agent' : 'Agent role'}</Tag>
                </PanelTitle>
                <ResourcePublishPanel
                  agentName={activeAgent}
                  catalog={catalog}
                  resourceParamSchemas={resourceParamSchemas}
                  resourceParamLoading={resourceParamLoading}
                  resourceOptions={resourceOptions}
                  resourceLoading={resourceLoading}
                  resourceAvailability={resourceAvailability}
                  onLoadParamSchema={onLoadParamSchema}
                  onLoadOptions={onLoadOptions}
                  onCheckAvailability={onCheckAvailability}
                  onPendingResourceIssue={onPendingResourceIssue}
                  onValuesMutated={onValuesMutated}
                />
                <Form.Item
                  label="Prompt"
                  name={['agent_details', activeAgent, 'prompt_template']}
                >
                  <Select
                    allowClear
                    showSearch
                    placeholder="Select prompt"
                    options={catalog.prompts.map((prompt) => ({
                      label: prompt.prompt_name,
                      value: prompt.prompt_code,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  label="LLM strategy"
                  name={['agent_details', activeAgent, 'llm_strategy']}
                >
                  <Select options={strategyOptions} />
                </Form.Item>
                <Form.Item
                  noStyle
                  shouldUpdate={(prev, current) =>
                    prev?.agent_details?.[activeAgent]?.llm_strategy !==
                    current?.agent_details?.[activeAgent]?.llm_strategy
                  }
                >
                  {({ getFieldValue }) =>
                    getFieldValue([
                      'agent_details',
                      activeAgent,
                      'llm_strategy',
                    ]) === 'priority' ? (
                      <Form.Item
                        label="Priority models"
                        name={[
                          'agent_details',
                          activeAgent,
                          'llm_strategy_value',
                        ]}
                      >
                        <Select
                          mode="multiple"
                          options={catalog.strategyValues.map((model) => ({
                            label: model,
                            value: model,
                          }))}
                        />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>
                <Form.Item
                  label="Resources"
                  name={['agent_details', activeAgent, 'resources']}
                >
                  <ResourceEditor
                    agentName={activeAgent}
                    resourceTypes={catalog.resourceTypes}
                    resourceParamSchemas={resourceParamSchemas}
                    resourceParamLoading={resourceParamLoading}
                    resourceOptions={resourceOptions}
                    onLoadParamSchema={onLoadParamSchema}
                    onLoadOptions={onLoadOptions}
                  />
                </Form.Item>
              </AgentDetailPanel>
            </AgentConfigShell>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Choose an agent to continue"
              description={
                isSingle
                  ? 'A single-agent application must select exactly one agent before it can be published.'
                  : 'A multi-agent application can select multiple agents and configure each role separately.'
              }
            />
          )}
        </>
      )}
    </Panel>
  );
}

function AgentSelectCards({
  agents,
  isSingle,
  value,
  onChange,
  onSelect,
}: {
  agents: DbgptAgent[];
  isSingle: boolean;
  value?: string[];
  onChange?: (value: string[]) => void;
  onSelect: (value: string[], selectedAgent: string) => void;
}) {
  const selectedAgentNames = Array.isArray(value) ? value : [];
  return (
    <AgentGrid>
      {agents.map((agent) => {
        const selected = selectedAgentNames.includes(agent.name);
        const description = agent.desc || agent.describe || '';
        return (
          <AgentOption
            key={agent.name}
            $selected={selected}
            onClick={() => {
              const next = isSingle
                ? selected
                  ? []
                  : [agent.name]
                : selected
                  ? selectedAgentNames.filter((item) => item !== agent.name)
                  : [...selectedAgentNames, agent.name];
              onSelect(next, agent.name);
              onChange?.(next);
            }}
          >
            <OptionCheck $selected={selected} $single={isSingle} />
            <ResourceIcon>{getAgentIcon(agent.name)}</ResourceIcon>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text strong ellipsis>
                {agent.label || agent.name}
              </Text>
            </div>
            {description && (
              <Tooltip title={description}>
                <Tag style={{ marginRight: 0 }}>{agent.name}</Tag>
              </Tooltip>
            )}
          </AgentOption>
        );
      })}
    </AgentGrid>
  );
}

function AwelConfiguration({ catalog }: { catalog: CatalogState }) {
  const flowName = Form.useWatch('flow_name');
  const selectedFlow = catalog.flows.find((flow) => flow.name === flowName);
  const flowData = selectedFlow?.flow_data
    ? mapFlowDataToReactFlow(selectedFlow.flow_data)
    : undefined;

  return (
    <Panel>
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            AWEL workflow
          </Title>
          <Text className="gray-7">Choose one deployed workflow.</Text>
        </div>
        <Tag>{catalog.flows.length} flows</Tag>
      </PanelTitle>
      {!catalog.flows.length ? (
        <Alert
          type="warning"
          showIcon
          message="No deployed workflow available"
          description="Create or deploy a workflow before publishing a workflow application."
          action={
            <Link href={Path.Workflow}>
              <Button size="small">Open workflow</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Form.Item
            label="Workflow"
            name="flow_name"
            rules={[{ required: true, message: 'Select a workflow.' }]}
          >
            <Select
              showSearch
              placeholder="Select workflow"
              options={catalog.flows.map((flow) => ({
                label: flow.label || flow.name,
                value: flow.name,
              }))}
            />
          </Form.Item>
          {flowData && (
            <FlowPreviewFrame>
              <ReactFlow
                nodes={(flowData.nodes || []) as never[]}
                edges={(flowData.edges || []) as never[]}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                proOptions={{ hideAttribution: true }}
              >
                <Controls showInteractive={false} />
                <Background color="#94a3b8" gap={16} />
              </ReactFlow>
            </FlowPreviewFrame>
          )}
        </>
      )}
    </Panel>
  );
}

function NativeConfiguration({
  catalog,
  resourceOptions,
  resourceLoading,
  onLoadOptions,
}: {
  catalog: CatalogState;
  resourceOptions: Record<string, DbgptResourceOption[]>;
  resourceLoading: Record<string, boolean>;
  onLoadOptions: (type: string) => void;
}) {
  const form = Form.useFormInstance<ConfigureFormValues>();
  const chatScene = Form.useWatch('chat_scene');
  const scene = catalog.nativeScenes.find(
    (item) => item.chat_scene === chatScene,
  );
  const resourceNeed = scene?.param_need?.find(
    (item) => item.type === 'resource',
  );
  const resourceType =
    typeof resourceNeed?.value === 'string' ? resourceNeed.value : undefined;

  useEffect(() => {
    if (resourceType) onLoadOptions(resourceType);
  }, [onLoadOptions, resourceType]);

  return (
    <Panel>
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            Native app template
          </Title>
          <Text className="gray-7">
            Choose a DB-GPT native scene, then either bind a fixed resource or
            let users choose one at runtime.
          </Text>
        </div>
      </PanelTitle>
      <Form.Item name="chat_scene" rules={[{ required: true }]} hidden>
        <Input />
      </Form.Item>
      <Form.Item
        label="Native scene"
        required
        validateStatus={!chatScene ? 'warning' : undefined}
        help={!chatScene ? 'Select a native scene.' : undefined}
      >
        <NativeSceneGrid>
          {catalog.nativeScenes.map((item) => {
            const selected = item.chat_scene === chatScene;
            const type = item.param_need?.find(
              (param) => param.type === 'resource',
            )?.value;
            return (
              <NativeSceneCard
                key={item.chat_scene}
                type="button"
                $selected={selected}
                onClick={() => {
                  form.setFieldsValue({
                    chat_scene: item.chat_scene,
                    bind_value: undefined,
                  });
                }}
              >
                <OptionCheck $selected={selected} $single />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="d-flex align-center">
                    <ResourceIcon>
                      {getResourceIcon(String(type || 'plugin'))}
                    </ResourceIcon>
                    <Text strong>{item.scene_name}</Text>
                  </div>
                  <Paragraph
                    className="gray-7 mt-1 mb-0"
                    ellipsis={{ rows: 2 }}
                  >
                    {item.scene_describe || item.chat_scene}
                  </Paragraph>
                  {type && <Tag className="mt-2">{String(type)}</Tag>}
                </div>
              </NativeSceneCard>
            );
          })}
        </NativeSceneGrid>
      </Form.Item>
      {resourceType && resourceType !== 'excel_file' && (
        <Form.Item label={`Bind ${resourceType}`} name="bind_value">
          <Select
            showSearch
            allowClear
            loading={resourceLoading[resourceType]}
            placeholder={`Select ${resourceType}, or leave empty for runtime selection`}
            options={(resourceOptions[resourceType] || []).map((item) => ({
              label: item.label || item.key,
              value: item.key,
            }))}
          />
        </Form.Item>
      )}
      {resourceType === 'excel_file' && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="Excel apps bind files at runtime"
          description="Upload is handled by the chat runtime, so no static resource is required here."
        />
      )}
      <Form.Item label="Model" name="model">
        <Select
          allowClear
          placeholder="Use default model"
          options={catalog.models.map((model) => ({
            label: model,
            value: model,
          }))}
        />
      </Form.Item>
      <Form.Item label="Prompt" name="prompt_template">
        <Select
          allowClear
          showSearch
          placeholder="Select prompt"
          options={catalog.prompts.map((prompt) => ({
            label: prompt.prompt_name,
            value: prompt.prompt_code,
          }))}
        />
      </Form.Item>
      <Form.Item label="Temperature" name="temperature">
        <InputNumber min={0} max={1} step={0.1} style={{ width: 180 }} />
      </Form.Item>
      <Form.Item label="Max new tokens" name="max_new_tokens">
        <InputNumber min={1} style={{ width: 180 }} />
      </Form.Item>
    </Panel>
  );
}

function RecommendQuestionsEditor() {
  return (
    <Panel>
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            Recommended questions
          </Title>
          <Text className="gray-7">
            Shown to users before they start asking.
          </Text>
        </div>
      </PanelTitle>
      <Form.List name="recommend_questions">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <ResourceRow key={field.key}>
                <Form.Item
                  name={[field.name, 'question']}
                  style={{ marginBottom: 0, gridColumn: 'span 2' }}
                >
                  <Input placeholder={`Question ${index + 1}`} />
                </Form.Item>
                <Form.Item
                  name={[field.name, 'valid']}
                  valuePropName="checked"
                  style={{ marginBottom: 0 }}
                >
                  <Switch checkedChildren="Active" unCheckedChildren="Off" />
                </Form.Item>
                <Button danger onClick={() => remove(field.name)}>
                  Remove
                </Button>
              </ResourceRow>
            ))}
            <Button
              block
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add({ question: '', valid: false })}
            >
              Add question
            </Button>
          </>
        )}
      </Form.List>
    </Panel>
  );
}

function ApplicationBuildSteps({
  app,
  teamModes,
  availability,
  catalog,
  dirty,
}: {
  app: DbgptApp;
  teamModes: DbgptTeamMode[];
  availability?: ResourceAvailabilityMap;
  catalog?: CatalogState;
  dirty?: boolean;
}) {
  const hasBaseInfo = Boolean(app.app_name && app.team_mode);
  const configured = getAppCompleteness(app);
  const runtimeReady = getAppRuntimeReady(app);
  const published = isPublished(app);
  const preflightIssues = getResourcePreflightIssues(
    app,
    availability || {},
    catalog || emptyCatalog,
  );
  const saved = !dirty;
  const canPublish = saved && runtimeReady && !preflightIssues.length;
  const callable = canPublish && published;
  const steps = [
    {
      title: 'Basic info',
      detail: getModeLabel(app.team_mode, teamModes),
      done: hasBaseInfo,
      active: !hasBaseInfo,
    },
    {
      title: 'Work mode',
      detail: app.team_mode
        ? getModeConfigurationTarget(app.team_mode)
        : 'Choose a work mode',
      done: Boolean(app.team_mode),
      active: hasBaseInfo && !app.team_mode,
    },
    {
      title: 'Bind resources',
      detail: preflightIssues[0] || getWorkModeConfigLabel(app),
      done: configured && !preflightIssues.length,
      active: hasBaseInfo && !configured,
    },
    {
      title: 'Save',
      detail: saved ? 'Configuration saved' : 'Unsaved changes',
      done: saved,
      active: configured && dirty,
    },
    {
      title: 'Publish',
      detail: published ? 'Published to runtime' : 'Not published',
      done: published,
      active: canPublish && !published,
    },
    {
      title: 'Run',
      detail: callable
        ? 'Chat/API available'
        : canPublish
          ? 'Waiting for publish'
          : 'Waiting for runtime context',
      done: callable,
      active: callable,
    },
  ];

  return (
    <StepRail>
      {steps.map((step) => (
        <StepItem key={step.title} $done={step.done} $active={step.active}>
          <DetailValue>{step.title}</DetailValue>
          <DetailLabel>{step.detail}</DetailLabel>
        </StepItem>
      ))}
    </StepRail>
  );
}

function ApplicationLifecyclePanel({
  app,
  teamModes,
  availability,
  catalog,
  dirty,
}: {
  app: DbgptApp;
  teamModes: DbgptTeamMode[];
  availability: ResourceAvailabilityMap;
  catalog: CatalogState;
  dirty: boolean;
}) {
  const mode = app.team_mode || '';
  const configured = getAppCompleteness(app);
  const runtimeReady = getAppRuntimeReady(app);
  const published = isPublished(app);
  const preflightIssues = getResourcePreflightIssues(
    app,
    availability,
    catalog,
  );
  const callable =
    runtimeReady && published && !dirty && !preflightIssues.length;
  const resources = getApplicationResources(app);
  const nativeResource = getNativeResourceSummary(app);
  const runtimeRoute = getApplicationRuntimeRoute(app);
  const workflowName =
    (app.team_context?.label as string) ||
    (app.team_context?.name as string) ||
    '';
  const lifecycle = [
    {
      title: 'Create application',
      detail: getModeLabel(mode, teamModes),
      done: Boolean(app.app_code && app.app_name && mode),
      active: !mode,
    },
    {
      title: 'Configure work mode',
      detail: getModeConfigurationTarget(mode),
      done: configured,
      active: Boolean(mode && !configured),
    },
    {
      title: 'Publish',
      detail: published
        ? 'Visible from the application entry'
        : preflightIssues[0] ||
          'Required before users can start a conversation',
      done: published,
      active: runtimeReady && !published && !preflightIssues.length,
    },
    {
      title: 'Start conversation',
      detail: callable
        ? 'Users can ask from the runtime page'
        : 'Blocked until configuration and publish are complete',
      done: callable,
      active: callable,
    },
  ];

  return (
    <>
      <LifecyclePanel>
        <PanelTitle>
          <div>
            <Title level={5} className="mb-0">
              Lifecycle
            </Title>
            <Text className="gray-7">
              Create, configure, publish, then start from the unified runtime.
            </Text>
          </div>
          <Tag>{mode || 'unset'}</Tag>
        </PanelTitle>
        <LifecycleList>
          {lifecycle.map((item, index) => (
            <LifecycleItem
              key={item.title}
              $done={item.done}
              $active={item.active}
            >
              <LifecycleDot $done={item.done} $active={item.active}>
                {item.done ? '✓' : index + 1}
              </LifecycleDot>
              <div style={{ minWidth: 0 }}>
                <DetailValue style={{ marginTop: 0 }}>{item.title}</DetailValue>
                <DetailLabel>{item.detail}</DetailLabel>
              </div>
            </LifecycleItem>
          ))}
        </LifecycleList>
      </LifecyclePanel>

      <LifecyclePanel>
        <PanelTitle>
          <div>
            <Title level={5} className="mb-0">
              Runtime context
            </Title>
            <Text className="gray-7">Resources used when users ask.</Text>
          </div>
          <Tag color={runtimeReady ? 'green' : 'orange'}>
            {preflightIssues.length
              ? 'Unavailable'
              : runtimeReady
                ? 'Ready'
                : 'Needs setup'}
          </Tag>
        </PanelTitle>

        {['single_agent', 'auto_plan'].includes(mode) ? (
          resources.length ? (
            <ResourceSummaryList>
              {resources.map(({ agent, resource }, index) => (
                <ResourceSummaryItem
                  key={`${agent}-${resource.type}-${resource.name}-${index}`}
                >
                  <ResourceIcon>{getResourceIcon(resource.type)}</ResourceIcon>
                  <div style={{ minWidth: 0 }}>
                    <Text strong>{resource.name || resource.type}</Text>
                    <DetailLabel>
                      {agent} / {getResourceValueLabel(resource)}
                    </DetailLabel>
                  </div>
                  <Tag>{resource.type}</Tag>
                </ResourceSummaryItem>
              ))}
            </ResourceSummaryList>
          ) : (
            <Alert
              type="info"
              showIcon
              message="No runtime resource or prompt is configured"
              description="Bind a database, knowledge space, tool, workflow, or prompt before publishing."
            />
          )
        ) : mode === 'awel_layout' ? (
          workflowName ? (
            <ResourceSummaryItem>
              <ResourceIcon>
                <DeploymentUnitOutlined />
              </ResourceIcon>
              <div style={{ minWidth: 0 }}>
                <Text strong>{workflowName}</Text>
                <DetailLabel>AWEL workflow selected for this app</DetailLabel>
              </div>
              <Tag>workflow</Tag>
            </ResourceSummaryItem>
          ) : (
            <Alert
              type="info"
              showIcon
              message="No workflow selected"
              description="Choose one AWEL workflow before publishing."
            />
          )
        ) : mode === 'native_app' ? (
          nativeResource ? (
            <ResourceSummaryItem>
              <ResourceIcon>
                {getResourceIcon(nativeResource.type)}
              </ResourceIcon>
              <div style={{ minWidth: 0 }}>
                <Text strong>{getChatScene(app)}</Text>
                <DetailLabel>{nativeResource.value}</DetailLabel>
              </div>
              <Tag>{nativeResource.type}</Tag>
            </ResourceSummaryItem>
          ) : (
            <Alert
              type="info"
              showIcon
              message="Native template is not configured"
              description="Choose a native scene and bind its resource."
            />
          )
        ) : (
          <Alert
            type="info"
            showIcon
            message="Choose a work mode"
            description="Application behavior depends on DB-GPT work mode."
          />
        )}

        <EntryHint>
          <DetailLabel>User entry</DetailLabel>
          <DetailValue>
            Cards open this builder. The Start action opens the published
            runtime and calls the saved application configuration.
          </DetailValue>
          <RouteSummaryList>
            <ConfigSummaryItem>
              <DetailLabel>Builder configuration</DetailLabel>
              <DetailValue>
                {runtimeRoute.builderKey}: {runtimeRoute.builderValue}
              </DetailValue>
            </ConfigSummaryItem>
            <ConfigSummaryItem>
              <DetailLabel>Runtime route</DetailLabel>
              <DetailValue>
                {runtimeRoute.runtimeKey}: {runtimeRoute.runtimeValue}
              </DetailValue>
            </ConfigSummaryItem>
          </RouteSummaryList>
        </EntryHint>
      </LifecyclePanel>
    </>
  );
}

function ApplicationConfigNotice({ app }: { app: DbgptApp }) {
  const gaps = getAppConfigurationGaps(app);
  const hasResourceGap = gaps.some((gap) =>
    gap.startsWith('Bind at least one resource'),
  );
  const blockingGaps = getBlockingGaps(app);
  if (blockingGaps.length > 0) {
    return (
      <Alert
        className="mt-4"
        type="warning"
        showIcon
        message={blockingGaps[0]}
      />
    );
  }
  if (hasResourceGap) {
    return (
      <Alert
        className="mt-4"
        type="info"
        showIcon
        message="Agent runtime context is missing."
        description="Bind a database, knowledge space, workflow, skill, tool, or prompt before exposing this application to users."
      />
    );
  }
  if (!isPublished(app)) {
    return (
      <Alert
        className="mt-4"
        type="info"
        showIcon
        message="Configuration can be published after saving."
      />
    );
  }
  return (
    <Alert
      className="mt-4"
      type="success"
      showIcon
      message="Published application is ready to run."
    />
  );
}

function ApplicationInvocationPanel({
  app,
  dirty,
}: {
  app: DbgptApp;
  dirty: boolean;
}) {
  const configured = getAppCompleteness(app);
  const published = isPublished(app);
  const callable = getAppRuntimeReady(app) && published && !dirty;
  const appUrl = getApplicationShareUrl(app);
  const dialogueEndpoint = getDialogueCreationEndpoint(app);
  const completionEndpoint = getApiInvocationEndpoint(app);
  const runtimeContract = getAppRuntimeContract(app);

  const copyValue = async (value: string, label: string) => {
    try {
      await copyToClipboard(value);
      message.success(`${label} copied.`);
    } catch {
      message.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  return (
    <Panel className="mt-4">
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            Invocation
          </Title>
          <Text className="gray-7">
            {runtimeContract.title}: run users against the saved application
            configuration and bound resources.
          </Text>
        </div>
        <Tag color={callable ? 'green' : 'orange'}>
          {callable ? 'Callable' : dirty ? 'Save required' : 'Not callable'}
        </Tag>
      </PanelTitle>
      {!callable && (
        <Alert
          className="mb-4"
          type="info"
          showIcon
          message={
            dirty
              ? 'Save these changes before users call the application.'
              : configured
                ? 'Publish this application before exposing it to users.'
                : 'Complete the work mode configuration before publishing.'
          }
        />
      )}
      <InvocationGrid>
        <ConfigSummaryItem>
          <DetailLabel>User entry</DetailLabel>
          <DetailValue>
            <Text copyable={{ text: appUrl }}>{appUrl}</Text>
          </DetailValue>
          <Button
            className="mt-3"
            size="small"
            onClick={() => copyValue(appUrl, 'Application URL')}
          >
            Copy URL
          </Button>
        </ConfigSummaryItem>
        <ConfigSummaryItem>
          <DetailLabel>Dialogue endpoint</DetailLabel>
          <DetailValue>
            <Text copyable={{ text: dialogueEndpoint }}>
              {dialogueEndpoint}
            </Text>
          </DetailValue>
          <DetailLabel className="mt-2">
            {runtimeContract.dialogueMode === 'veadk_data_product'
              ? 'The conversation id is created by the local runtime.'
              : `Creates a ${runtimeContract.dialogueMode} conversation.`}
          </DetailLabel>
        </ConfigSummaryItem>
        <ConfigSummaryItem>
          <DetailLabel>Ask endpoint</DetailLabel>
          <DetailValue>
            <Text copyable={{ text: completionEndpoint }}>
              {completionEndpoint}
            </Text>
          </DetailValue>
          <DetailLabel className="mt-2">
            {runtimeContract.appSelector}
          </DetailLabel>
        </ConfigSummaryItem>
      </InvocationGrid>
      <FieldList>
        {runtimeContract.requestFields.map((field) => (
          <Fragment key={field.label}>
            <DetailLabel>{field.label}</DetailLabel>
            <DetailValue>{field.value}</DetailValue>
          </Fragment>
        ))}
      </FieldList>
      <Alert
        className="mt-3"
        type="info"
        showIcon
        message={runtimeContract.resourceSelector}
      />
    </Panel>
  );
}

function buildConfigureInitialValues(app: DbgptApp): ConfigureFormValues {
  const firstResource = app.param_need?.find(
    (item) => item.type === 'resource',
  );
  const getParam = (type: string) =>
    app.param_need?.find((item) => item.type === type);
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const agentDetails: ConfigureFormValues['agent_details'] = {};
    (app.details || []).forEach((detail) => {
      if (!detail.agent_name) return;
      agentDetails[detail.agent_name] = {
        llm_strategy: detail.llm_strategy || 'default',
        llm_strategy_value: parseStrategyValue(detail.llm_strategy_value),
        prompt_template: detail.prompt_template,
        resources: normalizeResources(detail.resources),
      };
    });
    return {
      agent_names: (app.details || [])
        .map((detail) => detail.agent_name)
        .filter(Boolean) as string[],
      agent_details: agentDetails,
      recommend_questions: getRecommendQuestions(app),
    };
  }
  if (app.team_mode === 'awel_layout') {
    return {
      flow_name:
        typeof app.team_context?.name === 'string'
          ? app.team_context.name
          : undefined,
      recommend_questions: getRecommendQuestions(app),
    };
  }
  if (app.team_mode === 'native_app') {
    return {
      chat_scene:
        typeof app.team_context?.chat_scene === 'string'
          ? app.team_context.chat_scene
          : undefined,
      bind_value: firstResource?.bind_value,
      model: getParam('model')?.value as string | undefined,
      temperature: getParam('temperature')?.value as number | undefined,
      max_new_tokens: getParam('max_new_tokens')?.value as number | undefined,
      prompt_template: getParam('prompt_template')?.value as string | undefined,
      recommend_questions: getRecommendQuestions(app),
    };
  }
  return { recommend_questions: getRecommendQuestions(app) };
}

function buildConfigurePayload(
  app: DbgptApp,
  values: ConfigureFormValues,
  catalog: CatalogState,
  resourceSchemas: Record<string, DbgptConfigurableParam[]> = {},
): DbgptAppPayload {
  const base: DbgptAppPayload = {
    app_code: app.app_code,
    app_name: app.app_name,
    app_describe: app.app_describe,
    team_mode: app.team_mode,
    language: app.language || 'zh',
    recommend_questions: (values.recommend_questions || [])
      .filter((item) => item.question)
      .map((item) => ({
        question: item.question,
        valid: Boolean(item.valid),
      })),
  };

  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    base.details = (values.agent_names || []).map((agentName) => {
      const detail = values.agent_details?.[agentName] || {};
      const strategyValue = Array.isArray(detail.llm_strategy_value)
        ? detail.llm_strategy_value.filter(Boolean).join(',')
        : detail.llm_strategy_value || '';
      const resources = normalizeResources(detail.resources).map(
        (resource, index) =>
          normalizeResourceWithSchema(
            resource,
            resource.type ? resourceSchemas[resource.type] : undefined,
            resource.name || `Resource ${index + 1}`,
          ),
      );
      return {
        agent_name: agentName,
        llm_strategy: detail.llm_strategy || 'default',
        llm_strategy_value:
          detail.llm_strategy === 'priority' ? strategyValue : '',
        prompt_template: detail.prompt_template || '',
        resources,
      };
    });
  }

  if (app.team_mode === 'awel_layout') {
    const flow = catalog.flows.find((item) => item.name === values.flow_name);
    base.team_context = flow || {};
  }

  if (app.team_mode === 'native_app') {
    const scene = catalog.nativeScenes.find(
      (item) => item.chat_scene === values.chat_scene,
    );
    const resourceType = scene?.param_need?.find(
      (item) => item.type === 'resource',
    )?.value;
    base.team_context = scene
      ? {
          chat_scene: scene.chat_scene,
          scene_name: scene.scene_name,
          scene_describe: scene.scene_describe,
          param_title: scene.param_title,
          show_disable: scene.show_disable,
        }
      : {};
    base.param_need = [
      { type: 'model', value: values.model },
      { type: 'temperature', value: values.temperature },
      { type: 'max_new_tokens', value: values.max_new_tokens },
      {
        type: 'resource',
        value: resourceType,
        bind_value: values.bind_value,
      },
      { type: 'prompt_template', value: values.prompt_template },
    ].filter((item) => item.value !== undefined) as DbgptAppParamNeed[];
  }

  return base;
}

function buildConfigureDraftApp(
  app: DbgptApp,
  values: ConfigureFormValues,
  catalog: CatalogState,
  resourceSchemas: Record<string, DbgptConfigurableParam[]> = {},
): DbgptApp {
  const payload = buildConfigurePayload(app, values, catalog, resourceSchemas);
  return {
    ...app,
    ...payload,
    details: payload.details ?? app.details,
    team_context: payload.team_context ?? app.team_context,
    param_need: payload.param_need ?? app.param_need,
    recommend_questions: payload.recommend_questions ?? app.recommend_questions,
  };
}

function buildAppEditPayload(
  app: DbgptApp,
  values: AppFormValues,
): DbgptAppPayload {
  return {
    app_code: app.app_code,
    app_name: values.app_name,
    app_describe: values.app_describe,
    team_mode: app.team_mode || values.team_mode,
    language: app.language || 'zh',
    details: app.details || [],
    team_context: app.team_context || undefined,
    param_need: app.param_need || [],
    recommend_questions: app.recommend_questions || [],
  };
}

const collectMissingResourceParams = (
  params: DbgptConfigurableParam[],
  values: Record<string, unknown>,
  prefix: string,
) => {
  const missing: string[] = [];
  params.forEach((param) => {
    const label = param.label || param.param_name;
    const value = values[param.param_name];
    if (param.nested_fields) {
      const nestedValue =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};
      if (param.required && isBlankParamValue(nestedValue.type)) {
        missing.push(`${prefix}: ${label}`);
        return;
      }
      if (typeof nestedValue.type === 'string') {
        missing.push(
          ...collectMissingResourceParams(
            param.nested_fields[nestedValue.type] || [],
            nestedValue,
            `${prefix}: ${label}`,
          ),
        );
      }
      return;
    }
    if (param.required && isBlankParamValue(value)) {
      missing.push(`${prefix}: ${label}`);
    }
  });
  return missing;
};

const validateConfiguredResources = (
  app: DbgptApp,
  values: ConfigureFormValues,
  resourceSchemas: Record<string, DbgptConfigurableParam[]>,
) => {
  if (!['single_agent', 'auto_plan'].includes(app.team_mode || '')) return;
  const missingSchemas = new Set<string>();
  const missingParams: string[] = [];
  (values.agent_names || []).forEach((agentName) => {
    const resources = values.agent_details?.[agentName]?.resources || [];
    resources.forEach((resource) => {
      if (!resource.type || resource.is_dynamic) return;
      const schema = resourceSchemas[resource.type];
      if (!schema) {
        missingSchemas.add(resource.type);
        return;
      }
      const resourceName = resource.name || resource.type;
      missingParams.push(
        ...collectMissingResourceParams(
          schema,
          parseResourceValue(resource.value),
          `${agentName} / ${resourceName}`,
        ),
      );
    });
  });

  if (missingSchemas.size) {
    throw new Error(
      `Resource parameters are still loading: ${Array.from(missingSchemas).join(
        ', ',
      )}.`,
    );
  }
  if (missingParams.length) {
    throw new Error(`Complete required resource fields: ${missingParams[0]}.`);
  }
};

export default function Applications() {
  const router = useRouter();
  const [configureForm] = Form.useForm<ConfigureFormValues>();
  const [apps, setApps] = useState<DbgptApp[]>([]);
  const [teamModes, setTeamModes] = useState<DbgptTeamMode[]>([]);
  const [catalog, setCatalog] = useState<CatalogState>(emptyCatalog);
  const [resourceOptions, setResourceOptions] = useState<
    Record<string, DbgptResourceOption[]>
  >({});
  const [resourceLoading, setResourceLoading] = useState<
    Record<string, boolean>
  >({});
  const [resourceParamSchemas, setResourceParamSchemas] = useState<
    Record<string, DbgptConfigurableParam[]>
  >({});
  const [resourceParamLoading, setResourceParamLoading] = useState<
    Record<string, boolean>
  >({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeKey, setActiveKey] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [teamModesLoading, setTeamModesLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamModeError, setTeamModeError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AppModalMode>('create');
  const [editingApp, setEditingApp] = useState<DbgptApp | null>(null);
  const [configuringApp, setConfiguringApp] = useState<DbgptApp | null>(null);
  const [configureDraftApp, setConfigureDraftApp] = useState<DbgptApp | null>(
    null,
  );
  const [configureDirty, setConfigureDirty] = useState(false);
  const [pendingResourceIssues, setPendingResourceIssues] = useState<
    Record<string, string>
  >({});
  const [resourceAvailability, setResourceAvailability] =
    useState<ResourceAvailabilityMap>({});

  const checkAvailabilityKeys = useCallback((keys: string[]) => {
    const uniqueKeys = Array.from(new Set(keys)).filter(
      (key) => key && key.startsWith('veadk:project:'),
    );
    if (!uniqueKeys.length) return;
    uniqueKeys.forEach((key) => {
      setResourceAvailability((current) => {
        if (current[key]?.state === 'available') return current;
        return {
          ...current,
          [key]: {
            state: 'checking',
            label: key,
            detail: `Checking ${key}.`,
          },
        };
      });
      const projectId = key.replace('veadk:project:', '');
      fetch(
        `/api/applications/data-products/${encodeURIComponent(
          projectId,
        )}?preflight=1`,
      )
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              payload?.error ||
                `Data product ${projectId} is unavailable in the current runtime.`,
            );
          }
          if (payload?.available === false) {
            throw new Error(
              payload?.error ||
                `Data product ${projectId} is unavailable in the current runtime.`,
            );
          }
          setResourceAvailability((current) => ({
            ...current,
            [key]: {
              state: 'available',
              label: payload?.displayName || key,
              detail: `Data product ${payload?.displayName || projectId} is available.`,
            },
          }));
        })
        .catch((err) => {
          setResourceAvailability((current) => ({
            ...current,
            [key]: {
              state: 'unavailable',
              label: key,
              detail:
                err instanceof Error
                  ? `Data product is unavailable in the current runtime. ${err.message}`
                  : 'Data product is unavailable in the current runtime.',
            },
          }));
        });
    });
  }, []);

  const refreshAppResourcePreflight = useCallback(
    (targetApp: DbgptApp) => {
      const keys = getAppAvailabilityKeys(targetApp);
      if (!keys.length) return;
      setResourceAvailability((current) => {
        const next = { ...current };
        keys.forEach((key) => {
          if (key.startsWith('veadk:project:')) delete next[key];
        });
        return next;
      });
      checkAvailabilityKeys(keys);
    },
    [checkAvailabilityKeys],
  );
  const loadTeamModes = useCallback(async () => {
    setTeamModesLoading(true);
    setTeamModeError(null);
    try {
      const data = await fetchDbgpt<DbgptTeamMode[]>('/api/v1/team-mode/list');
      setTeamModes(data || []);
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : 'Unable to load work modes.';
      setTeamModeError(messageText);
      setTeamModes([]);
    } finally {
      setTeamModesLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const [
        agentsResult,
        strategiesResult,
        strategyValuesResult,
        resourceTypesResult,
        nativeScenesResult,
        promptListResult,
        modelsResult,
        flowsResult,
        connectorsResult,
      ] = await Promise.all([
        loadCatalogSection(
          'Agents',
          fetchDbgpt<DbgptAgent[]>('/api/v1/agents/list'),
          [],
        ),
        loadCatalogSection(
          'LLM strategies',
          fetchDbgpt<DbgptStrategy[]>('/api/v1/llm-strategy/list'),
          [],
        ),
        loadCatalogSection(
          'Priority models',
          fetchDbgpt<string[]>('/api/v1/llm-strategy/value/list?type=priority'),
          [],
        ),
        loadCatalogSection(
          'Resource types',
          fetchDbgpt<string[]>('/api/v1/resource-type/list'),
          [],
        ),
        loadCatalogSection(
          'Native scenes',
          fetchDbgpt<DbgptNativeScene[]>('/api/v1/native_scenes'),
          [],
        ),
        loadCatalogSection(
          'Prompts',
          fetchDbgpt<DbgptPromptListResponse>(
            '/prompt/query_page?page=1&page_size=100000',
            {
              method: 'POST',
              body: JSON.stringify({ page: 1, page_size: 100000 }),
            },
          ),
          {
            items: [],
            total_count: 0,
            total_pages: 0,
            page: 1,
            page_size: 100000,
          },
        ),
        loadCatalogSection(
          'Models',
          fetchDbgpt<string[]>('/api/v1/model/types'),
          [],
        ),
        loadCatalogSection(
          'AWEL flows',
          fetchDbgpt<{
            items: DbgptFlow[];
            total_count: number;
            total_pages: number;
            page: number;
            page_size: number;
          }>('/api/v2/serve/awel/flows?page=1&page_size=10000'),
          {
            items: [],
            total_count: 0,
            total_pages: 0,
            page: 1,
            page_size: 10000,
          },
        ),
        loadCatalogSection(
          'Tool connectors',
          fetchDbgpt<ConnectorInstance[]>('/api/v2/serve/connectors'),
          [],
        ),
      ]);
      setCatalog({
        agents: agentsResult.data || [],
        strategies: strategiesResult.data || [],
        strategyValues: strategyValuesResult.data || [],
        resourceTypes: resourceTypesResult.data || [],
        nativeScenes: nativeScenesResult.data || [],
        prompts: promptListResult.data?.items || [],
        models: modelsResult.data || [],
        flows: flowsResult.data?.items || [],
        connectors: (connectorsResult.data || []).map(normalizeConnector),
      });
      const errors = [
        agentsResult,
        strategiesResult,
        strategyValuesResult,
        resourceTypesResult,
        nativeScenesResult,
        promptListResult,
        modelsResult,
        flowsResult,
        connectorsResult,
      ]
        .map((item) => item.error)
        .filter(Boolean);
      if (errors.length) {
        setCatalogError(errors.join('\n'));
      }
    } catch (err) {
      const messageText = getErrorMessage(err, 'Unable to load app catalog.');
      setCatalogError(messageText);
      setCatalog(emptyCatalog);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadResourceOptions = useCallback(
    async (type: string) => {
      if (!type || resourceOptions[type] || resourceLoading[type]) return;
      setResourceLoading((current) => ({ ...current, [type]: true }));
      try {
        const data = await fetchDbgpt<DbgptResourceOption[]>(
          `/api/v1/app/resources/list?type=${encodeURIComponent(type)}`,
        );
        setResourceOptions((current) => ({
          ...current,
          [type]: data || [],
        }));
      } catch (err) {
        message.warning(
          err instanceof Error
            ? `Unable to load ${type} resources: ${err.message}`
            : `Unable to load ${type} resources.`,
        );
        setResourceOptions((current) => ({ ...current, [type]: [] }));
      } finally {
        setResourceLoading((current) => ({ ...current, [type]: false }));
      }
    },
    [resourceLoading, resourceOptions],
  );

  const loadResourceParamSchema = useCallback(
    async (type: string) => {
      if (!type || resourceParamSchemas[type] || resourceParamLoading[type])
        return;
      setResourceParamLoading((current) => ({ ...current, [type]: true }));
      try {
        const data = await fetchDbgpt<DbgptConfigurableParam[]>(
          `/api/v1/app/resources/list?type=${encodeURIComponent(
            type,
          )}&version=v2`,
        );
        setResourceParamSchemas((current) => ({
          ...current,
          [type]: data || [],
        }));
      } catch (err) {
        message.warning(
          err instanceof Error
            ? `Unable to load ${type} resource parameters: ${err.message}`
            : `Unable to load ${type} resource parameters.`,
        );
        setResourceParamSchemas((current) => ({ ...current, [type]: [] }));
      } finally {
        setResourceParamLoading((current) => ({ ...current, [type]: false }));
      }
    },
    [resourceParamLoading, resourceParamSchemas],
  );

  const loadApps = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const published =
        activeKey === 'published'
          ? 'true'
          : activeKey === 'unpublished'
            ? 'false'
            : undefined;
      const data = await fetchDbgpt<DbgptAppListResponse>(
        `/api/v1/app/list?page=${nextPage}&page_size=${PAGE_SIZE}`,
        {
          method: 'POST',
          body: JSON.stringify({
            page: nextPage,
            page_size: PAGE_SIZE,
            app_name: search || undefined,
            published,
          }),
        },
      );
      setApps(data?.app_list || []);
      setPage(data?.current_page || nextPage);
      setTotal(data?.total_count || 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to load applications.',
      );
      setApps([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps(1);
  }, [activeKey]);

  useEffect(() => {
    loadTeamModes();
  }, [loadTeamModes]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    const keys = apps.flatMap(getAppAvailabilityKeys);
    checkAvailabilityKeys(keys);
  }, [apps, checkAvailabilityKeys]);

  useEffect(() => {
    if (!configureDraftApp) return;
    checkAvailabilityKeys(getAppAvailabilityKeys(configureDraftApp));
  }, [checkAvailabilityKeys, configureDraftApp]);

  const openCreateModal = () => {
    setModalMode('create');
    setEditingApp(null);
    setModalOpen(true);
    if (!teamModes.length && !teamModesLoading) {
      loadTeamModes();
    }
  };

  const openEditModal = (app: DbgptApp) => {
    setModalMode('edit');
    setEditingApp(app);
    setModalOpen(true);
    if (!teamModes.length && !teamModesLoading) {
      loadTeamModes();
    }
  };

  const fetchAppInfo = async (app: DbgptApp) => {
    const info = await fetchDbgpt<DbgptApp>(
      `/api/v1/app/info?chat_scene=${encodeURIComponent(
        getChatScene(app),
      )}&app_code=${encodeURIComponent(app.app_code)}`,
    );
    return { ...app, ...info };
  };

  const openConfigure = async (app: DbgptApp) => {
    if (app.app_code) {
      setApplicationConfigureUrlState(app.app_code);
    }
    setPendingResourceIssues({});
    setConfiguringApp(app);
    try {
      const needsCatalog =
        !catalog.agents.length ||
        !catalog.resourceTypes.length ||
        !catalog.nativeScenes.length;
      if (needsCatalog && !catalogLoading) {
        await loadCatalog();
      }
      const fullApp = await fetchAppInfo(app);
      setConfiguringApp(fullApp);
      setConfigureDraftApp(fullApp);
      setConfigureDirty(false);
      const initialValues = buildConfigureInitialValues(fullApp);
      configureForm.setFieldsValue(initialValues);
      ['database', 'knowledge', 'tool', 'tool(mcp(sse))'].forEach((type) => {
        if (catalog.resourceTypes.includes(type)) {
          loadResourceParamSchema(type);
          if (type !== 'tool(mcp(sse))') loadResourceOptions(type);
        }
      });
      (fullApp.details || []).forEach((detail) => {
        (detail.resources || []).forEach((resource) => {
          if (resource.type) loadResourceParamSchema(resource.type);
        });
      });
      const nativeResourceType = fullApp.param_need?.find(
        (item) => item.type === 'resource',
      )?.value;
      if (typeof nativeResourceType === 'string') {
        loadResourceOptions(nativeResourceType);
      }
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : 'Unable to open app configuration.',
      );
    }
  };

  const updateConfigureDraft = () => {
    if (!configuringApp) return;
    const values = configureForm.getFieldsValue(true) as ConfigureFormValues;
    setConfigureDraftApp(
      buildConfigureDraftApp(
        configuringApp,
        values,
        catalog,
        resourceParamSchemas,
      ),
    );
    setConfigureDirty(true);
  };

  const startChat = async (app: DbgptApp) => {
    const fullApp = await fetchAppInfo(app).catch(() => app);
    const preflightIssues = getResourcePreflightIssues(
      fullApp,
      resourceAvailability,
      catalog,
    );
    if (preflightIssues.length) {
      message.warning(preflightIssues[0]);
      openConfigure(fullApp);
      return;
    }
    if (!isPublished(fullApp)) {
      message.warning('Publish this application before chat.');
      return;
    }
    if (!getAppRuntimeReady(fullApp)) {
      const blockingGaps = getBlockingGaps(fullApp);
      message.warning(
        blockingGaps[0] || 'Complete application configuration before chat.',
      );
      openConfigure(fullApp);
      return;
    }
    setActionLoading(`chat:${fullApp.app_code}`);
    try {
      const dialogue = await createAppDialogue(fullApp);
      setConfiguringApp(null);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          'cur_dialog_info',
          JSON.stringify({
            chat_scene: dialogue.chatMode,
            app_code: fullApp.app_code,
          }),
        );
      }
      router.push({
        pathname: `${Path.ApplicationRun}/[appCode]`,
        query: {
          appCode: fullApp.app_code,
          conv_uid: dialogue.convUid,
        },
      });
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : 'Unable to create application chat.',
      );
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const appCode = params.get('app_code');
    if (mode === 'chat') {
      if (!appCode) return;
      router.replace(`${Path.ApplicationRun}/${encodeURIComponent(appCode)}`);
      return;
    }
    if (mode !== 'configure') return;
    if (!appCode) return;
    if (configuringApp?.app_code === appCode) return;
    openConfigure({
      app_code: appCode,
      app_name: 'Loading application',
      app_describe: '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.mode, router.query.app_code]);

  const copyAppShareLink = async (app: DbgptApp) => {
    try {
      await copyToClipboard(getApplicationShareUrl(app));
      message.success('Application link copied.');
    } catch {
      message.error('Unable to copy application link.');
    }
  };

  const copyDingTalkShareLink = async (app: DbgptApp) => {
    try {
      await copyToClipboard(getDingTalkShareUrl(app));
      message.success('DingTalk link copied.');
    } catch {
      message.error('Unable to copy DingTalk link.');
    }
  };

  const submitApp = async (values: AppFormValues) => {
    setSubmitting(true);
    try {
      const payload: DbgptAppPayload =
        modalMode === 'edit' && editingApp?.app_code
          ? buildAppEditPayload(editingApp, values)
          : {
              language: 'zh',
              app_name: values.app_name,
              app_describe: values.app_describe,
              team_mode: values.team_mode,
            };
      const saved =
        modalMode === 'edit' && editingApp?.app_code
          ? await fetchDbgpt<boolean>('/api/v1/app/edit', {
              method: 'POST',
              body: JSON.stringify(payload),
            }).then(async () =>
              fetchAppInfo({
                ...editingApp,
                ...payload,
              } as DbgptApp),
            )
          : await fetchDbgpt<DbgptApp>('/api/v1/app/create', {
              method: 'POST',
              body: JSON.stringify(payload),
            });
      message.success(
        modalMode === 'edit'
          ? 'Application updated.'
          : 'Application created. Configure its work mode next.',
      );
      setModalOpen(false);
      await loadApps(modalMode === 'edit' ? page : 1);
      if (configuringApp?.app_code === saved?.app_code) {
        const nextApp = { ...configuringApp, ...payload, ...saved };
        setConfiguringApp(nextApp);
        setConfigureDraftApp((current) =>
          current?.app_code === saved.app_code
            ? { ...current, ...payload, ...saved }
            : current,
        );
      }
      if (saved?.app_code && modalMode === 'create') {
        openConfigure(saved);
      }
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Unable to save application.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const persistConfiguration = async (
    app: DbgptApp,
    options?: { silent?: boolean },
  ) => {
    const values = await configureForm.validateFields();
    validateConfiguredResources(app, values, resourceParamSchemas);
    const payload = buildConfigurePayload(
      app,
      values,
      catalog,
      resourceParamSchemas,
    );
    const draftForPreflight: DbgptApp = { ...app, ...payload };
    const preflightIssues = getResourcePreflightIssues(
      draftForPreflight,
      resourceAvailability,
      catalog,
    );
    if (preflightIssues.length) {
      throw new Error(preflightIssues[0]);
    }
    await fetchDbgpt<boolean>('/api/v1/app/edit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const saved = await fetchAppInfo({ ...app, ...payload });
    const nextApp = {
      ...app,
      ...payload,
      ...saved,
      details: payload.details ?? saved.details ?? app.details,
      team_context:
        payload.team_context ?? saved.team_context ?? app.team_context,
      param_need: payload.param_need ?? saved.param_need ?? app.param_need,
      recommend_questions:
        payload.recommend_questions ??
        saved.recommend_questions ??
        app.recommend_questions,
    };
    setConfiguringApp((current) =>
      current?.app_code === nextApp.app_code ? nextApp : current,
    );
    setConfigureDraftApp(nextApp);
    setConfigureDirty(false);
    if (!options?.silent) {
      message.success('Application configuration saved.');
    }
    await loadApps(page);
    return nextApp;
  };

  const operateApp = async (app: DbgptApp) => {
    let targetApp = app;
    if (!isPublished(app) && configuringApp?.app_code === app.app_code) {
      try {
        setSavingConfig(true);
        targetApp = await persistConfiguration(
          configureDraftApp || configuringApp,
          {
            silent: true,
          },
        );
      } catch (err) {
        message.error(
          err instanceof Error
            ? err.message
            : 'Complete application configuration before publishing.',
        );
        setSavingConfig(false);
        return;
      } finally {
        setSavingConfig(false);
      }
    }

    if (!isPublished(targetApp) && !canPublishApp(targetApp)) {
      const blockingGaps = getBlockingGaps(targetApp);
      message.warning(
        blockingGaps[0] ||
          'Complete application configuration before publishing.',
      );
      openConfigure(targetApp);
      return;
    }
    if (!isPublished(targetApp)) {
      const preflightIssues = getResourcePreflightIssues(
        targetApp,
        resourceAvailability,
        catalog,
      );
      if (preflightIssues.length) {
        message.warning(preflightIssues[0]);
        openConfigure(targetApp);
        return;
      }
    }
    const published = isPublished(app);
    const operation = published ? 'unpublish' : 'publish';
    setActionLoading(`${operation}:${targetApp.app_code}`);
    try {
      await fetchDbgpt(`/api/v1/app/${operation}`, {
        method: 'POST',
        body: JSON.stringify({ app_code: targetApp.app_code }),
      });
      message.success(
        published ? 'Application unpublished.' : 'Application published.',
      );
      const nextPublished = published ? 'false' : 'true';
      await loadApps(page);
      if (configuringApp?.app_code === targetApp.app_code) {
        const nextApp = {
          ...configuringApp,
          ...targetApp,
          published: nextPublished,
        };
        setConfiguringApp(nextApp);
        setConfigureDraftApp(nextApp);
        setConfigureDirty(false);
      }
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Unable to update publication.',
      );
    } finally {
      setActionLoading(null);
    }
  };

  const saveConfiguration = async () => {
    if (!configuringApp) return;
    setSavingConfig(true);
    try {
      await persistConfiguration(configureDraftApp || configuringApp);
    } catch (err) {
      message.error(
        err instanceof Error
          ? err.message
          : 'Unable to save application configuration.',
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const deleteApp = async (app: DbgptApp) => {
    setActionLoading(`delete:${app.app_code}`);
    try {
      await fetchDbgpt('/api/v1/app/remove', {
        method: 'POST',
        body: JSON.stringify({ app_code: app.app_code }),
      });
      message.success('Application deleted.');
      if (configuringApp?.app_code === app.app_code) {
        setConfiguringApp(null);
        setConfigureDraftApp(null);
        setConfigureDirty(false);
        clearApplicationUrlState();
      }
      await loadApps(page);
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : 'Unable to delete application.',
      );
    } finally {
      setActionLoading(null);
    }
  };

  const confirmDelete = (app: DbgptApp) => {
    Modal.confirm({
      title: 'Delete application',
      content: `Delete "${app.app_name}"? This action cannot be undone.`,
      okText: 'Delete',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => deleteApp(app),
    });
  };

  const renderAppMenu = (app: DbgptApp) => {
    const published = isPublished(app);
    const startDisabledReason = getActionDisabledReason({
      app,
      action: 'start',
      availability: resourceAvailability,
      catalog,
    });
    const publishDisabledReason = getActionDisabledReason({
      app,
      action: 'publish',
      availability: resourceAvailability,
      catalog,
    });
    const callable = !startDisabledReason;
    return (
      <Menu
        onClick={(info) => {
          info.domEvent.stopPropagation();
          if (info.key === 'chat') startChat(app);
          if (info.key === 'share') copyAppShareLink(app);
          if (info.key === 'dingtalk') copyDingTalkShareLink(app);
          if (info.key === 'configure') openConfigure(app);
          if (info.key === 'edit') openEditModal(app);
          if (info.key === 'publish') operateApp(app);
          if (info.key === 'delete') confirmDelete(app);
        }}
      >
        <Menu.Item key="chat" icon={<SendOutlined />} disabled={!callable}>
          Chat
        </Menu.Item>
        <Menu.Item key="share" icon={<ShareAltOutlined />} disabled={!callable}>
          Copy app link
        </Menu.Item>
        <Menu.Item
          key="dingtalk"
          icon={<ShareAltOutlined />}
          disabled={!callable}
        >
          Copy DingTalk link
        </Menu.Item>
        <Menu.Item key="configure" icon={<AppstoreOutlined />}>
          Configure
        </Menu.Item>
        <Menu.Item key="edit" icon={<EditOutlined />}>
          Edit base info
        </Menu.Item>
        <Menu.Item
          key="publish"
          icon={published ? <StopOutlined /> : <RocketOutlined />}
          disabled={!published && Boolean(publishDisabledReason)}
        >
          {published ? 'Unpublish' : 'Publish'}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item key="delete" danger icon={<DeleteOutlined />}>
          Delete
        </Menu.Item>
      </Menu>
    );
  };

  if (configuringApp) {
    const previewApp = configureDraftApp || configuringApp;
    const pendingResourceReason = Object.values(pendingResourceIssues)[0];
    const saveDisabledReason =
      pendingResourceReason ||
      getActionDisabledReason({
        app: previewApp,
        action: 'save',
        availability: resourceAvailability,
        catalog,
      });
    const publishDisabledReason =
      pendingResourceReason ||
      getActionDisabledReason({
        app: previewApp,
        action: 'publish',
        dirty: configureDirty,
        availability: resourceAvailability,
        catalog,
      });
    const runDisabledReason =
      pendingResourceReason ||
      getActionDisabledReason({
        app: previewApp,
        action: 'start',
        dirty: configureDirty,
        availability: resourceAvailability,
        catalog,
      });
    const callable = !runDisabledReason;
    const operation = isPublished(configuringApp) ? 'unpublish' : 'publish';
    const publishDisabled =
      !isPublished(configuringApp) && Boolean(publishDisabledReason);
    return (
      <ConstructLayout
        activeKey="applications"
        icon={<AppstoreOutlined />}
        title={configuringApp.app_name || 'Application'}
        description="Bind real runtime resources, publish lightweight resource apps, or publish a workflow that composes multiple resources into one application."
        loading={catalogLoading}
        actions={
          <>
            <Button
              icon={<LeftOutlined />}
              onClick={() => {
                setConfiguringApp(null);
                setConfigureDraftApp(null);
                setConfigureDirty(false);
                setPendingResourceIssues({});
                clearApplicationUrlState();
                configureForm.resetFields();
              }}
            >
              Back to apps
            </Button>
            <Tooltip title={saveDisabledReason || ''}>
              <span>
                <Button
                  type="primary"
                  loading={savingConfig}
                  disabled={Boolean(saveDisabledReason)}
                  onClick={saveConfiguration}
                >
                  Save
                </Button>
              </span>
            </Tooltip>
            <Tooltip
              title={
                !isPublished(configuringApp) ? publishDisabledReason || '' : ''
              }
            >
              <span>
                <Button
                  icon={
                    isPublished(configuringApp) ? (
                      <StopOutlined />
                    ) : (
                      <RocketOutlined />
                    )
                  }
                  loading={
                    actionLoading === `${operation}:${configuringApp.app_code}`
                  }
                  disabled={publishDisabled}
                  onClick={() => operateApp(configuringApp)}
                >
                  {isPublished(configuringApp) ? 'Unpublish' : 'Publish'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={runDisabledReason || ''}>
              <span>
                <Button
                  icon={<SendOutlined />}
                  disabled={!callable}
                  loading={actionLoading === `chat:${configuringApp.app_code}`}
                  onClick={() => startChat(configuringApp)}
                >
                  Run
                </Button>
              </span>
            </Tooltip>
          </>
        }
      >
        <ConfigureShell>
          <ConfigureHeader>
            <ConfigureTitle>
              <AppIcon>{getAppIcon(configuringApp.team_mode)}</AppIcon>
              <div style={{ minWidth: 0 }}>
                <Title level={4} className="mb-0">
                  {configuringApp.app_name}
                </Title>
                <AppMeta>
                  <Tag>{getModeLabel(configuringApp.team_mode, teamModes)}</Tag>
                  <StatusTag
                    status={
                      isPublished(configuringApp) ? 'published' : 'unpublished'
                    }
                  />
                  <Tag color={getActionTagColor(configuringApp)}>
                    {getAppActionHint(configuringApp)}
                  </Tag>
                </AppMeta>
              </div>
            </ConfigureTitle>
            <FooterActions>
              <Button
                icon={<EditOutlined />}
                onClick={() => openEditModal(configuringApp)}
              >
                Edit base info
              </Button>
              <Tooltip
                title={
                  !isPublished(configuringApp)
                    ? publishDisabledReason || ''
                    : ''
                }
              >
                <span>
                  <Button
                    icon={
                      isPublished(configuringApp) ? (
                        <StopOutlined />
                      ) : (
                        <RocketOutlined />
                      )
                    }
                    loading={
                      actionLoading ===
                      `${operation}:${configuringApp.app_code}`
                    }
                    disabled={publishDisabled}
                    onClick={() => operateApp(configuringApp)}
                  >
                    {isPublished(configuringApp) ? 'Unpublish' : 'Publish'}
                  </Button>
                </span>
              </Tooltip>
              <Button
                icon={<ShareAltOutlined />}
                disabled={!callable}
                onClick={() => copyAppShareLink(configuringApp)}
              >
                Copy link
              </Button>
            </FooterActions>
          </ConfigureHeader>
          <ApplicationBuildSteps
            app={previewApp}
            teamModes={teamModes}
            availability={resourceAvailability}
            catalog={catalog}
            dirty={configureDirty}
          />
          {runDisabledReason && (
            <Alert
              className="mt-4"
              type={
                runDisabledReason.includes('unavailable') ? 'error' : 'info'
              }
              showIcon
              message="Current runtime status"
              description={runDisabledReason}
              action={
                <Button
                  size="small"
                  onClick={() => refreshAppResourcePreflight(previewApp)}
                >
                  Refresh resources
                </Button>
              }
            />
          )}
          {configureDirty && (
            <Alert
              className="mt-4"
              type="info"
              showIcon
              message="Configuration changes are not saved yet"
              description="Save configuration before publishing or opening the runtime. DB-GPT chat uses the last saved application record."
            />
          )}

          {catalogError && (
            <Alert
              className="mt-4"
              type="error"
              showIcon
              message="Application catalog failed to load"
              description={catalogError}
              action={
                <Button size="small" onClick={loadCatalog}>
                  Retry
                </Button>
              }
            />
          )}

          <Form
            form={configureForm}
            layout="vertical"
            requiredMark={false}
            initialValues={buildConfigureInitialValues(configuringApp)}
            onValuesChange={updateConfigureDraft}
          >
            <ConfigureContent>
              <BuilderGrid>
                <BuilderMain>
                  <BuilderIntro>
                    <BuilderIntroHeader>
                      <div>
                        <Title level={5} className="mb-0">
                          {getModeConfigurationTarget(configuringApp.team_mode)}
                        </Title>
                        <Text className="gray-7">
                          Database, knowledge, and tool resources can be
                          published directly as lightweight apps. Workflow mode
                          publishes a compound app after the Workflow page
                          composes multiple resources.
                        </Text>
                      </div>
                      <Tag>
                        {getModeLabel(configuringApp.team_mode, teamModes)}
                      </Tag>
                    </BuilderIntroHeader>
                  </BuilderIntro>

                  {['single_agent', 'auto_plan'].includes(
                    configuringApp.team_mode || '',
                  ) && (
                    <AgentConfiguration
                      app={configuringApp}
                      catalog={catalog}
                      resourceParamSchemas={resourceParamSchemas}
                      resourceParamLoading={resourceParamLoading}
                      resourceOptions={resourceOptions}
                      resourceLoading={resourceLoading}
                      resourceAvailability={resourceAvailability}
                      onLoadParamSchema={loadResourceParamSchema}
                      onLoadOptions={loadResourceOptions}
                      onCheckAvailability={checkAvailabilityKeys}
                      onPendingResourceIssue={(agentName, issue) => {
                        setPendingResourceIssues((current) => {
                          const next = { ...current };
                          if (issue) {
                            next[agentName] = issue;
                          } else {
                            delete next[agentName];
                          }
                          return next;
                        });
                      }}
                      onValuesMutated={updateConfigureDraft}
                    />
                  )}
                  {configuringApp.team_mode === 'awel_layout' && (
                    <AwelConfiguration catalog={catalog} />
                  )}
                  {configuringApp.team_mode === 'native_app' && (
                    <NativeConfiguration
                      catalog={catalog}
                      resourceOptions={resourceOptions}
                      resourceLoading={resourceLoading}
                      onLoadOptions={loadResourceOptions}
                    />
                  )}
                  <RecommendQuestionsEditor />
                </BuilderMain>
                <BuilderAside>
                  <ApplicationLifecyclePanel
                    app={previewApp}
                    teamModes={teamModes}
                    availability={resourceAvailability}
                    catalog={catalog}
                    dirty={configureDirty}
                  />
                  <ApplicationConfigNotice app={previewApp} />
                  <ApplicationInvocationPanel
                    app={previewApp}
                    dirty={configureDirty}
                  />
                </BuilderAside>
              </BuilderGrid>
            </ConfigureContent>
          </Form>
        </ConfigureShell>
      </ConstructLayout>
    );
  }

  return (
    <ConstructLayout
      activeKey="applications"
      icon={<AppstoreOutlined />}
      title="Applications"
      description="Create DB-GPT applications locally in VeADK, configure their work mode, publish them, then expose chat and API invocation."
      loading={loading && apps.length === 0}
      actions={
        <StudioButton
          $variant="gradient"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
        >
          Create application
        </StudioButton>
      }
    >
      <ConstructToolbar
        left={
          <>
            {tabOptions.map((option) => (
              <FilterButton
                key={option.value}
                size="small"
                $active={activeKey === option.value}
                onClick={() => {
                  setActiveKey(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </FilterButton>
            ))}
            <Input.Search
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search applications"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onSearch={() => loadApps(1)}
              style={{ width: 280 }}
            />
          </>
        }
        right={<Tag>{total} entries</Tag>}
      />

      <Spin spinning={loading}>
        {error && apps.length === 0 ? (
          <ConstructEmpty
            title="Application service is unavailable"
            description={error}
            action={<Button onClick={() => loadApps(1)}>Retry</Button>}
          />
        ) : apps.length === 0 ? (
          <ConstructEmpty
            title="No applications"
            description="Create a DB-GPT application, configure its work mode, then publish it before users can run it."
            action={
              <StudioButton
                $variant="gradient"
                icon={<PlusOutlined />}
                onClick={openCreateModal}
              >
                Create application
              </StudioButton>
            }
          />
        ) : (
          <>
            <AppGrid>
              {apps.map((app) => {
                const published = isPublished(app);
                const startDisabledReason = getActionDisabledReason({
                  app,
                  action: 'start',
                  availability: resourceAvailability,
                  catalog,
                });
                const publishDisabledReason = getActionDisabledReason({
                  app,
                  action: 'publish',
                  availability: resourceAvailability,
                  catalog,
                });
                const callable = !startDisabledReason;
                const canPublishFromCard = !published && !publishDisabledReason;
                const runtimeStatus = getApplicationRuntimeStatus(
                  app,
                  resourceAvailability,
                  catalog,
                );
                const bindings = getApplicationResourceBindings(app);
                const questions = getRecommendQuestions(app)
                  .filter((item) => item.valid !== false && item.question)
                  .slice(0, 1);
                const updatedAt = getDisplayDate(app.updated_at);
                const resourcePreview = bindings.slice(0, 2);
                const statusDetail =
                  runtimeStatus.detail || getAppActionHint(app);
                return (
                  <AppCard
                    key={app.app_code}
                    $interactive
                    role="button"
                    tabIndex={0}
                    onClick={() => openConfigure(app)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openConfigure(app);
                      }
                    }}
                  >
                    <AppCardWash />
                    <AppHeader>
                      <AppIcon>{getAppIcon(app.team_mode)}</AppIcon>
                      <div style={{ minWidth: 0 }}>
                        <AppTitle>{app.app_name}</AppTitle>
                        <AppMeta>
                          {app.team_mode && (
                            <Tag>{getModeLabel(app.team_mode, teamModes)}</Tag>
                          )}
                          <StatusTag
                            status={published ? 'published' : 'unpublished'}
                          />
                          <Tag color={getRuntimeStatusColor(runtimeStatus)}>
                            {runtimeStatus.label}
                          </Tag>
                        </AppMeta>
                      </div>
                    </AppHeader>
                    <AppDescription ellipsis={{ rows: 2 }}>
                      {app.app_describe || 'No description.'}
                    </AppDescription>

                    <CardSection>
                      <DetailLabel>Bound resources</DetailLabel>
                      {bindings.length ? (
                        <MiniResourceList>
                          {resourcePreview.map((binding) => (
                            <MiniResourceItem key={binding.key}>
                              <ResourceIcon>
                                {getResourceIcon(binding.type)}
                              </ResourceIcon>
                              <div style={{ minWidth: 0 }}>
                                <ResourceName title={binding.label}>
                                  {binding.label}
                                </ResourceName>
                                <ResourceMeta>
                                  <span title={binding.owner}>
                                    {binding.owner || 'owner unset'}
                                  </span>
                                  <Tag>{binding.type}</Tag>
                                </ResourceMeta>
                              </div>
                            </MiniResourceItem>
                          ))}
                          {bindings.length > resourcePreview.length && (
                            <ResourceOverflow>
                              +{bindings.length - resourcePreview.length} more
                              resource
                              {bindings.length - resourcePreview.length > 1
                                ? 's'
                                : ''}
                            </ResourceOverflow>
                          )}
                        </MiniResourceList>
                      ) : (
                        <EmptyResourceHint>
                          No resources bound. Configure this application before
                          publishing.
                        </EmptyResourceHint>
                      )}
                    </CardSection>

                    <CardSection>
                      <StatusPanel $tone={runtimeStatus.tone}>
                        <div style={{ minWidth: 0 }}>
                          <StatusTitle>{runtimeStatus.label}</StatusTitle>
                          <StatusDescription title={statusDetail}>
                            {statusDetail}
                          </StatusDescription>
                        </div>
                        {runtimeStatus.tone === 'error' && (
                          <StudioButton
                            size="small"
                            $variant="soft"
                            icon={<ReloadOutlined />}
                            onClick={(event) => {
                              event.stopPropagation();
                              refreshAppResourcePreflight(app);
                            }}
                          >
                            Refresh
                          </StudioButton>
                        )}
                      </StatusPanel>
                    </CardSection>

                    {questions.length > 0 && (
                      <CardSection>
                        <DetailLabel>Recommended questions</DetailLabel>
                        <QuestionChips>
                          {questions.map((item) => (
                            <Tag key={item.question}>{item.question}</Tag>
                          ))}
                        </QuestionChips>
                      </CardSection>
                    )}

                    <AppFooter>
                      <FooterMeta>
                        {app.owner_name || 'owner unset'}
                        {updatedAt ? ` · ${updatedAt}` : ''}
                      </FooterMeta>
                      <FooterActions>
                        <ActionButtonWithReason reason={startDisabledReason}>
                          <StudioButton
                            size="small"
                            $variant="gradient"
                            icon={<SendOutlined />}
                            disabled={!callable}
                            loading={actionLoading === `chat:${app.app_code}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              startChat(app);
                            }}
                          >
                            Start
                          </StudioButton>
                        </ActionButtonWithReason>
                        <StudioButton
                          size="small"
                          $variant="soft"
                          icon={<AppstoreOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openConfigure(app);
                          }}
                        >
                          Configure
                        </StudioButton>
                        <ActionButtonWithReason
                          reason={
                            !published ? publishDisabledReason : undefined
                          }
                        >
                          <StudioButton
                            size="small"
                            $variant="soft"
                            icon={
                              published ? <StopOutlined /> : <RocketOutlined />
                            }
                            disabled={!published && !canPublishFromCard}
                            loading={
                              actionLoading ===
                              `${
                                published ? 'unpublish' : 'publish'
                              }:${app.app_code}`
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              operateApp(app);
                            }}
                          >
                            {published ? 'Unpublish' : 'Publish'}
                          </StudioButton>
                        </ActionButtonWithReason>
                        <Dropdown
                          overlay={renderAppMenu(app)}
                          trigger={['click']}
                        >
                          <StudioButton
                            size="small"
                            $variant="soft"
                            icon={<EllipsisOutlined />}
                            onClick={(event) => event.stopPropagation()}
                          />
                        </Dropdown>
                      </FooterActions>
                    </AppFooter>
                  </AppCard>
                );
              })}
            </AppGrid>
            {total > PAGE_SIZE && (
              <div className="d-flex justify-end mt-4">
                <Pagination
                  current={page}
                  total={total}
                  pageSize={PAGE_SIZE}
                  onChange={(nextPage) => loadApps(nextPage)}
                />
              </div>
            )}
          </>
        )}
      </Spin>

      {modalOpen && (
        <ApplicationModal
          open={modalOpen}
          mode={modalMode}
          app={editingApp}
          teamModes={teamModes}
          teamModesLoading={teamModesLoading}
          teamModeError={teamModeError}
          submitting={submitting}
          onCancel={() => setModalOpen(false)}
          onRetryTeamModes={loadTeamModes}
          onSubmit={submitApp}
        />
      )}
    </ConstructLayout>
  );
}
