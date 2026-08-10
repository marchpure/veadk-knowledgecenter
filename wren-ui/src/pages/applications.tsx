import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Button,
  Checkbox,
  Drawer,
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
  Typography,
  message,
} from 'antd';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import EllipsisOutlined from '@ant-design/icons/EllipsisOutlined';
import ForkOutlined from '@ant-design/icons/ForkOutlined';
import LeftOutlined from '@ant-design/icons/LeftOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SendOutlined from '@ant-design/icons/SendOutlined';
import ShareAltOutlined from '@ant-design/icons/ShareAltOutlined';
import StopOutlined from '@ant-design/icons/StopOutlined';
import styled from 'styled-components';
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
  DbgptDialogue,
  DbgptFlow,
  DbgptNativeScene,
  DbgptPrompt,
  DbgptPromptListResponse,
  DbgptResourceOption,
  DbgptStrategy,
  DbgptTeamMode,
  fetchDbgpt,
} from '@/lib/dbgpt';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;
const PAGE_SIZE = 12;

type TabKey = 'all' | 'published' | 'unpublished';
type AppModalMode = 'create' | 'edit';

type AppFormValues = {
  app_name: string;
  app_describe: string;
  team_mode: string;
};

type ConfigureFormValues = {
  agent_names?: string[];
  agent_details?: Record<
    string,
    {
      llm_strategy?: string;
      llm_strategy_value?: string[];
      prompt_template?: string;
      resources?: DbgptAppResource[];
    }
  >;
  flow_name?: string;
  chat_scene?: string;
  bind_value?: string;
  model?: string;
  temperature?: number;
  max_new_tokens?: number;
  prompt_template?: string;
  recommend_questions?: Array<{ question?: string; valid?: boolean }>;
};

type RuntimeMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type ChatSessionState = {
  app: DbgptApp;
  convUid: string;
  chatMode: string;
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
};

const tabOptions: Array<{ label: string; value: TabKey }> = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Unpublished', value: 'unpublished' },
];

const AppGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
`;

const AppCard = styled.div<{ $runtime?: boolean; $interactive?: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.06);
  cursor: ${(props) => (props.$interactive ? 'pointer' : 'default')};
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

const AppIcon = styled.div<{ $color?: string }>`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  color: #fff;
  font-size: 18px;
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
  color: #111827;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
`;

const AppMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`;

const AppFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 18px;
`;

const FooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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

const DrawerSection = styled.section`
  padding: 16px 0;
  border-bottom: 1px solid rgba(226, 232, 240, 0.92);

  &:last-child {
    border-bottom: none;
  }
`;

const DetailGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
`;

const DetailItem = styled.div`
  min-width: 0;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  padding-top: 18px;

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;
  }
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
  min-height: 86px;
  padding: 12px;
  border: 1px solid
    ${(props) =>
      props.$selected
        ? 'rgba(40, 103, 245, 0.70)'
        : 'rgba(226, 232, 240, 0.96)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$selected ? 'rgba(40, 103, 245, 0.06)' : '#fff'};
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

const AgentCheck = styled.span<{ $selected?: boolean }>`
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-right: 8px;
  border: 1px solid
    ${(props) =>
      props.$selected
        ? 'rgba(40, 103, 245, 0.92)'
        : 'rgba(148, 163, 184, 0.9)'};
  border-radius: ${(props) => (props.$selected ? '50%' : '4px')};
  background: ${(props) => (props.$selected ? '#2867f5' : '#fff')};

  &::after {
    content: '';
    display: ${(props) => (props.$selected ? 'block' : 'none')};
    width: 6px;
    height: 6px;
    border-radius: 50%;
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

const RunPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ChatSession = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 420px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const ChatSessionMessages = styled.div`
  flex: 1;
  max-height: 520px;
  min-height: 260px;
  padding: 14px;
  overflow: auto;
  background: #f8fafc;
`;

const ChatSessionMessage = styled.div<{ $role: RuntimeMessage['role'] }>`
  display: flex;
  justify-content: ${(props) =>
    props.$role === 'user' ? 'flex-end' : 'flex-start'};
  margin-bottom: 10px;
`;

const ChatSessionBubble = styled.div<{ $role: RuntimeMessage['role'] }>`
  max-width: 88%;
  padding: 10px 12px;
  border: 1px solid
    ${(props) =>
      props.$role === 'user'
        ? 'rgba(40, 103, 245, 0.26)'
        : 'rgba(226, 232, 240, 0.96)'};
  border-radius: 8px;
  background: ${(props) =>
    props.$role === 'user' ? 'rgba(40, 103, 245, 0.08)' : '#fff'};
  color: #111827;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
`;

const ChatSessionComposer = styled.div`
  padding: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.94);
  background: #fff;
`;

const ConfigSummary = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
`;

const ConfigSummaryItem = styled.div`
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
`;

const ChatWorkspace = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`;

const ChatMain = styled.div`
  min-height: calc(100vh - 190px);
  border: 1px solid rgba(226, 232, 240, 0.94);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
  overflow: hidden;
`;

const ChatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.94);
`;

const ChatBody = styled.div`
  height: calc(100vh - 352px);
  min-height: 360px;
  padding: 18px;
  overflow: auto;
  background: #f8fafc;
`;

const ChatComposer = styled.div`
  padding: 14px 18px 18px;
  border-top: 1px solid rgba(226, 232, 240, 0.94);
  background: #fff;
`;

const ChatSide = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const ChatEmptyState = styled.div`
  display: grid;
  place-items: center;
  min-height: 260px;
  color: #64748b;
  text-align: center;
`;

const isPublished = (app: DbgptApp) => String(app.published) === 'true';

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

const getAppChatMode = (app: DbgptApp) =>
  app.team_mode === 'native_app' ? getChatScene(app) : 'chat_agent';

const getAppSelectParam = (app: DbgptApp) => {
  if (app.team_mode !== 'native_app') return app.app_code;
  const resource = app.param_need?.find((item) => item.type === 'resource');
  if (typeof resource?.bind_value === 'string' && resource.bind_value) {
    return resource.bind_value;
  }
  return '';
};

const getAppModel = (app: DbgptApp) => {
  const model = app.param_need?.find((item) => item.type === 'model')?.value;
  return typeof model === 'string' && model ? model : undefined;
};

const createAppDialogue = async (app: DbgptApp) => {
  const chatMode = getAppChatMode(app);
  const dialogue = await fetchDbgpt<DbgptDialogue>(
    `/api/v1/chat/dialogue/new?chat_mode=${encodeURIComponent(chatMode)}`,
    {
      method: 'POST',
      body: JSON.stringify({ chat_mode: chatMode }),
    },
  );
  return {
    convUid: dialogue.conv_uid,
    chatMode: dialogue.chat_mode || chatMode,
  };
};

const buildChatBody = (app: DbgptApp, convUid: string, input: string) => ({
  conv_uid: convUid,
  app_code: app.app_code,
  chat_mode: getAppChatMode(app),
  user_input: input,
  model_name: getAppModel(app),
  select_param: getAppSelectParam(app),
  temperature:
    app.param_need?.find((item) => item.type === 'temperature')?.value ||
    undefined,
  max_new_tokens:
    app.param_need?.find((item) => item.type === 'max_new_tokens')?.value ||
    undefined,
});

const sendAppChat = async (app: DbgptApp, convUid: string, input: string) => {
  const response = await fetch('/api/dbgpt/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildChatBody(app, convUid, input)),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Chat failed with HTTP ${response.status}`);
  }
  return readStreamResponse(response);
};

const getBrowserOrigin = () =>
  typeof window === 'undefined' ? '' : window.location.origin;

const getApplicationShareUrl = (app: DbgptApp) => {
  const origin = getBrowserOrigin();
  return `${origin}${Path.Applications}?mode=chat&app_code=${encodeURIComponent(
    app.app_code,
  )}`;
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

const getAppConfigurationSummary = (
  app: DbgptApp,
  teamModes: DbgptTeamMode[],
) => {
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    const agents = (app.details || [])
      .map((detail) => detail.agent_name)
      .filter(Boolean);
    return [
      {
        label: app.team_mode === 'single_agent' ? 'Agent' : 'Agents',
        value: agents.length ? agents.join(', ') : 'No agent selected',
      },
      {
        label: 'Resources',
        value:
          (app.details || [])
            .flatMap((detail) => detail.resources || [])
            .map((resource) => resource.name || resource.type)
            .filter(Boolean)
            .join(', ') || 'No resources bound',
      },
    ];
  }

  if (app.team_mode === 'awel_layout') {
    return [
      {
        label: 'Workflow',
        value:
          (app.team_context?.label as string) ||
          (app.team_context?.name as string) ||
          'No workflow selected',
      },
    ];
  }

  if (app.team_mode === 'native_app') {
    const resource = app.param_need?.find((item) => item.type === 'resource');
    return [
      { label: 'Native scene', value: getChatScene(app) },
      {
        label: 'Resource',
        value:
          resource?.value === 'excel_file'
            ? 'Selected at chat time'
            : resource?.bind_value || 'No resource bound',
      },
      { label: 'Model', value: getAppModel(app) || 'Default model' },
    ];
  }

  return [
    {
      label: 'Mode',
      value: getModeLabel(app.team_mode, teamModes),
    },
  ];
};

const getRecommendQuestions = (app: DbgptApp) => {
  return (app.recommend_questions || []).map((item) => ({
    question: typeof item.question === 'string' ? item.question : '',
    valid: Boolean(item.valid),
  }));
};

const getAppCompleteness = (app: DbgptApp) => {
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    return Boolean(app.details?.length);
  }
  if (app.team_mode === 'awel_layout') {
    return Boolean(app.team_context?.name || app.team_context?.uid);
  }
  if (app.team_mode === 'native_app') {
    const resource = app.param_need?.find((item) => item.type === 'resource');
    const scene = app.team_context?.chat_scene;
    if (!scene) return false;
    if (!resource?.value) return true;
    if (resource.value === 'excel_file') return true;
    return Boolean(resource.bind_value);
  }
  return false;
};

const getAppActionHint = (app: DbgptApp) => {
  if (getAppCompleteness(app)) return 'Ready';
  if (['single_agent', 'auto_plan'].includes(app.team_mode || '')) {
    return 'Select agent';
  }
  if (app.team_mode === 'awel_layout') return 'Select workflow';
  if (app.team_mode === 'native_app') return 'Bind resource';
  return 'Configure';
};

const normalizeResources = (resources?: DbgptAppResource[]) => {
  return (resources || [])
    .filter((resource) => resource.type)
    .map((resource, index) => ({
      name: resource.name || `Resource ${index + 1}`,
      type: resource.type,
      value: resource.is_dynamic ? '' : resource.value || '',
      is_dynamic: Boolean(resource.is_dynamic),
    }));
};

const extractFenceBlocks = (value: string, fenceName: string) => {
  const blocks: string[] = [];
  const pattern = new RegExp(
    `\`\`\`${fenceName}\\s*\\n([\\s\\S]*?)\\n\`\`\``,
    'g',
  );
  let matched: RegExpExecArray | null;
  while ((matched = pattern.exec(value)) !== null) {
    blocks.push(matched[1]);
  }
  return blocks;
};

const stripRuntimeMarkdown = (value: string) => {
  return value
    .replace(/`{3,}vis-thinking[\s\S]*?`{3,}/g, '')
    .replace(/```agent-plans\s*\n[\s\S]*?\n```/g, '')
    .replace(/```agent-messages\s*\n[\s\S]*?\n```/g, '')
    .trim();
};

const extractAgentMessages = (vis: string) => {
  const messages: string[] = [];
  extractFenceBlocks(vis, 'agent-messages').forEach((block) => {
    try {
      const parsed = JSON.parse(block) as Array<{
        sender?: string;
        markdown?: string;
      }>;
      parsed.forEach((item) => {
        const sender = String(item.sender || '').toLowerCase();
        const markdown = stripRuntimeMarkdown(String(item.markdown || ''));
        if (sender !== 'human' && markdown) {
          messages.push(markdown);
        }
      });
    } catch {
      // Ignore nested agent-message strings embedded inside the agent-plan JSON.
    }
  });
  return messages;
};

const summarizeDbgptStreamEvents = (events: string[]) => {
  let finalAgentMessage = '';
  const fallbackParts: string[] = [];

  events.forEach((raw) => {
    if (!raw || raw === '[DONE]') return;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.vis === 'string') {
        const messages = extractAgentMessages(parsed.vis);
        if (messages.length) {
          finalAgentMessage = messages[messages.length - 1];
          return;
        }
        const fallback = stripRuntimeMarkdown(parsed.vis);
        if (fallback && fallback !== '[DONE]') fallbackParts.push(fallback);
        return;
      }

      const content =
        parsed.choices?.[0]?.delta?.content ||
        parsed.choices?.[0]?.message?.content ||
        parsed.context ||
        parsed.response;
      if (typeof content === 'string' && content.trim()) {
        fallbackParts.push(content.trim());
      }
    } catch {
      const fallback = raw.replace(/\\n/g, '\n').trim();
      if (fallback) fallbackParts.push(fallback);
    }
  });

  const result = finalAgentMessage || fallbackParts.join('\n').trim();
  if (/401 Client Error: Unauthorized/i.test(result)) {
    return [
      'DB-GPT model authorization failed.',
      '',
      result,
      '',
      'Check the DB-GPT LLM and embedding API endpoint/key configuration.',
    ].join('\n');
  }
  return result || 'No response content.';
};

const extractSseEvents = (text: string) => {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''))
    .filter(Boolean);
};

const readStreamResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream') && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const events: string[] = [];
    let pending = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || '';
      lines.forEach((line) => {
        if (!line.startsWith('data:')) return;
        const raw = line.replace(/^data:\s*/, '');
        if (raw) events.push(raw);
      });
    }
    if (pending.startsWith('data:')) {
      const raw = pending.replace(/^data:\s*/, '');
      if (raw) events.push(raw);
    }
    return summarizeDbgptStreamEvents(events);
  }
  const text = await response.text();
  if (text.includes('data:'))
    return summarizeDbgptStreamEvents(extractSseEvents(text));
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || 'No response content.';
  }
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
  const modeDescription = getModeDescription(selectedMode, teamModes);

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
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Work mode"
            name="team_mode"
            rules={[{ required: true, message: 'Select a work mode.' }]}
          >
            <TeamModeSelect disabled={mode === 'edit'} options={teamModes} />
          </Form.Item>
          {modeDescription && (
            <Alert
              className="mb-4"
              type="info"
              showIcon
              message={getModeLabel(selectedMode, teamModes)}
              description={modeDescription}
            />
          )}
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
      </Spin>
    </Modal>
  );
}

function ApplicationDetailsDrawer({
  app,
  open,
  loading,
  teamModes,
  actionLoading,
  onClose,
  onChat,
  onCopyShareLink,
  onEdit,
  onConfigure,
  onOperate,
  onDelete,
}: {
  app: DbgptApp | null;
  open: boolean;
  loading: boolean;
  teamModes: DbgptTeamMode[];
  actionLoading: string | null;
  onClose: () => void;
  onChat: (app: DbgptApp) => void;
  onCopyShareLink: (app: DbgptApp) => void;
  onEdit: (app: DbgptApp) => void;
  onConfigure: (app: DbgptApp) => void;
  onOperate: (app: DbgptApp) => void;
  onDelete: (app: DbgptApp) => void;
}) {
  const published = app ? isPublished(app) : false;
  const publishKey = app
    ? `${published ? 'unpublish' : 'publish'}:${app.app_code}`
    : '';
  const runnable = app ? getAppCompleteness(app) && published : false;

  return (
    <Drawer
      destroyOnClose
      width={620}
      visible={open}
      title={app?.app_name || 'Application'}
      onClose={onClose}
      footer={
        app ? (
          <FooterActions>
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!runnable}
              onClick={() => onChat(app)}
            >
              Chat
            </Button>
            <Button
              icon={<ShareAltOutlined />}
              onClick={() => onCopyShareLink(app)}
            >
              Share
            </Button>
            <Button
              icon={<AppstoreOutlined />}
              onClick={() => onConfigure(app)}
            >
              Configure
            </Button>
            <Button icon={<EditOutlined />} onClick={() => onEdit(app)}>
              Edit
            </Button>
            <Button
              icon={published ? <StopOutlined /> : <RocketOutlined />}
              loading={actionLoading === publishKey}
              onClick={() => onOperate(app)}
            >
              {published ? 'Unpublish' : 'Publish'}
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(app)}
            >
              Delete
            </Button>
          </FooterActions>
        ) : null
      }
    >
      <Spin spinning={loading}>
        {app && (
          <>
            <DrawerSection>
              <div className="d-flex justify-space-between align-center mb-3">
                <Title level={5} className="mb-0">
                  Use this application
                </Title>
                <StatusTag status={published ? 'published' : 'unpublished'} />
              </div>
              <Paragraph className="gray-7 mb-0">
                {app.app_describe || 'No description.'}
              </Paragraph>
              {!published && (
                <Alert
                  className="mt-3"
                  type="warning"
                  showIcon
                  message="Publish before users can call this application."
                />
              )}
              {published && !getAppCompleteness(app) && (
                <Alert
                  className="mt-3"
                  type="warning"
                  showIcon
                  message="Complete application configuration before chat."
                />
              )}
            </DrawerSection>

            <DrawerSection>
              <DetailGrid>
                <DetailItem>
                  <DetailLabel>Invocation</DetailLabel>
                  <DetailValue>
                    {app.team_mode === 'native_app'
                      ? 'Native app chat'
                      : 'Agent chat application'}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Work mode</DetailLabel>
                  <DetailValue>
                    {getModeLabel(app.team_mode, teamModes)}
                  </DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Chat scene</DetailLabel>
                  <DetailValue>{getAppChatMode(app)}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Application code</DetailLabel>
                  <DetailValue>{app.app_code}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Owner</DetailLabel>
                  <DetailValue>{app.owner_name || 'unset'}</DetailValue>
                </DetailItem>
                <DetailItem>
                  <DetailLabel>Updated</DetailLabel>
                  <DetailValue>{app.updated_at || 'unset'}</DetailValue>
                </DetailItem>
              </DetailGrid>
            </DrawerSection>

            <DrawerSection>
              <Title level={5} className="mb-0">
                Configuration summary
              </Title>
              <ConfigSummary className="mt-3">
                {getAppConfigurationSummary(app, teamModes).map((item) => (
                  <ConfigSummaryItem key={item.label}>
                    <DetailLabel>{item.label}</DetailLabel>
                    <DetailValue>{item.value}</DetailValue>
                  </ConfigSummaryItem>
                ))}
              </ConfigSummary>
            </DrawerSection>

            <DrawerSection>
              <Title level={5} className="mb-0">
                Recommended questions
              </Title>
              {getRecommendQuestions(app).length ? (
                <ConfigSummary className="mt-3">
                  {getRecommendQuestions(app).map((item, index) => (
                    <ConfigSummaryItem key={`${item.question}-${index}`}>
                      <DetailValue>{item.question}</DetailValue>
                    </ConfigSummaryItem>
                  ))}
                </ConfigSummary>
              ) : (
                <Paragraph className="gray-7 mt-3 mb-0">
                  No recommended questions configured.
                </Paragraph>
              )}
            </DrawerSection>
          </>
        )}
      </Spin>
    </Drawer>
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
    if (param.default_value !== undefined) {
      defaults[param.param_name] = param.default_value;
    }
  });
  return defaults;
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
  value,
  resourceTypes,
  resourceParamSchemas,
  resourceParamLoading,
  onLoadParamSchema,
  onChange,
}: {
  value?: DbgptAppResource[];
  resourceTypes: string[];
  resourceParamSchemas: Record<string, DbgptConfigurableParam[]>;
  resourceParamLoading: Record<string, boolean>;
  onLoadParamSchema: (type: string) => void;
  onChange?: (value: DbgptAppResource[]) => void;
}) {
  const resources = value || [];
  const availableTypes = resourceTypes.filter((type) => type !== 'all');
  const updateAt = (index: number, patch: Partial<DbgptAppResource>) => {
    const next = resources.map((item, idx) =>
      idx === index ? { ...item, ...patch } : item,
    );
    onChange?.(next);
  };

  const updateConfig = (index: number, field: string, nextValue: unknown) => {
    const current = parseResourceValue(resources[index]?.value);
    const next = { ...current, [field]: nextValue };
    updateAt(index, { value: JSON.stringify(next) });
  };

  useEffect(() => {
    const nextResources = resources.map((resource) => {
      if (!resource.type || resource.is_dynamic) return resource;
      const params = resourceParamSchemas[resource.type];
      if (!params?.length) return resource;
      const defaults = buildDefaultResourceConfig(params);
      if (!Object.keys(defaults).length) return resource;
      const current = parseResourceValue(resource.value);
      let changed = false;
      Object.entries(defaults).forEach(([key, defaultValue]) => {
        if (current[key] === undefined) {
          current[key] = defaultValue;
          changed = true;
        }
      });
      return changed
        ? { ...resource, value: JSON.stringify(current) }
        : resource;
    });
    const changed = JSON.stringify(nextResources) !== JSON.stringify(resources);
    if (changed) onChange?.(nextResources);
  }, [onChange, resourceParamSchemas, resources]);

  return (
    <div>
      {resources.map((resource, index) => {
        const params = resource.type ? resourceParamSchemas[resource.type] : [];
        const configValues = parseResourceValue(resource.value);
        return (
          <AgentDetailBox
            key={`${resource.name || 'resource'}-${index}`}
            style={{ background: '#fff' }}
          >
            <ResourceRow>
              <Input
                placeholder="Resource name"
                value={resource.name}
                onChange={(event) =>
                  updateAt(index, { name: event.target.value })
                }
              />
              <Select
                placeholder="Resource type"
                value={resource.type}
                options={availableTypes.map((type) => ({
                  label: type,
                  value: type,
                }))}
                onChange={(type) => {
                  onLoadParamSchema(type);
                  updateAt(index, {
                    type,
                    value: '',
                    name: resource.name || `Resource ${index + 1}`,
                  });
                }}
              />
              <Switch
                checkedChildren="Dynamic"
                unCheckedChildren="Static"
                checked={Boolean(resource.is_dynamic)}
                onChange={(checked) =>
                  updateAt(index, {
                    is_dynamic: checked,
                    value: checked ? '' : resource.value,
                  })
                }
              />
              <Button
                danger
                onClick={() =>
                  onChange?.(resources.filter((_, idx) => idx !== index))
                }
              >
                Remove
              </Button>
            </ResourceRow>
            {resource.type && !resource.is_dynamic && (
              <Spin spinning={Boolean(resourceParamLoading[resource.type])}>
                {params?.length ? (
                  params.map((param) => (
                    <ResourceParamEditor
                      key={param.param_name}
                      param={param}
                      value={
                        configValues[param.param_name] ?? param.default_value
                      }
                      onChange={(nextValue) =>
                        updateConfig(index, param.param_name, nextValue)
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
          </AgentDetailBox>
        );
      })}
      <Button
        block
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => {
          const type = availableTypes[0];
          if (type) onLoadParamSchema(type);
          onChange?.([
            ...resources,
            {
              name: `Resource ${resources.length + 1}`,
              type,
              value: '',
              is_dynamic: false,
            },
          ]);
        }}
      >
        Add resource
      </Button>
    </div>
  );
}

function AgentConfiguration({
  app,
  catalog,
  resourceParamSchemas,
  resourceParamLoading,
  onLoadParamSchema,
}: {
  app: DbgptApp;
  catalog: CatalogState;
  resourceParamSchemas: Record<string, DbgptConfigurableParam[]>;
  resourceParamLoading: Record<string, boolean>;
  onLoadParamSchema: (type: string) => void;
}) {
  const form = Form.useFormInstance<ConfigureFormValues>();
  const selectedAgents = Form.useWatch('agent_names') || [];
  const isSingle = app.team_mode === 'single_agent';
  const strategyOptions = catalog.strategies.map((strategy) => ({
    label: strategy.name,
    value: strategy.value,
  }));

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
            <AgentGrid>
              {catalog.agents.map((agent) => {
                const selected = selectedAgents.includes(agent.name);
                return (
                  <AgentOption
                    key={agent.name}
                    $selected={selected}
                    onClick={() => {
                      const current = selectedAgents as string[];
                      const next = isSingle
                        ? [agent.name]
                        : selected
                          ? current.filter((item) => item !== agent.name)
                          : [...current, agent.name];
                      form.setFieldsValue({ agent_names: next });
                    }}
                  >
                    <div className="d-flex align-center">
                      <AgentCheck $selected={selected} />
                      <Text strong>{agent.label || agent.name}</Text>
                    </div>
                    <Paragraph
                      className="gray-7 mt-2 mb-0"
                      ellipsis={{ rows: 2 }}
                    >
                      {agent.desc || agent.describe || 'No description.'}
                    </Paragraph>
                  </AgentOption>
                );
              })}
            </AgentGrid>
          </Form.Item>

          {(selectedAgents as string[]).map((agentName) => (
            <AgentDetailBox key={agentName}>
              <Title level={5}>{agentName}</Title>
              <Form.Item
                label="Prompt"
                name={['agent_details', agentName, 'prompt_template']}
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
                name={['agent_details', agentName, 'llm_strategy']}
              >
                <Select options={strategyOptions} />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(prev, current) =>
                  prev?.agent_details?.[agentName]?.llm_strategy !==
                  current?.agent_details?.[agentName]?.llm_strategy
                }
              >
                {({ getFieldValue }) =>
                  getFieldValue([
                    'agent_details',
                    agentName,
                    'llm_strategy',
                  ]) === 'priority' ? (
                    <Form.Item
                      label="Priority models"
                      name={['agent_details', agentName, 'llm_strategy_value']}
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
                name={['agent_details', agentName, 'resources']}
              >
                <ResourceEditor
                  resourceTypes={catalog.resourceTypes}
                  resourceParamSchemas={resourceParamSchemas}
                  resourceParamLoading={resourceParamLoading}
                  onLoadParamSchema={onLoadParamSchema}
                />
              </Form.Item>
            </AgentDetailBox>
          ))}
        </>
      )}
    </Panel>
  );
}

function AwelConfiguration({ catalog }: { catalog: CatalogState }) {
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
          message="No AWEL workflows available"
          description="Create or import a workflow in the Workflow section before publishing an AWEL application."
          action={
            <Link href={Path.Workflow}>
              <Button size="small">Open workflow</Button>
            </Link>
          }
        />
      ) : (
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
            Bind a native DB-GPT scene to a resource and model parameters.
          </Text>
        </div>
      </PanelTitle>
      <Form.Item
        label="Native scene"
        name="chat_scene"
        rules={[{ required: true, message: 'Select a native scene.' }]}
      >
        <Select
          showSearch
          placeholder="Select native scene"
          options={catalog.nativeScenes.map((item) => ({
            label: item.scene_name,
            value: item.chat_scene,
          }))}
        />
      </Form.Item>
      {resourceType && resourceType !== 'excel_file' && (
        <Form.Item
          label={`Bind ${resourceType}`}
          name="bind_value"
          rules={[{ required: true, message: 'Bind a resource.' }]}
        >
          <Select
            showSearch
            allowClear
            loading={resourceLoading[resourceType]}
            placeholder={`Select ${resourceType}`}
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

function RunApplicationPanel({
  app,
  disabled,
}: {
  app: DbgptApp;
  disabled: boolean;
}) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<RuntimeMessage[]>([]);
  const [convUid, setConvUid] = useState('');
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setMessages([]);
    setConvUid('');
    setQuestion('');
  }, [app.app_code]);

  const ensureDialogue = async () => {
    if (convUid) return convUid;
    const dialogue = await createAppDialogue(app);
    setConvUid(dialogue.convUid);
    return dialogue.convUid;
  };

  const runApp = async (input = question) => {
    if (!input.trim()) return;
    setRunning(true);
    const userMessage: RuntimeMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: input,
    };
    setMessages((current) => [...current, userMessage]);
    setQuestion('');
    try {
      const currentConvUid = await ensureDialogue();
      const answer = await sendAppChat(app, currentConvUid, input);
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: answer,
        },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          content:
            err instanceof Error ? err.message : 'Application run failed.',
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Panel>
      <PanelTitle>
        <div>
          <Title level={5} className="mb-0">
            Chat
          </Title>
          <Text className="gray-7">
            Creates a DB-GPT dialogue and calls this published application.
          </Text>
        </div>
        <Tag color={disabled ? 'orange' : 'green'}>
          {disabled ? 'Needs config' : convUid ? 'Dialogue active' : 'Ready'}
        </Tag>
      </PanelTitle>
      <RunPanel>
        {disabled && (
          <Alert
            type="warning"
            showIcon
            message="Complete configuration before running"
            description="The app has no usable agent, workflow, or bound native resource yet."
          />
        )}
        <ChatSession>
          <ChatSessionMessages>
            {messages.length ? (
              messages.map((item) => (
                <ChatSessionMessage key={item.id} $role={item.role}>
                  <ChatSessionBubble $role={item.role}>
                    {item.content}
                  </ChatSessionBubble>
                </ChatSessionMessage>
              ))
            ) : (
              <Paragraph className="gray-7 mb-0">
                Start a conversation with this application.
              </Paragraph>
            )}
          </ChatSessionMessages>
          <ChatSessionComposer>
            <Input.TextArea
              value={question}
              disabled={disabled || running}
              placeholder="Ask this application"
              autoSize={{ minRows: 3, maxRows: 6 }}
              onChange={(event) => setQuestion(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  runApp();
                }
              }}
            />
            <div className="d-flex justify-space-between align-center mt-3">
              <Text className="gray-7 text-sm">
                {convUid ? `Conversation ${convUid}` : 'New conversation'}
              </Text>
              <Button
                type="primary"
                icon={<SendOutlined />}
                disabled={disabled || !question.trim()}
                loading={running}
                onClick={() => runApp()}
              >
                Send
              </Button>
            </div>
          </ChatSessionComposer>
        </ChatSession>
      </RunPanel>
    </Panel>
  );
}

function ApplicationChatView({
  session,
  teamModes,
  actionLoading,
  onBack,
  onConfigure,
  onOperate,
  onCopyShareLink,
}: {
  session: ChatSessionState;
  teamModes: DbgptTeamMode[];
  actionLoading: string | null;
  onBack: () => void;
  onConfigure: (app: DbgptApp) => void;
  onOperate: (app: DbgptApp) => void;
  onCopyShareLink: (app: DbgptApp) => void;
}) {
  const { app, convUid, chatMode } = session;
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<RuntimeMessage[]>([]);
  const [running, setRunning] = useState(false);
  const published = isPublished(app);
  const runnable = published && getAppCompleteness(app);
  const publishKey = `${published ? 'unpublish' : 'publish'}:${app.app_code}`;
  const recommendedQuestions = getRecommendQuestions(app).filter(
    (item) => item.question,
  );

  useEffect(() => {
    setMessages([]);
    setQuestion('');
  }, [app.app_code, convUid]);

  const send = async (input = question) => {
    if (!input.trim() || running || !runnable) return;
    setRunning(true);
    setQuestion('');
    setMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-user`,
        role: 'user',
        content: input,
      },
    ]);
    try {
      const answer = await sendAppChat(app, convUid, input);
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: answer,
        },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-error`,
          role: 'assistant',
          content:
            err instanceof Error ? err.message : 'Application chat failed.',
        },
      ]);
    } finally {
      setRunning(false);
    }
  };

  return (
    <ConstructLayout
      activeKey="applications"
      icon={<SendOutlined />}
      title={app.app_name}
      description="Application chat session created from DB-GPT dialogue runtime."
      actions={
        <>
          <Button icon={<LeftOutlined />} onClick={onBack}>
            Back to apps
          </Button>
          <Button
            icon={<ShareAltOutlined />}
            onClick={() => onCopyShareLink(app)}
          >
            Copy app link
          </Button>
          <Button icon={<AppstoreOutlined />} onClick={() => onConfigure(app)}>
            Configure
          </Button>
        </>
      }
    >
      <ChatWorkspace>
        <ChatMain>
          <ChatHeader>
            <div style={{ minWidth: 0 }}>
              <Title level={5} className="mb-0">
                {app.app_name}
              </Title>
              <AppMeta>
                <Tag>{getModeLabel(app.team_mode, teamModes)}</Tag>
                <StatusTag status={published ? 'published' : 'unpublished'} />
                <Tag>{chatMode}</Tag>
              </AppMeta>
            </div>
            <FooterActions>
              <Button
                icon={published ? <StopOutlined /> : <RocketOutlined />}
                loading={actionLoading === publishKey}
                onClick={() => onOperate(app)}
              >
                {published ? 'Unpublish' : 'Publish'}
              </Button>
            </FooterActions>
          </ChatHeader>
          <ChatBody>
            {!runnable && (
              <Alert
                className="mb-4"
                type="warning"
                showIcon
                message="This application is not callable yet"
                description="Publish the application and complete its agent, workflow, or native app configuration before chat."
              />
            )}
            {messages.length ? (
              messages.map((item) => (
                <ChatSessionMessage key={item.id} $role={item.role}>
                  <ChatSessionBubble $role={item.role}>
                    {item.content}
                  </ChatSessionBubble>
                </ChatSessionMessage>
              ))
            ) : (
              <ChatEmptyState>
                <div>
                  <Title level={5}>Start a conversation</Title>
                  <Paragraph className="gray-7 mb-0">
                    This session calls DB-GPT with the application code and
                    dialogue id, matching the DB-GPT application chat path.
                  </Paragraph>
                </div>
              </ChatEmptyState>
            )}
          </ChatBody>
          <ChatComposer>
            <Input.TextArea
              value={question}
              disabled={!runnable || running}
              placeholder="Ask this application"
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(event) => setQuestion(event.target.value)}
              onPressEnter={(event) => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <div className="d-flex justify-space-between align-center mt-3">
              <Text className="gray-7 text-sm">Conversation {convUid}</Text>
              <Button
                type="primary"
                icon={<SendOutlined />}
                disabled={!runnable || !question.trim()}
                loading={running}
                onClick={() => send()}
              >
                Send
              </Button>
            </div>
          </ChatComposer>
        </ChatMain>
        <ChatSide>
          <Panel>
            <Title level={5} className="mb-0">
              Runtime
            </Title>
            <DetailGrid className="mt-3">
              <DetailItem>
                <DetailLabel>Work mode</DetailLabel>
                <DetailValue>
                  {getModeLabel(app.team_mode, teamModes)}
                </DetailValue>
              </DetailItem>
              <DetailItem>
                <DetailLabel>Chat scene</DetailLabel>
                <DetailValue>{chatMode}</DetailValue>
              </DetailItem>
              <DetailItem>
                <DetailLabel>Application code</DetailLabel>
                <DetailValue>{app.app_code}</DetailValue>
              </DetailItem>
              <DetailItem>
                <DetailLabel>Dialogue</DetailLabel>
                <DetailValue>{convUid}</DetailValue>
              </DetailItem>
            </DetailGrid>
          </Panel>
          <Panel>
            <Title level={5} className="mb-0">
              Configuration
            </Title>
            <ConfigSummary className="mt-3">
              {getAppConfigurationSummary(app, teamModes).map((item) => (
                <ConfigSummaryItem key={item.label}>
                  <DetailLabel>{item.label}</DetailLabel>
                  <DetailValue>{item.value}</DetailValue>
                </ConfigSummaryItem>
              ))}
            </ConfigSummary>
          </Panel>
          <Panel>
            <Title level={5} className="mb-0">
              Recommended questions
            </Title>
            {recommendedQuestions.length ? (
              <ConfigSummary className="mt-3">
                {recommendedQuestions.map((item, index) => (
                  <Button
                    key={`${item.question}-${index}`}
                    disabled={!runnable || running}
                    onClick={() => send(item.question)}
                  >
                    {item.question}
                  </Button>
                ))}
              </ConfigSummary>
            ) : (
              <Paragraph className="gray-7 mt-3 mb-0">
                No recommended questions configured.
              </Paragraph>
            )}
          </Panel>
        </ChatSide>
      </ChatWorkspace>
    </ConstructLayout>
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
        llm_strategy_value: detail.llm_strategy_value
          ? detail.llm_strategy_value.split(',').filter(Boolean)
          : [],
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
        ? detail.llm_strategy_value.join(',')
        : detail.llm_strategy_value || '';
      return {
        agent_name: agentName,
        llm_strategy: detail.llm_strategy || 'default',
        llm_strategy_value: strategyValue,
        prompt_template: detail.prompt_template || '',
        resources: normalizeResources(detail.resources),
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
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamModeError, setTeamModeError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AppModalMode>('create');
  const [editingApp, setEditingApp] = useState<DbgptApp | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<DbgptApp | null>(null);
  const [configuringApp, setConfiguringApp] = useState<DbgptApp | null>(null);
  const [chatSession, setChatSession] = useState<ChatSessionState | null>(null);
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
        agents,
        strategies,
        strategyValues,
        resourceTypes,
        nativeScenes,
        promptList,
        models,
        flows,
      ] = await Promise.all([
        fetchDbgpt<DbgptAgent[]>('/api/v1/agents/list'),
        fetchDbgpt<DbgptStrategy[]>('/api/v1/llm-strategy/list'),
        fetchDbgpt<string[]>('/api/v1/llm-strategy/value/list?type=priority'),
        fetchDbgpt<string[]>('/api/v1/resource-type/list'),
        fetchDbgpt<DbgptNativeScene[]>('/api/v1/native_scenes'),
        fetchDbgpt<DbgptPromptListResponse>(
          '/prompt/query_page?page=1&page_size=100000',
          {
            method: 'POST',
            body: JSON.stringify({ page: 1, page_size: 100000 }),
          },
        ),
        fetchDbgpt<string[]>('/api/v1/model/types'),
        fetchDbgpt<{
          items: DbgptFlow[];
          total_count: number;
          total_pages: number;
          page: number;
          page_size: number;
        }>('/api/v2/serve/awel/flows?page=1&page_size=10000'),
      ]);
      setCatalog({
        agents: agents || [],
        strategies: strategies || [],
        strategyValues: strategyValues || [],
        resourceTypes: resourceTypes || [],
        nativeScenes: nativeScenes || [],
        prompts: promptList?.items || [],
        models: models || [],
        flows: flows?.items || [],
      });
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : 'Unable to load app catalog.';
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

  const openDetails = async (app: DbgptApp) => {
    setSelectedApp(app);
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      setSelectedApp(await fetchAppInfo(app));
    } catch (err) {
      message.warning(
        err instanceof Error
          ? `Unable to load full application details: ${err.message}`
          : 'Unable to load full application details.',
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const openConfigure = async (app: DbgptApp) => {
    setDetailsOpen(false);
    clearApplicationUrlState();
    setChatSession(null);
    setConfiguringApp(app);
    configureForm.resetFields();
    try {
      if (!catalog.agents.length && !catalogLoading) {
        await loadCatalog();
      }
      const fullApp = await fetchAppInfo(app);
      setConfiguringApp(fullApp);
      const initialValues = buildConfigureInitialValues(fullApp);
      configureForm.setFieldsValue(initialValues);
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

  const startChat = async (app: DbgptApp) => {
    const fullApp = await fetchAppInfo(app).catch(() => app);
    if (!isPublished(fullApp)) {
      message.warning('Publish this application before chat.');
      return;
    }
    if (!getAppCompleteness(fullApp)) {
      message.warning('Complete application configuration before chat.');
      openConfigure(fullApp);
      return;
    }
    setActionLoading(`chat:${fullApp.app_code}`);
    try {
      const dialogue = await createAppDialogue(fullApp);
      setDetailsOpen(false);
      setConfiguringApp(null);
      setChatSession({
        app: fullApp,
        convUid: dialogue.convUid,
        chatMode: dialogue.chatMode,
      });
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', 'chat');
        url.searchParams.set('app_code', fullApp.app_code);
        window.history.replaceState(null, '', url.toString());
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          'cur_dialog_info',
          JSON.stringify({
            chat_scene: dialogue.chatMode,
            app_code: fullApp.app_code,
          }),
        );
      }
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

  const openSharedChat = useCallback(
    async (appCode: string) => {
      if (!appCode || chatSession?.app.app_code === appCode) return;
      setActionLoading(`chat:${appCode}`);
      try {
        const data = await fetchDbgpt<DbgptAppListResponse>(
          `/api/v1/app/list?page=1&page_size=10000`,
          {
            method: 'POST',
            body: JSON.stringify({ page: 1, page_size: 10000 }),
          },
        );
        const app = (data?.app_list || []).find(
          (item) => item.app_code === appCode,
        );
        if (!app) {
          throw new Error('Shared application was not found.');
        }
        await startChat(app);
      } catch (err) {
        message.error(
          err instanceof Error
            ? err.message
            : 'Unable to open shared application.',
        );
      } finally {
        setActionLoading(null);
      }
    },
    [chatSession?.app.app_code],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') !== 'chat') return;
    const appCode = params.get('app_code');
    if (appCode) openSharedChat(appCode);
  }, [openSharedChat]);

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
      const payload: DbgptAppPayload = {
        language: 'zh',
        app_name: values.app_name,
        app_describe: values.app_describe,
        team_mode: values.team_mode,
      };
      if (modalMode === 'edit' && editingApp?.app_code) {
        payload.app_code = editingApp.app_code;
      }
      const saved = await fetchDbgpt<DbgptApp>(
        modalMode === 'edit' ? '/api/v1/app/edit' : '/api/v1/app/create',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      message.success(
        modalMode === 'edit' ? 'Application updated.' : 'Application created.',
      );
      setModalOpen(false);
      await loadApps(modalMode === 'edit' ? page : 1);
      if (selectedApp?.app_code === saved?.app_code) {
        setSelectedApp({ ...selectedApp, ...saved });
      }
      if (saved?.app_code) {
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

  const operateApp = async (app: DbgptApp) => {
    if (!isPublished(app) && !getAppCompleteness(app)) {
      message.warning('Complete application configuration before publishing.');
      openConfigure(app);
      return;
    }
    if (
      !isPublished(app) &&
      configuringApp?.app_code === app.app_code &&
      ['single_agent', 'auto_plan'].includes(configuringApp.team_mode || '')
    ) {
      try {
        const values = await configureForm.validateFields();
        validateConfiguredResources(
          configuringApp,
          values,
          resourceParamSchemas,
        );
      } catch (err) {
        message.error(
          err instanceof Error
            ? err.message
            : 'Complete application configuration before publishing.',
        );
        return;
      }
    }
    const published = isPublished(app);
    const operation = published ? 'unpublish' : 'publish';
    setActionLoading(`${operation}:${app.app_code}`);
    try {
      await fetchDbgpt(`/api/v1/app/${operation}`, {
        method: 'POST',
        body: JSON.stringify({ app_code: app.app_code }),
      });
      message.success(
        published ? 'Application unpublished.' : 'Application published.',
      );
      const nextPublished = published ? 'false' : 'true';
      await loadApps(page);
      if (selectedApp?.app_code === app.app_code) {
        setSelectedApp({ ...selectedApp, published: nextPublished });
      }
      if (configuringApp?.app_code === app.app_code) {
        setConfiguringApp({ ...configuringApp, published: nextPublished });
      }
      if (chatSession?.app.app_code === app.app_code) {
        setChatSession({
          ...chatSession,
          app: { ...chatSession.app, published: nextPublished },
        });
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
      const values = await configureForm.validateFields();
      validateConfiguredResources(configuringApp, values, resourceParamSchemas);
      const payload = buildConfigurePayload(configuringApp, values, catalog);
      const saved = await fetchDbgpt<DbgptApp>('/api/v1/app/edit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const nextApp = { ...configuringApp, ...payload, ...saved };
      setConfiguringApp(nextApp);
      setSelectedApp((current) =>
        current?.app_code === nextApp.app_code ? nextApp : current,
      );
      message.success('Application configuration saved.');
      await loadApps(page);
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
      if (selectedApp?.app_code === app.app_code) {
        setDetailsOpen(false);
        setSelectedApp(null);
      }
      if (chatSession?.app.app_code === app.app_code) {
        setChatSession(null);
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
    return (
      <Menu
        onClick={(info) => {
          info.domEvent.stopPropagation();
          if (info.key === 'chat') startChat(app);
          if (info.key === 'share') copyAppShareLink(app);
          if (info.key === 'dingtalk') copyDingTalkShareLink(app);
          if (info.key === 'details') openDetails(app);
          if (info.key === 'configure') openConfigure(app);
          if (info.key === 'edit') openEditModal(app);
          if (info.key === 'publish') operateApp(app);
          if (info.key === 'delete') confirmDelete(app);
        }}
      >
        <Menu.Item
          key="chat"
          icon={<SendOutlined />}
          disabled={!published || !getAppCompleteness(app)}
        >
          Chat
        </Menu.Item>
        <Menu.Item key="share" icon={<ShareAltOutlined />}>
          Copy app link
        </Menu.Item>
        <Menu.Item key="dingtalk" icon={<ShareAltOutlined />}>
          Copy DingTalk link
        </Menu.Item>
        <Menu.Item key="details" icon={<AppstoreOutlined />}>
          Runtime details
        </Menu.Item>
        <Menu.Item key="configure" icon={<RocketOutlined />}>
          Configure
        </Menu.Item>
        <Menu.Item key="edit" icon={<EditOutlined />}>
          Edit
        </Menu.Item>
        <Menu.Item
          key="publish"
          icon={published ? <StopOutlined /> : <RocketOutlined />}
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

  if (chatSession) {
    return (
      <ApplicationChatView
        session={chatSession}
        teamModes={teamModes}
        actionLoading={actionLoading}
        onBack={() => {
          setChatSession(null);
          clearApplicationUrlState();
        }}
        onConfigure={openConfigure}
        onOperate={operateApp}
        onCopyShareLink={copyAppShareLink}
      />
    );
  }

  if (configuringApp) {
    const runnable = getAppCompleteness(configuringApp);
    return (
      <ConstructLayout
        activeKey="applications"
        icon={<AppstoreOutlined />}
        title="Applications"
        description="Configure the selected application without leaving WrenUI."
        loading={catalogLoading}
        actions={
          <>
            <Button
              icon={<LeftOutlined />}
              onClick={() => {
                setConfiguringApp(null);
                setChatSession(null);
                clearApplicationUrlState();
                configureForm.resetFields();
              }}
            >
              Back to apps
            </Button>
            <Button
              type="primary"
              loading={savingConfig}
              onClick={saveConfiguration}
            >
              Save configuration
            </Button>
          </>
        }
      >
        <ConfigureShell>
          <ConfigureHeader>
            <ConfigureTitle>
              <AppIcon>
                <ForkOutlined />
              </AppIcon>
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
                  <Tag color={runnable ? 'green' : 'orange'}>
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
              <Button
                icon={
                  isPublished(configuringApp) ? (
                    <StopOutlined />
                  ) : (
                    <RocketOutlined />
                  )
                }
                onClick={() => operateApp(configuringApp)}
              >
                {isPublished(configuringApp) ? 'Unpublish' : 'Publish'}
              </Button>
            </FooterActions>
          </ConfigureHeader>

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
          >
            <ConfigureContent>
              <div>
                {['single_agent', 'auto_plan'].includes(
                  configuringApp.team_mode || '',
                ) && (
                  <AgentConfiguration
                    app={configuringApp}
                    catalog={catalog}
                    resourceParamSchemas={resourceParamSchemas}
                    resourceParamLoading={resourceParamLoading}
                    onLoadParamSchema={loadResourceParamSchema}
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
                <div className="mt-4">
                  <RecommendQuestionsEditor />
                </div>
              </div>
              <RunApplicationPanel app={configuringApp} disabled={!runnable} />
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
      description="Create, configure, publish, and chat with DB-GPT applications inside this workspace."
      loading={loading && apps.length === 0}
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
        >
          Create app
        </Button>
      }
    >
      <ConstructToolbar
        left={
          <>
            {tabOptions.map((option) => (
              <Button
                key={option.value}
                size="small"
                type={activeKey === option.value ? 'primary' : 'default'}
                onClick={() => setActiveKey(option.value)}
              >
                {option.label}
              </Button>
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
            description="Create a DB-GPT application, configure its work mode, then publish it before users can chat."
            action={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreateModal}
              >
                Create app
              </Button>
            }
          />
        ) : (
          <>
            <AppGrid>
              {apps.map((app) => {
                const published = isPublished(app);
                const publishKey = `${published ? 'unpublish' : 'publish'}:${app.app_code}`;
                const runnable = getAppCompleteness(app);
                return (
                  <AppCard
                    key={app.app_code}
                    $interactive
                    role="button"
                    tabIndex={0}
                    onClick={() => openConfigure(app)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') openConfigure(app);
                    }}
                  >
                    <AppHeader>
                      <AppIcon>
                        <ForkOutlined />
                      </AppIcon>
                      <div style={{ minWidth: 0 }}>
                        <AppTitle>{app.app_name}</AppTitle>
                        <AppMeta>
                          {app.language && <Tag>{app.language}</Tag>}
                          {app.team_mode && (
                            <Tag>{getModeLabel(app.team_mode, teamModes)}</Tag>
                          )}
                          <StatusTag
                            status={published ? 'published' : 'unpublished'}
                          />
                          <Tag color={runnable ? 'green' : 'orange'}>
                            {getAppActionHint(app)}
                          </Tag>
                        </AppMeta>
                      </div>
                    </AppHeader>
                    <Paragraph
                      className="gray-7 mt-4 mb-0"
                      ellipsis={{ rows: 3 }}
                    >
                      {app.app_describe || 'No description.'}
                    </Paragraph>
                    <AppFooter>
                      <Text className="gray-7 text-sm">
                        {app.owner_name || 'owner unset'}
                        {app.updated_at ? ` · ${app.updated_at}` : ''}
                      </Text>
                      <FooterActions>
                        <Button
                          size="small"
                          type="primary"
                          icon={<SendOutlined />}
                          loading={actionLoading === `chat:${app.app_code}`}
                          disabled={!published || !runnable}
                          onClick={(event) => {
                            event.stopPropagation();
                            startChat(app);
                          }}
                        >
                          Chat
                        </Button>
                        <Button
                          size="small"
                          icon={<ShareAltOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            copyAppShareLink(app);
                          }}
                        >
                          Share
                        </Button>
                        <Button
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            openConfigure(app);
                          }}
                        >
                          Configure
                        </Button>
                        <Button
                          size="small"
                          loading={actionLoading === publishKey}
                          onClick={(event) => {
                            event.stopPropagation();
                            operateApp(app);
                          }}
                        >
                          {published ? 'Unpublish' : 'Publish'}
                        </Button>
                        <Dropdown
                          overlay={renderAppMenu(app)}
                          trigger={['click']}
                        >
                          <Button
                            size="small"
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
      <ApplicationDetailsDrawer
        app={selectedApp}
        open={detailsOpen}
        loading={detailsLoading}
        teamModes={teamModes}
        actionLoading={actionLoading}
        onClose={() => setDetailsOpen(false)}
        onChat={startChat}
        onCopyShareLink={copyAppShareLink}
        onEdit={openEditModal}
        onConfigure={openConfigure}
        onOperate={operateApp}
        onDelete={confirmDelete}
      />
    </ConstructLayout>
  );
}
