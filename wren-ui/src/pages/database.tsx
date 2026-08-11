import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Row,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import ApiOutlined from '@ant-design/icons/ApiOutlined';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import CheckCircleOutlined from '@ant-design/icons/CheckCircleOutlined';
import ConsoleSqlOutlined from '@ant-design/icons/ConsoleSqlOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import FunctionOutlined from '@ant-design/icons/FunctionOutlined';
import KeyOutlined from '@ant-design/icons/KeyOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import RocketOutlined from '@ant-design/icons/RocketOutlined';
import TableOutlined from '@ant-design/icons/TableOutlined';
import styled from 'styled-components';
import {
  ConstructCard,
  ConstructEmpty,
  ConstructGrid,
  ConstructLayout,
  ConstructToolbar,
  StatusTag,
} from '@/components/construct/ConstructLayout';
import ConnectDataSource from '@/components/pages/setup/ConnectDataSource';
import DefineRelations, {
  SelectedRecommendRelations,
} from '@/components/pages/setup/DefineRelations';
import SelectModels from '@/components/pages/setup/SelectModels';
import Starter from '@/components/pages/setup/Starter';
import {
  CompactTable,
  DataSourceName,
  RelationInput,
  SampleDatasetName,
  SyncStatus,
} from '@/apollo/client/graphql/__types__';
import { DATA_SOURCES, FORM_MODE, Path } from '@/utils/enum';
import {
  transformFormToProperties,
  transformPropertiesToForm,
} from '@/hooks/useSetupConnectionDataSource';

const { Paragraph, Text } = Typography;

type EditorStep =
  | 'source'
  | 'tables'
  | 'access'
  | 'modeling'
  | 'knowledge'
  | 'publish'
  | 'ask';

type DataProductSummary = {
  id: number;
  displayName: string;
  type: string;
  status: string;
  updatedAt?: string | null;
  modelCount: number;
  viewCount: number;
  deploymentStatus: string;
};

type DiagramModel = {
  id: string;
  modelId: number;
  displayName: string;
  referenceName: string;
  fields?: Array<{ id: string; columnId: number }>;
  calculatedFields?: Array<{ id: string; columnId: number }>;
  relationFields?: Array<Record<string, unknown>>;
};

type DataProductDetail = {
  id: number;
  displayName: string;
  dataSource: {
    type: DataSourceName;
    properties?: Record<string, unknown>;
    sampleDataset?: string;
  };
  diagram?: {
    models: DiagramModel[];
    views: Array<Record<string, unknown>>;
  };
  deploymentStatus?: string;
  modelCount?: number;
  viewCount?: number;
  knowledge?: {
    sqlPairCount: number;
    instructionCount: number;
  };
};

type DataProductRelations = Array<{
  id: number;
  displayName: string;
  referenceName: string;
  relations: Array<Record<string, unknown>>;
}>;

type RestRequestErrorPayload = {
  error?: string;
  message?: string;
  shortMessage?: string;
  code?: string;
  stage?: string;
  dependency?: string;
  advice?: string;
};

class RestRequestError extends Error {
  status: number;
  payload: RestRequestErrorPayload;

  constructor(status: number, payload: RestRequestErrorPayload) {
    super(
      payload?.message ||
        payload?.error ||
        `Request failed with HTTP ${status}`,
    );
    this.name = 'RestRequestError';
    this.status = status;
    this.payload = payload;
  }
}

const editorSteps: Array<{
  key: EditorStep;
  title: string;
  icon: React.ReactNode;
}> = [
  { key: 'source', title: 'Data source', icon: <DatabaseOutlined /> },
  { key: 'tables', title: 'Tables', icon: <TableOutlined /> },
  { key: 'access', title: 'Access', icon: <KeyOutlined /> },
  { key: 'modeling', title: 'Modeling', icon: <ConsoleSqlOutlined /> },
  { key: 'knowledge', title: 'Knowledge', icon: <FunctionOutlined /> },
  { key: 'publish', title: 'Publish', icon: <RocketOutlined /> },
  { key: 'ask', title: 'Ask', icon: <CheckCircleOutlined /> },
];

const editorStepKeys = editorSteps.map((step) => step.key);

const ProductRow = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 132px 148px 132px 148px;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const ProductNameButton = styled.button`
  display: inline-flex;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #111827;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover {
    color: #2867f5;
  }
`;

const EditorShell = styled.div`
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 620px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
`;

const StepRail = styled.div`
  padding: 18px;
  border-right: 1px solid #e2e8f0;
  background: #f8fafc;

  @media (max-width: 920px) {
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }
`;

const StepContent = styled.div`
  min-width: 0;
  padding: 24px;

  .ant-typography h1,
  h1.ant-typography {
    font-size: 24px;
    line-height: 1.25;
  }
`;

const CompactPanel = styled.div`
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 18px;
  background: #fff;
`;

const MetricGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
`;

const MetricItem = styled.div`
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
`;

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RestRequestError(response.status, payload);
  }
  return payload as T;
}

const formatDataSource = (type?: string) =>
  type
    ? type
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : 'Not connected';

const formatDate = (value?: string | null) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
};

const formatProductUpdated = (
  value?: string | null,
  deployStatus?: string | null,
) => {
  if (value) return formatDate(value);
  if (isSynchronized(deployStatus)) return 'Not available';
  return 'Never published';
};

const isSynchronized = (status?: string | null) =>
  status === SyncStatus.SYNCRONIZED || status === 'SYNCHRONIZED';

const formatDeployStatus = (status?: string | null) => {
  if (isSynchronized(status)) return 'Synchronized';
  if (status === SyncStatus.UNSYNCRONIZED) return 'Unsynchronized';
  if (status === SyncStatus.IN_PROGRESS) return 'Deploying';
  return status || 'Not deployed';
};

const getDataSourceName = (properties?: Record<string, unknown>) => {
  if (!properties) return 'WrenAI data product';
  return (
    (properties.displayName as string) ||
    (properties.name as string) ||
    (properties.database as string) ||
    (properties.databaseName as string) ||
    (properties.projectId as string) ||
    'WrenAI data product'
  );
};

const getCurrentStep = ({
  hasSource,
  modelCount,
  deployStatus,
}: {
  hasSource: boolean;
  modelCount: number;
  deployStatus?: string;
}) => {
  if (!hasSource) return 'source';
  if (modelCount === 0) return 'tables';
  if (isSynchronized(deployStatus)) return 'ask';
  return 'publish';
};

const relationsToInput = (
  relationsData: SelectedRecommendRelations,
): RelationInput[] =>
  Object.entries(relationsData).reduce<RelationInput[]>(
    (acc, [_modelName, relations]) => [
      ...acc,
      ...relations.map((relation) => ({
        fromModelId: Number(relation.fromField.modelId),
        fromColumnId: Number(relation.fromField.fieldId),
        toModelId: Number(relation.toField.modelId),
        toColumnId: Number(relation.toField.fieldId),
        type: relation.type,
      })),
    ],
    [],
  );

const buildRecommendRelations = (autoGenerateRelation = []) =>
  autoGenerateRelation.reduce(
    (acc, currentValue) => {
      const { displayName, referenceName, relations } = currentValue;
      acc.recommendRelations[referenceName] = (relations || []).map(
        (relation) => ({
          name: relation.name,
          fromField: {
            modelId: String(relation.fromModelId),
            modelName: relation.fromModelReferenceName,
            fieldId: String(relation.fromColumnId),
            fieldName: relation.fromColumnReferenceName,
          },
          toField: {
            modelId: String(relation.toModelId),
            modelName: relation.toModelReferenceName,
            fieldId: String(relation.toColumnId),
            fieldName: relation.toColumnReferenceName,
          },
          type: relation.type,
          isAutoGenerated: true,
        }),
      );
      acc.recommendNameMapping[referenceName] = displayName;
      return acc;
    },
    {
      recommendRelations: {},
      recommendNameMapping: {},
    } as {
      recommendRelations: SelectedRecommendRelations;
      recommendNameMapping: Record<string, string>;
    },
  );

export default function Database() {
  const router = useRouter();
  const mode = getQueryValue(router.query.mode);
  const projectId = Number(getQueryValue(router.query.projectId));
  const isCreating = mode === 'new';
  const isEditing = mode === 'edit';
  const isEditorMode = isCreating || isEditing;
  const queryStep = getQueryValue(router.query.step) as EditorStep | undefined;

  const [dataProducts, setDataProducts] = useState<DataProductSummary[]>([]);
  const [productDetail, setProductDetail] = useState<DataProductDetail | null>(
    null,
  );
  const [tables, setTables] = useState<CompactTable[]>([]);
  const [relationsData, setRelationsData] = useState<DataProductRelations>([]);
  const [listLoading, setListLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [sourceSubmitting, setSourceSubmitting] = useState(false);
  const [tablesSubmitting, setTablesSubmitting] = useState(false);
  const [relationsSubmitting, setRelationsSubmitting] = useState(false);
  const [deploySubmitting, setDeploySubmitting] = useState(false);
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSourceName>();
  const [connectError, setConnectError] = useState<Record<string, any>>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dataSource = productDetail?.dataSource;
  const dataSourceType = dataSource?.type;
  const hasSource = Boolean(dataSourceType);
  const canReadProject = Boolean(isEditing && projectId && productDetail);
  const models = canReadProject ? productDetail?.diagram?.models || [] : [];
  const views = canReadProject ? productDetail?.diagram?.views || [] : [];
  const modelCount = models.length;
  const fieldCount = models.reduce(
    (sum, model) => sum + (model?.fields?.length || 0),
    0,
  );
  const relationshipCount = models.reduce(
    (sum, model) => sum + (model?.relationFields?.length || 0),
    0,
  );
  const deployStatus = canReadProject
    ? productDetail?.deploymentStatus
    : undefined;
  const productName =
    productDetail?.displayName || getDataSourceName(dataSource?.properties);
  const suggestedStep = getCurrentStep({ hasSource, modelCount, deployStatus });
  const activeStep: EditorStep = editorStepKeys.includes(queryStep)
    ? queryStep
    : isCreating
      ? 'source'
      : suggestedStep;
  const activeStepIndex = editorSteps.findIndex(
    (step) => step.key === activeStep,
  );

  const loadDataProducts = async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const payload = await requestJson<{ data: DataProductSummary[] }>(
        '/api/data-products',
      );
      setDataProducts(payload.data || []);
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : 'Failed to load data products.';
      setLoadError(messageText);
      message.error(messageText);
    } finally {
      setListLoading(false);
    }
  };

  const loadProductDetail = async (id: number) => {
    setDetailLoading(true);
    setLoadError(null);
    try {
      const detail = await requestJson<DataProductDetail>(
        `/api/data-products/${id}`,
      );
      setProductDetail(detail);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to load data product.';
      setLoadError(messageText);
      message.error(messageText);
      setProductDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadTables = async (id: number) => {
    setTablesLoading(true);
    try {
      const payload = await requestJson<{ data: CompactTable[] }>(
        `/api/data-products/${id}/tables`,
      );
      setTables(payload.data || []);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : 'Failed to load tables.';
      setTables([]);
      message.error(messageText);
    } finally {
      setTablesLoading(false);
    }
  };

  const loadRelations = async (id: number) => {
    setRelationsLoading(true);
    try {
      const payload = await requestJson<{ data: DataProductRelations }>(
        `/api/data-products/${id}/relations`,
      );
      setRelationsData(payload.data || []);
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : 'Failed to load relationships.';
      setRelationsData([]);
      message.error(messageText);
    } finally {
      setRelationsLoading(false);
    }
  };

  useEffect(() => {
    if (!router.isReady) return;
    if (!isEditorMode) loadDataProducts();
  }, [router.isReady, isEditorMode]);

  useEffect(() => {
    if (!router.isReady) return;
    if (isCreating) {
      setProductDetail(null);
      setTables([]);
      setRelationsData([]);
      return;
    }
    if (isEditing && projectId) {
      loadProductDetail(projectId);
      return;
    }
    if (isEditing && !projectId) {
      setProductDetail(null);
    }
  }, [router.isReady, isCreating, isEditing, projectId]);

  useEffect(() => {
    if (!isEditing || !projectId) return;
    if (activeStep === 'tables') loadTables(projectId);
    if (activeStep === 'access') loadRelations(projectId);
  }, [isEditing, projectId, activeStep, modelCount]);

  const recommendRelationsResult = useMemo(
    () => buildRecommendRelations(relationsData as any),
    [relationsData],
  );

  const setEditorStep = (
    step: EditorStep,
    nextMode = projectId ? 'edit' : isCreating ? 'new' : 'edit',
    nextProjectId = projectId,
  ) => {
    const query: Record<string, string | number> = { mode: nextMode, step };
    if (nextMode === 'edit' && nextProjectId) query.projectId = nextProjectId;
    router.push(
      {
        pathname: Path.Database,
        query,
      },
      undefined,
      { shallow: true },
    );
  };

  const openEditor = (id: number, step: EditorStep = 'source') => {
    router.push(
      {
        pathname: Path.Database,
        query: { mode: 'edit', projectId: id, step },
      },
      undefined,
      { shallow: true },
    );
  };

  const openNewProduct = () => {
    setSelectedDataSource(undefined);
    setConnectError(null);
    setProductDetail(null);
    setTables([]);
    setRelationsData([]);
    router.push(
      {
        pathname: Path.Database,
        query: { mode: 'new', step: 'source' },
      },
      undefined,
      { shallow: true },
    );
  };

  const backToList = () => {
    setSelectedDataSource(undefined);
    setConnectError(null);
    setProductDetail(null);
    router.push(Path.Database, undefined, { shallow: true });
  };

  const parseRestError = (error: unknown) => {
    if (error instanceof RestRequestError) {
      return {
        ...error.payload,
        status: error.status,
        shortMessage:
          error.payload.shortMessage ||
          error.payload.error ||
          `Request failed with HTTP ${error.status}`,
        message:
          error.payload.message ||
          error.payload.error ||
          `Request failed with HTTP ${error.status}`,
      };
    }
    return {
      shortMessage: error instanceof Error ? error.message : 'Request failed.',
      message: error instanceof Error ? error.message : 'Request failed.',
    };
  };

  const onSourceNext = async (data: {
    dataSource?: DataSourceName;
    template?: SampleDatasetName;
    properties?: Record<string, any>;
  }) => {
    if (data.template) {
      try {
        setSourceSubmitting(true);
        setConnectError(null);
        const result = await requestJson<{ projectId: number }>(
          '/api/data-products',
          {
            method: 'POST',
            body: JSON.stringify({ template: data.template }),
          },
        );
        message.success('Sample data product created.');
        setSelectedDataSource(undefined);
        setEditorStep('modeling', 'edit', result.projectId);
      } catch (error) {
        setConnectError(parseRestError(error));
        message.error(
          error instanceof Error
            ? error.message
            : 'Failed to create sample data product.',
        );
      } finally {
        setSourceSubmitting(false);
      }
      return;
    }
    if (data.dataSource) {
      setSelectedDataSource(data.dataSource);
      setConnectError(null);
      return;
    }
    const type = isCreating
      ? selectedDataSource
      : selectedDataSource || dataSourceType;
    if (!type) return;

    try {
      setSourceSubmitting(true);
      setConnectError(null);
      const properties = transformFormToProperties(data.properties, type);
      if (isEditing && projectId) {
        await requestJson(`/api/data-products/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ type, properties }),
        });
        message.success(
          'Data source saved. Existing models for this product were reset.',
        );
        setSelectedDataSource(undefined);
        await loadProductDetail(projectId);
        setEditorStep('tables', 'edit', projectId);
      } else {
        const result = await requestJson<{ projectId: number }>(
          '/api/data-products',
          {
            method: 'POST',
            body: JSON.stringify({ type, properties }),
          },
        );
        message.success('Data product created.');
        setSelectedDataSource(undefined);
        setEditorStep('tables', 'edit', result.projectId);
      }
    } catch (error) {
      setConnectError(parseRestError(error));
    } finally {
      setSourceSubmitting(false);
    }
  };

  const onSaveTables = async (data: { selectedTables: string[] }) => {
    if (!projectId) return;
    try {
      setTablesSubmitting(true);
      await requestJson(`/api/data-products/${projectId}/tables`, {
        method: 'POST',
        body: JSON.stringify({ tables: data.selectedTables }),
      });
      await loadProductDetail(projectId);
      message.success('Tables saved.');
      setEditorStep('access', 'edit', projectId);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Failed to save tables.',
      );
    } finally {
      setTablesSubmitting(false);
    }
  };

  const onSaveRelations = async (data: {
    relations: SelectedRecommendRelations;
  }) => {
    if (!projectId) return;
    try {
      setRelationsSubmitting(true);
      const relations = relationsToInput(data.relations);
      await requestJson(`/api/data-products/${projectId}/relations`, {
        method: 'POST',
        body: JSON.stringify({ relations }),
      });
      await loadProductDetail(projectId);
      message.success('Relationships saved.');
      setEditorStep('modeling', 'edit', projectId);
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : 'Failed to save relationships.',
      );
    } finally {
      setRelationsSubmitting(false);
    }
  };

  const onPublish = async () => {
    if (!projectId) return;
    try {
      setDeploySubmitting(true);
      const result = await requestJson<{ status?: string; error?: string }>(
        `/api/data-products/${projectId}/deploy`,
        { method: 'POST' },
      );
      if (result.status === 'FAILED') {
        message.error(result.error || 'Failed to publish.');
        return;
      }
      message.success('Publish started.');
      await loadProductDetail(projectId);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : 'Failed to publish.',
      );
    } finally {
      setDeploySubmitting(false);
    }
  };

  const renderProductList = () => (
    <>
      <ConstructToolbar
        left={
          <>
            <Tag>
              {dataProducts.length} data product
              {dataProducts.length === 1 ? '' : 's'}
            </Tag>
          </>
        }
        right={<Button onClick={loadDataProducts}>Refresh</Button>}
      />

      {loadError && (
        <Alert
          className="mb-4"
          type="error"
          showIcon
          message="Unable to load data products"
          description={loadError}
        />
      )}

      <Spin spinning={listLoading}>
        {dataProducts.length ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {dataProducts.map((product) => {
              const step = getCurrentStep({
                hasSource: Boolean(product.type),
                modelCount: product.modelCount,
                deployStatus: product.deploymentStatus,
              });
              return (
                <ProductRow key={product.id}>
                  <div>
                    <ProductNameButton
                      onClick={() => openEditor(product.id, step)}
                    >
                      {product.displayName || `Data product ${product.id}`}
                    </ProductNameButton>
                    <div className="gray-7 text-sm mt-1">
                      {product.modelCount} models · {product.viewCount} views
                    </div>
                  </div>
                  <StatusTag
                    status={formatDeployStatus(product.deploymentStatus)}
                  />
                  <Tag icon={<DatabaseOutlined />}>
                    {formatDataSource(product.type)}
                  </Tag>
                  <Text className="gray-8">
                    {formatProductUpdated(
                      product.updatedAt,
                      product.deploymentStatus,
                    )}
                  </Text>
                  <Space>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openEditor(product.id, step)}
                    >
                      Configure
                    </Button>
                    <Link
                      href={{
                        pathname: Path.Home,
                        query: { projectId: product.id },
                      }}
                    >
                      <Button size="small" type="primary">
                        Ask
                      </Button>
                    </Link>
                  </Space>
                </ProductRow>
              );
            })}
          </Space>
        ) : (
          <ConstructEmpty
            title="No data products"
            description="Create a data product by connecting a real datasource, selecting tables, modeling, publishing, and asking questions against that project."
            action={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={openNewProduct}
              >
                New data product
              </Button>
            }
          />
        )}
      </Spin>
    </>
  );

  const renderSourceStep = () => {
    const typeForForm = (isCreating
      ? selectedDataSource
      : selectedDataSource || dataSourceType) as unknown as
      | DATA_SOURCES
      | undefined;
    const initialValues =
      isEditing && hasSource && dataSourceType
        ? transformPropertiesToForm(
            dataSource?.properties || {},
            dataSourceType,
          )
        : undefined;

    if (!typeForForm) {
      return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {connectError && (
            <Alert
              type="error"
              showIcon
              message={
                connectError.shortMessage || 'Unable to create data product'
              }
              description={connectError.message}
            />
          )}
          <Starter submitting={sourceSubmitting} onNext={onSourceNext} />
        </Space>
      );
    }

    return (
      <ConnectDataSource
        dataSource={typeForForm}
        initialValues={initialValues}
        mode={isEditing && hasSource ? FORM_MODE.EDIT : FORM_MODE.CREATE}
        connectError={connectError}
        submitting={sourceSubmitting}
        submitText={isEditing && hasSource ? 'Save and continue' : 'Connect'}
        onBack={() => {
          if (selectedDataSource) {
            setSelectedDataSource(undefined);
          } else {
            backToList();
          }
        }}
        onNext={onSourceNext}
      />
    );
  };

  const renderTablesStep = () => {
    if (!projectId) {
      return (
        <Alert
          type="info"
          showIcon
          message="Connect a data source first"
          action={
            <Button onClick={() => setEditorStep('source')}>Open source</Button>
          }
        />
      );
    }
    return (
      <SelectModels
        fetching={tablesLoading}
        tables={tables || []}
        submitting={tablesSubmitting}
        onBack={() => setEditorStep('source', 'edit', projectId)}
        onNext={onSaveTables}
      />
    );
  };

  const renderAccessStep = () => {
    if (!projectId) {
      return (
        <Alert
          type="info"
          showIcon
          message="Select tables before configuring relationships"
          action={
            <Button onClick={() => setEditorStep('tables')}>Open tables</Button>
          }
        />
      );
    }
    if (modelCount === 0) {
      return (
        <Alert
          type="info"
          showIcon
          message="Select tables before configuring relationships"
          description="Access in this WrenAI flow is relationship recommendation. User, department, or region row-level permissions are not exposed by the current backend."
          action={
            <Button onClick={() => setEditorStep('tables', 'edit', projectId)}>
              Open
            </Button>
          }
        />
      );
    }
    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="Relationship recommendations"
          description="The current WrenAI backend exposes relationship recommendation here. Data permissions by user, department, or region are not available, so this step does not pretend to configure access control."
        />
        <DefineRelations
          fetching={relationsLoading}
          {...recommendRelationsResult}
          submitting={relationsSubmitting}
          onBack={() => setEditorStep('tables', 'edit', projectId)}
          onNext={onSaveRelations}
          onSkip={() => setEditorStep('modeling', 'edit', projectId)}
        />
      </Space>
    );
  };

  const renderModelingStep = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <CompactPanel>
          <MetricGrid>
            {[
              { label: 'Models', value: modelCount },
              { label: 'Fields', value: fieldCount },
              { label: 'Relationships', value: relationshipCount },
              { label: 'Views', value: views.length },
            ].map((item) => (
              <MetricItem key={item.label}>
                <div className="gray-7 text-sm">{item.label}</div>
                <div className="gray-10 text-lg text-bold mt-1">
                  {item.value}
                </div>
              </MetricItem>
            ))}
          </MetricGrid>
        </CompactPanel>
      </Col>
      <Col xs={24} lg={10}>
        <CompactPanel>
          <Paragraph className="gray-7 mb-4">
            The Database flow stores models, columns, relations, views, deploy
            logs, instructions, and Question-SQL pairs under this data product's
            projectId. Open the semantic modeling canvas to adjust model fields,
            calculated fields, relationships, and deployment for this project.
          </Paragraph>
          <Link
            href={{
              pathname: Path.Modeling,
              query: projectId ? { projectId } : {},
            }}
          >
            <Button type="primary" icon={<ConsoleSqlOutlined />}>
              Open semantic modeling
            </Button>
          </Link>
        </CompactPanel>
      </Col>
    </Row>
  );

  const renderKnowledgeStep = () => (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        showIcon
        type="info"
        message="WrenAI project knowledge"
        description="Question-SQL pairs and Instructions are stored under this data product's projectId and can be edited without leaving the data product context."
      />
      <ConstructGrid>
        <ConstructCard
          icon={<FunctionOutlined />}
          title="Question-SQL pairs"
          description={`${productDetail?.knowledge?.sqlPairCount || 0} pairs attached to this project.`}
          footer={
            <Link
              href={{
                pathname: Path.KnowledgeQuestionSQLPairs,
                query: projectId ? { projectId } : {},
              }}
            >
              <Button size="small">Open</Button>
            </Link>
          }
        />
        <ConstructCard
          icon={<FunctionOutlined />}
          title="Instructions"
          description={`${productDetail?.knowledge?.instructionCount || 0} instructions attached to this project.`}
          footer={
            <Link
              href={{
                pathname: Path.KnowledgeInstructions,
                query: projectId ? { projectId } : {},
              }}
            >
              <Button size="small">Open</Button>
            </Link>
          }
        />
      </ConstructGrid>
    </Space>
  );

  const renderPublishStep = () => (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={12}>
        <CompactPanel>
          <Space direction="vertical" size={12}>
            <Text strong>Deployment status</Text>
            <StatusTag status={formatDeployStatus(deployStatus)} />
            <Text className="gray-7 text-sm">
              Publish builds MDL from this projectId and deploys it with a hash
              that includes the same projectId, so publishing this data product
              does not overwrite another project's database rows.
            </Text>
            <Button
              type="primary"
              icon={<RocketOutlined />}
              loading={deploySubmitting}
              disabled={
                !projectId ||
                modelCount === 0 ||
                isSynchronized(deployStatus) ||
                deployStatus === SyncStatus.IN_PROGRESS
              }
              onClick={onPublish}
            >
              Publish data product
            </Button>
          </Space>
        </CompactPanel>
      </Col>
      <Col xs={24} lg={12}>
        <CompactPanel>
          <Space direction="vertical" size={12}>
            <Text strong>Publish history</Text>
            <Link href={Path.APIManagementHistory}>
              <Button icon={<ApiOutlined />}>Open history</Button>
            </Link>
          </Space>
        </CompactPanel>
      </Col>
    </Row>
  );

  const renderAskStep = () => (
    <CompactPanel>
      <Space direction="vertical" size={12}>
        <Text strong>Runtime</Text>
        <Text className="gray-7">
          Ask opens WrenAI's GenBI conversation surface with this projectId in
          the URL. The legacy Ask GraphQL resolver still defaults to current
          project, so project-scoped Ask execution needs the next backend slice
          before this can be fully enabled.
        </Text>
        <Link href={{ pathname: Path.Home, query: { projectId } }}>
          <Button type="primary" disabled={!projectId}>
            Ask data product
          </Button>
        </Link>
      </Space>
    </CompactPanel>
  );

  const renderEditorStep = () => {
    switch (activeStep) {
      case 'source':
        return renderSourceStep();
      case 'tables':
        return renderTablesStep();
      case 'access':
        return renderAccessStep();
      case 'modeling':
        return renderModelingStep();
      case 'knowledge':
        return renderKnowledgeStep();
      case 'publish':
        return renderPublishStep();
      case 'ask':
        return renderAskStep();
      default:
        return null;
    }
  };

  const renderEditor = () => (
    <>
      <ConstructToolbar
        left={
          <>
            <Button icon={<ArrowLeftOutlined />} onClick={backToList}>
              Data product
            </Button>
            {canReadProject && <Tag>{productName}</Tag>}
          </>
        }
        right={
          canReadProject && (
            <Link href={{ pathname: Path.Home, query: { projectId } }}>
              <Button type="primary">Ask current product</Button>
            </Link>
          )
        }
      />
      <EditorShell>
        <StepRail>
          <Steps
            direction="vertical"
            size="small"
            current={activeStepIndex}
            onChange={(index) => setEditorStep(editorSteps[index].key)}
          >
            {editorSteps.map((step) => (
              <Steps.Step key={step.key} title={step.title} icon={step.icon} />
            ))}
          </Steps>
        </StepRail>
        <StepContent>
          <Spin spinning={detailLoading}>{renderEditorStep()}</Spin>
        </StepContent>
      </EditorShell>
    </>
  );

  return (
    <ConstructLayout
      activeKey="database"
      icon={<ConsoleSqlOutlined />}
      title="Database"
      description="Data products"
      loading={!isEditorMode && listLoading && !dataProducts.length}
      actions={
        !isEditorMode && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openNewProduct}
          >
            New data product
          </Button>
        )
      }
    >
      {isEditorMode ? renderEditor() : renderProductList()}
    </ConstructLayout>
  );
}
