import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { promisify } from 'util';
import * as Errors from '@/apollo/server/utils/error';
import {
  AnalysisRelationInfo,
  DataSourceName,
  DataSourceProperties,
  RelationData,
  RelationType,
} from '@/apollo/server/types';
import { components } from '@/common';
import {
  Project,
  DUCKDB_CONNECTION_INFO,
  WREN_AI_CONNECTION_INFO,
} from '@/apollo/server/repositories';
import { CompactTable, ProjectData } from '@/apollo/server/services';
import { MDLBuilder } from '@/apollo/server/mdl/mdlBuilder';
import { encryptConnectionInfo } from '@/apollo/server/dataSource';
import {
  handleNestedColumns,
  replaceInvalidReferenceName,
  transformInvalidColumnName,
  trim,
} from '@/apollo/server/utils';
import { DuckDBPrepareOptions } from '@/apollo/server/adaptors/wrenEngineAdaptor';
import {
  getRelations,
  SampleDatasetName,
  sampleDatasets,
  SampleDatasetRelationship,
  SampleDatasetTable,
} from '@/apollo/server/data';

const {
  askingService,
  dashboardItemRepository,
  dashboardRepository,
  deployService,
  instructionService,
  mdlService,
  modelColumnRepository,
  modelNestedColumnRepository,
  modelRepository,
  projectRepository,
  projectService,
  relationRepository,
  schemaChangeRepository,
  sqlPairRepository,
  viewRepository,
  wrenAIAdaptor,
  wrenEngineAdaptor,
} = components;

export type DataProductSummary = {
  id: number;
  displayName: string;
  type: string;
  status: string;
  updatedAt: string | null;
  modelCount: number;
  viewCount: number;
  deploymentStatus: string;
};

type ProjectRelationInput = {
  fromModelId: number;
  fromColumnId: number;
  toModelId: number;
  toColumnId: number;
  type: RelationType;
  description?: string;
};

type RelationCandidate = ProjectRelationInput & {
  score: number;
};

const sampleDatasetDisplayNames: Record<SampleDatasetName, string> = {
  [SampleDatasetName.ECOMMERCE]: 'E-commerce sample',
  [SampleDatasetName.HR]: 'Human Resource sample',
  [SampleDatasetName.MUSIC]: 'Music sample',
  [SampleDatasetName.NBA]: 'NBA sample',
};

const SAMPLE_DATA_HOST_DIR =
  process.env.WREN_SAMPLE_DATA_HOST_DIR ||
  path.resolve(process.cwd(), '../docker/data/sample-data');
const SAMPLE_DATA_ENGINE_DIR =
  process.env.WREN_SAMPLE_DATA_ENGINE_DIR || '/usr/src/app/data/sample-data';
const SAMPLE_DOWNLOAD_RETRY_COUNT = 3;
const SAMPLE_DOWNLOAD_TIMEOUT_MS = 120_000;
const execFileAsync = promisify(execFile);

class DataProductApiError extends Error {
  statusCode: number;
  code: string;
  shortMessage: string;
  stage: string;
  dependency?: string;
  advice: string;

  constructor({
    message,
    statusCode = 500,
    code = Errors.GeneralErrorCodes.INTERNAL_SERVER_ERROR,
    shortMessage,
    stage,
    dependency,
    advice,
  }: {
    message: string;
    statusCode?: number;
    code?: string;
    shortMessage?: string;
    stage: string;
    dependency?: string;
    advice: string;
  }) {
    super(message);
    this.name = 'DataProductApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.shortMessage = shortMessage || message;
    this.stage = stage;
    this.dependency = dependency;
    this.advice = advice;
  }
}

const getSampleDatasetKey = (name: SampleDatasetName) => name.toLowerCase();

const getSampleFileName = (filePath: string) => {
  try {
    return path.basename(new URL(filePath).pathname);
  } catch (_error) {
    return path.basename(filePath);
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatUnknownError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const quoteSqlString = (value: string) => value.replace(/'/g, "''");

const validateDownloadedFile = async (filePath: string) => {
  const stat = await fs.promises.stat(filePath);
  if (!stat.size) {
    throw new Error('downloaded file is empty');
  }
};

const downloadSampleFileWithCurl = async (url: string, tmpPath: string) => {
  await execFileAsync(
    'curl',
    [
      '--fail',
      '--location',
      '--silent',
      '--show-error',
      '--connect-timeout',
      '30',
      '--max-time',
      String(Math.ceil(SAMPLE_DOWNLOAD_TIMEOUT_MS / 1000)),
      '--output',
      tmpPath,
      url,
    ],
    { maxBuffer: 1024 * 1024 },
  );
  await validateDownloadedFile(tmpPath);
};

const downloadSampleFileWithFetch = async (url: string, tmpPath: string) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    SAMPLE_DOWNLOAD_TIMEOUT_MS,
  );
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    await pipeline(
      Readable.fromWeb(response.body as any),
      fs.createWriteStream(tmpPath),
    );
    await validateDownloadedFile(tmpPath);
  } finally {
    clearTimeout(timer);
  }
};

const downloadSampleFile = async (url: string, hostPath: string) => {
  const tmpPath = `${hostPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    for (
      let attempt = 1;
      attempt <= SAMPLE_DOWNLOAD_RETRY_COUNT;
      attempt += 1
    ) {
      try {
        try {
          await downloadSampleFileWithCurl(url, tmpPath);
        } catch (curlError) {
          await fs.promises.rm(tmpPath, { force: true }).catch(() => undefined);
          try {
            await downloadSampleFileWithFetch(url, tmpPath);
          } catch (fetchError) {
            throw new Error(
              `curl failed: ${formatUnknownError(
                curlError,
              )}; fetch failed: ${formatUnknownError(fetchError)}`,
            );
          }
        }
        await fs.promises.rename(tmpPath, hostPath);
        return;
      } catch (error) {
        await fs.promises.rm(tmpPath, { force: true }).catch(() => undefined);
        if (attempt === SAMPLE_DOWNLOAD_RETRY_COUNT) {
          throw new DataProductApiError({
            message: `Unable to download sample file ${url}: ${formatUnknownError(
              error,
            )}`,
            statusCode: 503,
            code: Errors.GeneralErrorCodes.CONNECTION_ERROR,
            shortMessage: 'Sample data download failed',
            stage: 'sample_data_download',
            dependency: 'assets.getwren.ai',
            advice:
              'Check network access to the WrenAI sample data host and retry the sample data product creation.',
          });
        }
        await sleep(500 * attempt);
      }
    }
  } finally {
    await fs.promises.rm(tmpPath, { force: true }).catch(() => undefined);
  }
};

const ensureSampleFile = async (
  datasetName: SampleDatasetName,
  table: SampleDatasetTable,
) => {
  const datasetKey = getSampleDatasetKey(datasetName);
  const fileName = getSampleFileName(table.filePath);
  const hostDir = path.join(SAMPLE_DATA_HOST_DIR, datasetKey);
  const hostPath = path.join(hostDir, fileName);
  await fs.promises.mkdir(hostDir, { recursive: true });
  const stat = await fs.promises.stat(hostPath).catch(() => null);
  if (stat?.size) {
    return {
      hostPath,
      enginePath: `${SAMPLE_DATA_ENGINE_DIR}/${datasetKey}/${fileName}`,
    };
  }
  await downloadSampleFile(table.filePath, hostPath);
  return {
    hostPath,
    enginePath: `${SAMPLE_DATA_ENGINE_DIR}/${datasetKey}/${fileName}`,
  };
};

const buildSampleInitSql = async (datasetName: SampleDatasetName) => {
  const dataset = sampleDatasets[getSampleDatasetKey(datasetName)];
  if (!dataset) throw new Error(`Sample dataset ${datasetName} was not found.`);
  const statements: string[] = [];
  for (const table of dataset.tables) {
    const { enginePath } = await ensureSampleFile(datasetName, table);
    const fileExtension = enginePath.split('.').pop();
    if (fileExtension !== 'csv' && fileExtension !== 'parquet') {
      throw new DataProductApiError({
        message: `Unsupported sample file type: ${fileExtension}`,
        statusCode: 400,
        code: Errors.GeneralErrorCodes.INIT_SQL_ERROR,
        shortMessage: 'Unsupported sample file type',
        stage: 'sample_data_prepare',
        dependency: 'DuckDB',
        advice: 'Use CSV or Parquet sample files for DuckDB sample products.',
      });
    }
    const schema = table.schema
      ?.map(({ columnName, dataType }) => `'${columnName}': '${dataType}'`)
      .join(', ');
    const schemaPart =
      fileExtension === 'csv' && schema ? `, columns={${schema}}` : '';
    const headerPart = fileExtension === 'csv' ? ',header=true' : '';
    statements.push(
      `CREATE TABLE ${table.tableName} AS select * FROM read_${fileExtension}('${quoteSqlString(
        enginePath,
      )}'${headerPart}${schemaPart});`,
    );
  }
  return statements.join('\n');
};

const concatDuckDbInitSql = (initSql: string, extensions: string[]) =>
  trim(
    `${(extensions || []).map((ext) => `INSTALL ${ext};`).join('\n')}\n${initSql || ''}`,
  );

const prepareDuckDb = async (connectionInfo: DUCKDB_CONNECTION_INFO) => {
  await wrenEngineAdaptor.prepareDuckDB({
    sessionProps: connectionInfo.configurations || {},
    initSql: concatDuckDbInitSql(
      connectionInfo.initSql,
      connectionInfo.extensions || [],
    ),
  } as DuckDBPrepareOptions);
  await wrenEngineAdaptor.patchConfig({ 'wren.datasource.type': 'duckdb' });
  return wrenEngineAdaptor.listTables();
};

export const getProjectOrThrow = async (projectId: number) => {
  const project = await projectService.getProjectById(projectId);
  if (!project) throw new Error(`Data product ${projectId} was not found.`);
  return project;
};

const getDeploymentStatus = async (projectId: number) => {
  const { manifest } = await mdlService.makeModelMDL(projectId);
  const currentHash = deployService.createMDLHash(manifest, projectId);
  const inProgress = await deployService.getInProgressDeployment(projectId);
  if (inProgress) return 'IN_PROGRESS';
  const lastDeploy = await deployService.getLastDeployment(projectId);
  return currentHash === lastDeploy?.hash ? 'SYNCHRONIZED' : 'UNSYNCHRONIZED';
};

const toGeneralConnectionInfo = (project: Project) => ({
  displayName: project.displayName,
  ...projectService.getGeneralConnectionInfo(project),
});

const ensureProjectDashboard = async (projectId: number) => {
  const dashboard = await dashboardRepository.findOneBy({ projectId });
  if (dashboard) return dashboard;
  return dashboardRepository.createOne({
    name: 'Dashboard',
    projectId,
  });
};

const singularizeIdentifier = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith('s')) return normalized.slice(0, -1);
  return normalized;
};

const normalizeIdentifier = (value: string) =>
  singularizeIdentifier(value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());

const isLikelyPrimaryKeyName = (tableName: string, columnName: string) => {
  const normalizedTable = normalizeIdentifier(tableName);
  const normalizedColumn = normalizeIdentifier(columnName);
  return (
    normalizedColumn === 'id' ||
    normalizedColumn === `${normalizedTable}id` ||
    normalizedColumn === `${normalizedTable}key`
  );
};

const getRelationKey = (relation: ProjectRelationInput) =>
  `${relation.fromModelId}:${relation.fromColumnId}:${relation.toModelId}:${relation.toColumnId}`;

const inferProjectRelations = (
  models: Array<{ id: number; sourceTableName: string }>,
  columns: Array<{
    id: number;
    modelId: number;
    sourceColumnName: string;
    referenceName: string;
    isPk?: boolean;
  }>,
) => {
  const candidates: RelationCandidate[] = [];
  for (const fromModel of models) {
    const fromColumns = columns.filter(
      (column) => column.modelId === fromModel.id,
    );
    for (const fromColumn of fromColumns) {
      if (!fromColumn.sourceColumnName.toLowerCase().endsWith('_id')) continue;
      for (const toModel of models) {
        if (fromModel.id === toModel.id) continue;
        const toColumns = columns.filter((column) => column.modelId === toModel.id);
        const matchingPrimaryColumn =
          toColumns.find(
            (column) =>
              column.isPk &&
              column.sourceColumnName === fromColumn.sourceColumnName,
          ) ||
          toColumns.find(
            (column) =>
              column.sourceColumnName === fromColumn.sourceColumnName &&
              isLikelyPrimaryKeyName(
                toModel.sourceTableName,
                column.sourceColumnName,
              ),
          );
        if (!matchingPrimaryColumn) continue;
        candidates.push({
          fromModelId: fromModel.id,
          fromColumnId: fromColumn.id,
          toModelId: toModel.id,
          toColumnId: matchingPrimaryColumn.id,
          type: RelationType.MANY_TO_ONE,
          description: `Inferred from ${fromModel.sourceTableName}.${fromColumn.sourceColumnName} to ${toModel.sourceTableName}.${matchingPrimaryColumn.sourceColumnName}.`,
          score: matchingPrimaryColumn.isPk ? 3 : 2,
        });
      }
    }
  }

  return Array.from(
    candidates
      .sort((left, right) => right.score - left.score)
      .reduce((acc, relation) => {
        const key = getRelationKey(relation);
        if (!acc.has(key)) acc.set(key, relation);
        return acc;
      }, new Map<string, RelationCandidate>())
      .values(),
  ).map(({ score: _score, ...relation }) => relation);
};

const getProjectRelationInputs = async (projectId: number) => {
  const models = await modelRepository.findAllBy({ projectId });
  const columns = await modelColumnRepository.findColumnsByModelIds(
    models.map((model) => model.id),
  );
  return {
    models,
    columns,
    inferredRelations: inferProjectRelations(models, columns),
  };
};

const deleteProjectModelsAndRelations = async (projectId: number) => {
  await relationRepository.deleteAllBy({ projectId });
  const models = await modelRepository.findAllBy({ projectId });
  const modelIds = models.map((model) => model.id);
  if (modelIds.length) {
    for (const modelId of modelIds) {
      await modelNestedColumnRepository.deleteAllBy({ modelId });
    }
    await modelColumnRepository.deleteByModelIds(modelIds);
  }
  await modelRepository.deleteAllBy({ projectId });
};

const clearProjectSemanticState = async (projectId: number) => {
  await schemaChangeRepository.deleteAllBy({ projectId });
  await deployService.deleteAllByProjectId(projectId);
  await askingService.deleteAllByProjectId(projectId);
  await viewRepository.deleteAllBy({ projectId });
  await deleteProjectModelsAndRelations(projectId);
};

export const getProjectSettings = async (projectId: number) => {
  const project = await getProjectOrThrow(projectId);
  return {
    id: project.id,
    displayName: project.displayName,
    language: project.language,
    dataSource: {
      type: project.type,
      properties: toGeneralConnectionInfo(project) as DataSourceProperties,
      sampleDataset: project.sampleDataset,
    },
  };
};

export const buildProjectDiagram = async (projectId: number) => {
  const project = await getProjectOrThrow(projectId);
  const models = await modelRepository.findAllBy({ projectId });
  const modelIds = models.map((model) => model.id);
  const columns = await modelColumnRepository.findColumnsByModelIds(modelIds);
  const nestedColumns =
    await modelNestedColumnRepository.findNestedColumnsByModelIds(modelIds);
  const relations = await relationRepository.findRelationInfoBy(
    { projectId },
    undefined,
  );
  const views = await viewRepository.findAllBy({ projectId });
  const mdlBuilder = new MDLBuilder({
    project,
    models,
    columns,
    nestedColumns,
    relations,
    views,
    relatedModels: models,
    relatedColumns: columns,
    relatedRelations: relations,
  });
  const manifest = mdlBuilder.build();
  const diagramModels = models.map((model) => {
    const allColumns = columns.filter((column) => column.modelId === model.id);
    const modelMDL = manifest.models.find(
      (item) => item.name === model.referenceName,
    );
    return {
      id: String(model.id),
      modelId: model.id,
      nodeType: 'MODEL',
      displayName: model.displayName,
      referenceName: model.referenceName,
      sourceTableName: model.sourceTableName,
      refSql: model.refSql,
      refreshTime: model.refreshTime,
      cached: model.cached,
      description: model.properties
        ? JSON.parse(model.properties)?.description
        : undefined,
      fields: allColumns
        .filter((column) => !column.isCalculated)
        .map((column) => ({
          id: String(column.id),
          columnId: column.id,
          nodeType: 'FIELD',
          type: column.type,
          displayName: column.displayName,
          referenceName: column.referenceName,
          description: column.properties
            ? JSON.parse(column.properties)?.description
            : undefined,
          isPrimaryKey: column.isPk,
          expression: column.aggregation,
          nestedFields: nestedColumns
            .filter((nested) => nested.columnId === column.id)
            .map((nested) => ({
              id: String(nested.id),
              nestedColumnId: nested.id,
              columnPath: nested.columnPath,
              type: nested.type,
              displayName: nested.displayName,
              referenceName: nested.referenceName,
              description: nested.properties?.description,
            })),
        })),
      calculatedFields: allColumns
        .filter((column) => column.isCalculated)
        .map((column) => ({
          id: String(column.id),
          columnId: column.id,
          nodeType: 'CALCULATED_FIELD',
          type: column.type,
          displayName: column.displayName,
          referenceName: column.referenceName,
          description: column.properties
            ? JSON.parse(column.properties)?.description
            : undefined,
          isPrimaryKey: column.isPk,
          aggregation: column.aggregation,
          expression: modelMDL?.columns?.find(
            (item) => item.name === column.referenceName,
          )?.expression,
        })),
      relationFields: relations
        .filter(
          (relation) =>
            relation.fromModelId === model.id ||
            relation.toModelId === model.id,
        )
        .map((relation) => ({
          id: String(relation.id),
          relationId: relation.id,
          nodeType: 'RELATION',
          displayName:
            relation.fromModelId === model.id
              ? relation.toModelDisplayName
              : relation.fromModelDisplayName,
          referenceName:
            relation.fromModelId === model.id
              ? relation.toModelName
              : relation.fromModelName,
          type: relation.joinType,
          fromModelId: relation.fromModelId,
          fromModelName: relation.fromModelName,
          fromModelDisplayName: relation.fromModelDisplayName,
          fromColumnId: relation.fromColumnId,
          fromColumnName: relation.fromColumnName,
          fromColumnDisplayName: relation.fromColumnDisplayName,
          toModelId: relation.toModelId,
          toModelName: relation.toModelName,
          toModelDisplayName: relation.toModelDisplayName,
          toColumnId: relation.toColumnId,
          toColumnName: relation.toColumnName,
          toColumnDisplayName: relation.toColumnDisplayName,
        })),
    };
  });
  return {
    models: diagramModels,
    views: views.map((view) => {
      const properties = view.properties ? JSON.parse(view.properties) : {};
      return {
        id: String(view.id),
        viewId: view.id,
        nodeType: 'VIEW',
        statement: view.statement,
        referenceName: view.name,
        displayName: properties.displayName || view.name,
        fields: properties.columns || [],
        description: properties.description,
      };
    }),
  };
};

export const listDataProducts = async (): Promise<DataProductSummary[]> => {
  const projects = await projectRepository.findAll({ order: 'id' });
  return Promise.all(
    projects.map(async (project) => {
      const [models, views, lastDeploy, lastSchemaChange] = await Promise.all([
        modelRepository.findAllBy({ projectId: project.id }),
        viewRepository.findAllBy({ projectId: project.id }),
        deployService.getLastDeployment(project.id),
        schemaChangeRepository.findLastSchemaChange(project.id),
      ]);
      const deploymentStatus = await getDeploymentStatus(project.id);
      const deployLog = lastDeploy as {
        createdAt?: string;
        updatedAt?: string;
      } | null;
      return {
        id: project.id,
        displayName: project.displayName,
        type: String(project.type),
        status:
          deploymentStatus === 'SYNCHRONIZED'
            ? 'published'
            : models.length
              ? 'configured'
              : 'source_connected',
        updatedAt:
          lastSchemaChange?.createdAt ||
          deployLog?.updatedAt ||
          deployLog?.createdAt ||
          null,
        modelCount: models.length,
        viewCount: views.length,
        deploymentStatus,
      };
    }),
  );
};

export const getDataProduct = async (projectId: number) => {
  const [settings, diagram, deploymentStatus, sqlPairs, instructions] =
    await Promise.all([
      getProjectSettings(projectId),
      buildProjectDiagram(projectId),
      getDeploymentStatus(projectId),
      sqlPairRepository.findAllBy({ projectId }),
      instructionService.getInstructions(projectId),
    ]);
  return {
    ...settings,
    diagram,
    deploymentStatus,
    knowledge: {
      sqlPairCount: sqlPairs.length,
      instructionCount: instructions.length,
    },
    modelCount: diagram.models.length,
    viewCount: diagram.views.length,
  };
};

export const createDataProduct = async (data: {
  type: DataSourceName;
  properties: Record<string, any>;
}) => {
  const { type, properties } = data;
  const { displayName, ...connectionInfo } = properties;
  const project = await projectService.createProject({
    displayName,
    type,
    connectionInfo,
  } as ProjectData);
  try {
    await ensureProjectDashboard(project.id);
    if (type === DataSourceName.DUCKDB) {
      await prepareDuckDb(connectionInfo as DUCKDB_CONNECTION_INFO);
    } else {
      await projectService.getProjectDataSourceTables(project);
      const version = await projectService.getProjectDataSourceVersion(project);
      await projectService.updateProject(project.id, { version });
    }
    return {
      projectId: project.id,
      settings: await getProjectSettings(project.id),
    };
  } catch (error) {
    await deleteDataProduct(project.id, { deleteFromWrenAI: false });
    throw error;
  }
};

export const updateDataProductSource = async (
  projectId: number,
  data: {
    type?: DataSourceName;
    properties: Record<string, any>;
  },
) => {
  const project = await getProjectOrThrow(projectId);
  const type = data.type || project.type;
  const { displayName = project.displayName, ...connectionInfo } =
    data.properties;
  const encryptedConnectionInfo = encryptConnectionInfo(
    type,
    connectionInfo as WREN_AI_CONNECTION_INFO,
  );
  const candidate = {
    ...project,
    displayName,
    type,
    connectionInfo: encryptedConnectionInfo,
  };

  if (type === DataSourceName.DUCKDB) {
    await prepareDuckDb(connectionInfo as DUCKDB_CONNECTION_INFO);
  } else {
    await projectService.getProjectDataSourceTables(candidate);
  }

  await projectService.updateProject(projectId, {
    displayName,
    type,
    connectionInfo: encryptedConnectionInfo,
    version: null,
    sampleDataset: null,
  } as Partial<Project>);
  await ensureProjectDashboard(projectId);
  await clearProjectSemanticState(projectId);

  if (type !== DataSourceName.DUCKDB) {
    const updatedProject = await getProjectOrThrow(projectId);
    const version =
      await projectService.getProjectDataSourceVersion(updatedProject);
    await projectService.updateProject(projectId, { version });
  }

  return {
    projectId,
    settings: await getProjectSettings(projectId),
  };
};

export const listProjectTables = async (projectId: number) => {
  const project = await getProjectOrThrow(projectId);
  return projectService.getProjectDataSourceTables(project);
};

export const saveProjectTables = async (
  projectId: number,
  tables: string[],
) => {
  const project = await getProjectOrThrow(projectId);
  const compactTables: CompactTable[] =
    await projectService.getProjectDataSourceTables(project);
  return saveProjectTablesFromMetadata(projectId, tables, compactTables);
};

const saveProjectTablesFromMetadata = async (
  projectId: number,
  tables: string[],
  compactTables: CompactTable[],
) => {
  await deleteProjectModelsAndRelations(projectId);
  const selectedTables = compactTables.filter((table) =>
    tables.includes(table.name),
  );
  const models = await modelRepository.createMany(
    selectedTables.map((table) => ({
      projectId,
      displayName: table.name,
      referenceName: replaceInvalidReferenceName(table.name),
      sourceTableName: table.name,
      cached: false,
      refreshTime: null,
      properties: table.properties ? JSON.stringify(table.properties) : null,
    })),
  );
  const columns = await modelColumnRepository.createMany(
    selectedTables.flatMap((table) => {
      const model = models.find((item) => item.sourceTableName === table.name);
      return table.columns.map((column) => ({
        modelId: model.id,
        isCalculated: false,
        displayName: column.name,
        referenceName: transformInvalidColumnName(column.name),
        sourceColumnName: column.name,
        type: column.type || 'string',
        notNull: column.notNull || false,
        isPk: table.primaryKey === column.name,
        properties: column.properties
          ? JSON.stringify(column.properties)
          : null,
      }));
    }),
  );
  await modelNestedColumnRepository.createMany(
    selectedTables
      .flatMap((table) => table.columns)
      .flatMap((column) => {
        const saved = columns.find(
          (item) => item.sourceColumnName === column.name,
        );
        if (!saved) return [];
        return handleNestedColumns(column, {
          modelId: saved.modelId,
          columnId: saved.id,
          sourceColumnName: saved.sourceColumnName,
        });
      }),
  );
  return { models, columns };
};

export const getProjectRelations = async (projectId: number) => {
  const project = await getProjectOrThrow(projectId);
  const models = await modelRepository.findAllBy({ projectId });
  const modelIds = models.map((model) => model.id);
  const columns = await modelColumnRepository.findColumnsByModelIds(modelIds);
  const constraints =
    await projectService.getProjectSuggestedConstraint(project);
  const relations: AnalysisRelationInfo[] = [];
  for (const constraint of constraints) {
    const fromModel = models.find(
      (model) => model.sourceTableName === constraint.constraintTable,
    );
    const toModel = models.find(
      (model) => model.sourceTableName === constraint.constraintedTable,
    );
    if (!fromModel || !toModel) continue;
    const fromColumn = columns.find(
      (column) =>
        column.modelId === fromModel.id &&
        column.sourceColumnName === constraint.constraintColumn,
    );
    const toColumn = columns.find(
      (column) =>
        column.modelId === toModel.id &&
        column.sourceColumnName === constraint.constraintedColumn,
    );
    if (!fromColumn || !toColumn) continue;
    relations.push({
      name: constraint.constraintName,
      fromModelId: fromModel.id,
      fromModelReferenceName: fromModel.referenceName,
      fromColumnId: fromColumn.id,
      fromColumnReferenceName: fromColumn.referenceName,
      toModelId: toModel.id,
      toModelReferenceName: toModel.referenceName,
      toColumnId: toColumn.id,
      toColumnReferenceName: toColumn.referenceName,
      type: RelationType.ONE_TO_MANY,
    });
  }
  if (!relations.length) {
    relations.push(
      ...inferProjectRelations(models, columns).map((relation) => {
        const fromModel = models.find(
          (model) => model.id === relation.fromModelId,
        );
        const toModel = models.find((model) => model.id === relation.toModelId);
        const fromColumn = columns.find(
          (column) => column.id === relation.fromColumnId,
        );
        const toColumn = columns.find(
          (column) => column.id === relation.toColumnId,
        );
        return {
          name: `${fromModel.referenceName}_${fromColumn.referenceName}_${toModel.referenceName}_${toColumn.referenceName}`,
          fromModelId: fromModel.id,
          fromModelReferenceName: fromModel.referenceName,
          fromColumnId: fromColumn.id,
          fromColumnReferenceName: fromColumn.referenceName,
          toModelId: toModel.id,
          toModelReferenceName: toModel.referenceName,
          toColumnId: toColumn.id,
          toColumnReferenceName: toColumn.referenceName,
          type: relation.type,
        };
      }),
    );
  }
  return models.map(({ id, displayName, referenceName }) => ({
    id,
    displayName,
    referenceName,
    relations: relations.filter(
      (relation) =>
        relation.fromModelId === id &&
        relation.toModelId !== relation.fromModelId,
    ),
  }));
};

export const saveProjectRelations = async (
  projectId: number,
  relations: ProjectRelationInput[],
) => {
  await relationRepository.deleteAllBy({ projectId });
  if (!relations.length) return [];
  const models = await modelRepository.findAllBy({ projectId });
  const modelIds = models.map((model) => model.id);
  const columns = await modelColumnRepository.findColumnsByModelIds(modelIds);
  const uniqueRelations = Array.from(
    relations
      .reduce((acc, relation) => {
        acc.set(getRelationKey(relation), relation);
        return acc;
      }, new Map<string, ProjectRelationInput>())
      .values(),
  );
  const values = uniqueRelations.map((relation) => {
    const fromColumn = columns.find(
      (column) => column.id === relation.fromColumnId,
    );
    const toColumn = columns.find(
      (column) => column.id === relation.toColumnId,
    );
    const fromModel = models.find((model) => model.id === relation.fromModelId);
    const toModel = models.find((model) => model.id === relation.toModelId);
    if (!fromColumn || !toColumn || !fromModel || !toModel) {
      throw new Error('Relation does not belong to this data product.');
    }
    return {
      projectId,
      name: `project_${projectId}_${fromModel.referenceName}_${fromColumn.referenceName}_${toModel.referenceName}_${toColumn.referenceName}`,
      fromColumnId: fromColumn.id,
      toColumnId: toColumn.id,
      joinType: relation.type,
      properties: JSON.stringify({ description: relation.description || '' }),
    };
  });
  return relationRepository.createMany(values);
};

export const ensureProjectRelations = async (projectId: number) => {
  const existing = await relationRepository.findRelationInfoBy(
    { projectId },
    undefined,
  );
  if (existing.length) return existing;
  const { inferredRelations } = await getProjectRelationInputs(projectId);
  if (!inferredRelations.length) return [];
  await saveProjectRelations(projectId, inferredRelations);
  return relationRepository.findRelationInfoBy({ projectId }, undefined);
};

const updateSamplePrimaryKeys = async (
  projectId: number,
  tables: SampleDatasetTable[],
) => {
  const models = await modelRepository.findAllBy({ projectId });
  for (const table of tables.filter((item) => item.primaryKey)) {
    const model = models.find(
      (item) => item.sourceTableName === table.tableName,
    );
    if (!model) continue;
    await modelColumnRepository.setModelPrimaryKey(model.id, table.primaryKey);
  }
};

const updateSampleModelProperties = async (
  projectId: number,
  tables: SampleDatasetTable[],
) => {
  const models = await modelRepository.findAllBy({ projectId });
  await Promise.all(
    tables.map(async (table) => {
      const model = models.find(
        (item) => item.sourceTableName === table.tableName,
      );
      if (!model) return;
      const currentProperties = model.properties
        ? JSON.parse(model.properties)
        : {};
      await modelRepository.updateOne(model.id, {
        displayName: table.properties?.displayName || model.displayName,
        properties: JSON.stringify({
          ...currentProperties,
          ...(table.properties || {}),
        }),
      });
    }),
  );
};

const updateSampleColumnProperties = async (
  projectId: number,
  tables: SampleDatasetTable[],
) => {
  const models = await modelRepository.findAllBy({ projectId });
  const columns = await modelColumnRepository.findColumnsByModelIds(
    models.map((model) => model.id),
  );
  await Promise.all(
    tables.flatMap((table) =>
      (table.columns || []).map(async (sampleColumn) => {
        if (!sampleColumn.properties) return;
        const model = models.find(
          (item) => item.sourceTableName === table.tableName,
        );
        if (!model) return;
        const column = columns.find(
          (item) =>
            item.modelId === model.id &&
            item.sourceColumnName === sampleColumn.name,
        );
        if (!column) return;
        const currentProperties = column.properties
          ? JSON.parse(column.properties)
          : {};
        await modelColumnRepository.updateOne(column.id, {
          properties: JSON.stringify({
            ...currentProperties,
            ...sampleColumn.properties,
          }),
        });
      }),
    ),
  );
};

const buildSampleRelationInput = (
  relations: SampleDatasetRelationship[] = [],
  models: Array<{ id: number; sourceTableName: string }>,
  columns: Array<{ id: number; modelId: number; referenceName: string }>,
): RelationData[] =>
  relations.map((relation) => {
    const fromModel = models.find(
      (model) => model.sourceTableName === relation.fromModelName,
    );
    const toModel = models.find(
      (model) => model.sourceTableName === relation.toModelName,
    );
    if (!fromModel || !toModel) {
      throw new Error(
        `Sample relation model not found: ${relation.fromModelName} -> ${relation.toModelName}`,
      );
    }
    const fromColumn = columns.find(
      (column) =>
        column.modelId === fromModel.id &&
        column.referenceName === relation.fromColumnName,
    );
    const toColumn = columns.find(
      (column) =>
        column.modelId === toModel.id &&
        column.referenceName === relation.toColumnName,
    );
    if (!fromColumn || !toColumn) {
      throw new Error(
        `Sample relation column not found: ${relation.fromColumnName} -> ${relation.toColumnName}`,
      );
    }
    return {
      fromModelId: fromModel.id,
      fromColumnId: fromColumn.id,
      toModelId: toModel.id,
      toColumnId: toColumn.id,
      type: relation.type,
      description: relation.description,
    };
  });

const saveSampleRelations = async (
  projectId: number,
  relations: SampleDatasetRelationship[] = [],
) => {
  if (!relations.length) return [];
  const models = await modelRepository.findAllBy({ projectId });
  const columns = await modelColumnRepository.findColumnsByModelIds(
    models.map((model) => model.id),
  );
  return saveProjectRelations(
    projectId,
    buildSampleRelationInput(relations, models, columns),
  );
};

export const createSampleDataProduct = async (name: SampleDatasetName) => {
  const dataset = sampleDatasets[name.toLowerCase()];
  if (!dataset) throw new Error(`Sample dataset ${name} was not found.`);

  const connectionInfo: DUCKDB_CONNECTION_INFO = {
    initSql: await buildSampleInitSql(name),
    extensions: [],
    configurations: {},
  };
  const compactTables = await prepareDuckDb(connectionInfo);
  const project = await projectService.createProject({
    displayName: sampleDatasetDisplayNames[name] || `${name} sample`,
    type: DataSourceName.DUCKDB,
    connectionInfo,
  } as ProjectData);

  try {
    await ensureProjectDashboard(project.id);
    await saveProjectTablesFromMetadata(
      project.id,
      dataset.tables.map((table) => table.tableName),
      compactTables,
    );
    await updateSamplePrimaryKeys(project.id, dataset.tables);
    await updateSampleModelProperties(project.id, dataset.tables);
    await updateSampleColumnProperties(project.id, dataset.tables);
    await saveSampleRelations(project.id, getRelations(name));
    await projectService.updateProject(project.id, { sampleDataset: name });

    try {
      await deployDataProduct(project.id);
    } catch (_error) {
      // Sample creation should still succeed when the external WrenAI deploy
      // service is unavailable; users can retry from the Publish step.
    }

    return {
      projectId: project.id,
      settings: await getProjectSettings(project.id),
    };
  } catch (error) {
    await deleteDataProduct(project.id, { deleteFromWrenAI: false });
    throw error;
  }
};

export const deployDataProduct = async (projectId: number) => {
  const project = await getProjectOrThrow(projectId);
  if (!project.version && project.type !== DataSourceName.DUCKDB) {
    const version = await projectService.getProjectDataSourceVersion(project);
    await projectService.updateProject(project.id, { version });
  }
  const { manifest } = await mdlService.makeModelMDL(projectId);
  return deployService.deploy(manifest, projectId);
};

export const getProjectSchemaChange = async (projectId: number) => {
  const lastSchemaChange =
    await schemaChangeRepository.findLastSchemaChange(projectId);
  return {
    lastSchemaChangeTime: lastSchemaChange?.createdAt || null,
  };
};

export const getProjectKnowledge = async (projectId: number) => {
  await getProjectOrThrow(projectId);
  const [sqlPairs, instructions] = await Promise.all([
    sqlPairRepository.findAllBy({ projectId }),
    instructionService.getInstructions(projectId),
  ]);
  return {
    sqlPairs,
    instructions,
    sqlPairCount: sqlPairs.length,
    instructionCount: instructions.length,
  };
};

export const getProjectDashboard = async (projectId: number) => {
  await getProjectOrThrow(projectId);
  const dashboard = await dashboardRepository.findOneBy({ projectId });
  if (!dashboard) {
    return { dashboard: null, items: [] };
  }
  const items = await dashboardItemRepository.findAllBy({
    dashboardId: dashboard.id,
  });
  return { dashboard, items };
};

export const deleteDataProduct = async (
  projectId: number,
  options: { deleteFromWrenAI?: boolean } = {},
) => {
  const dashboard = await dashboardRepository.findOneBy({ projectId });
  if (dashboard) {
    await dashboardItemRepository.deleteAllBy({ dashboardId: dashboard.id });
    await dashboardRepository.deleteOne(String(dashboard.id));
  }
  await schemaChangeRepository.deleteAllBy({ projectId });
  await deployService.deleteAllByProjectId(projectId);
  await askingService.deleteAllByProjectId(projectId);
  await viewRepository.deleteAllBy({ projectId });
  await deleteProjectModelsAndRelations(projectId);
  await projectRepository.deleteOne(String(projectId));
  if (options.deleteFromWrenAI !== false) {
    await wrenAIAdaptor.delete(projectId);
  }
};
