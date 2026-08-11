import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test';

const runId = Date.now();
const e2ePrefix = `veadk-db-${runId}`;
const workflowHelpersEnabled =
  process.env.PLAYWRIGHT_ENABLE_WORKFLOW_HELPERS === '1';

type DataProductSummary = {
  id: number;
  displayName: string;
  type: string;
  modelCount: number;
  deploymentStatus: string;
};

const attachErrorGuards = (page: Page) => {
  const errors: string[] = [];
  const onPageError = (error: Error) => {
    errors.push(`pageerror: ${error.message}`);
  };
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`);
    }
  };
  const onResponse = (response: Response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    const isHmr404 =
      status === 404 &&
      /\/_next\/static\/webpack\/.*\.webpack\.hot-update\.json/.test(url);
    if (isHmr404) return;
    errors.push(`http.${status}: ${url}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('response', onResponse);
  return errors;
};

const expectNoErrors = (errors: string[]) => {
  expect(errors, errors.join('\n')).toEqual([]);
};

const mockConfig = (page: Page) =>
  page.route('**/api/config', (route) =>
    route.fulfill({
      json: {
        isTelemetryEnabled: false,
        telemetryKey: '',
        telemetryHost: '',
        userUUID: '',
      },
    }),
  );

const getDataProducts = async (page: Page) => {
  const response = await page.request.get('/api/data-products');
  expect(
    response.ok(),
    `GET /api/data-products ${response.status()}`,
  ).toBeTruthy();
  const payload = await response.json();
  return (payload.data || []) as DataProductSummary[];
};

const createDuckDbProduct = async (page: Page, displayName: string) => {
  const response = await page.request.post('/api/data-products', {
    data: {
      type: 'DUCKDB',
      properties: {
        displayName,
        initSql: `CREATE OR REPLACE TABLE ${displayName.replace(/-/g, '_')}_orders AS SELECT 1 AS order_id, 'paid' AS status;`,
        extensions: [],
        configurations: {},
      },
    },
  });
  expect(response.ok(), `create product ${response.status()}`).toBeTruthy();
  const payload = await response.json();
  expect(payload.projectId).toBeTruthy();
  return Number(payload.projectId);
};

const deleteProduct = async (page: Page, projectId: number) => {
  await page.request
    .delete(`/api/data-products/${projectId}`)
    .catch(() => undefined);
};

const workflowSourceNode = {
  id: 'source_template',
  type_name: 'Source',
  type_cls: 'Source',
  label: 'Source node',
  name: 'source_node',
  category: 'test',
  category_label: 'Test',
  flow_type: 'operator',
  outputs: [
    {
      id: 'out',
      type_name: 'str',
      type_cls: 'str',
      label: 'Output',
      name: 'output',
    },
  ],
  inputs: [],
  parameters: [],
};

const workflowTargetNode = {
  id: 'target_template',
  type_name: 'Target',
  type_cls: 'Target',
  label: 'Target node',
  name: 'target_node',
  category: 'test',
  category_label: 'Test',
  flow_type: 'operator',
  outputs: [],
  inputs: [
    {
      id: 'in',
      type_name: 'str',
      type_cls: 'str',
      label: 'Input',
      name: 'input',
      optional: false,
    },
  ],
  parameters: [
    {
      id: 'text',
      type_name: 'str',
      type_cls: 'str',
      label: 'Name',
      name: 'name',
      optional: false,
      category: 'common',
      value: 'ready',
    },
  ],
};

const workflowDatabaseRetrieverNode = {
  id: 'operator_higher_order_datasource_retriever_operator___$$___database___$$___v1',
  type_name: 'HODatasourceRetrieverOperator',
  type_cls: 'dbgpt_app.operators.datasource.HODatasourceRetrieverOperator',
  label: 'Datasource Retriever Operator',
  name: 'higher_order_datasource_retriever_operator',
  category: 'database',
  category_label: 'Database',
  flow_type: 'operator',
  inputs: [
    {
      id: 'query',
      type_name: 'str',
      type_cls: 'builtins.str',
      label: 'User question',
      name: 'query',
      optional: true,
    },
  ],
  outputs: [
    {
      id: 'context',
      type_name: 'HOContextBody',
      type_cls: 'dbgpt_app.operators.llm.HOContextBody',
      label: 'Retrieved context',
      name: 'context',
    },
  ],
  parameters: [
    {
      id: 'datasource',
      type_name: 'DBResource',
      type_cls: 'dbgpt.agent.resource.database.DBResource',
      label: 'Datasource',
      name: 'datasource',
      optional: false,
      category: 'resource',
      resource_type: 'instance',
      value: null,
    },
    {
      id: 'max_num_results',
      type_name: 'int',
      type_cls: 'builtins.int',
      label: 'Max Number of Results',
      name: 'max_num_results',
      optional: true,
      category: 'common',
      value: 50,
    },
  ],
};

const mockWorkflowNodes = (page: Page) =>
  page.route('**/api/dbgpt/api/v2/serve/awel/nodes**', (route) =>
    route.fulfill({
      json: { data: [workflowSourceNode, workflowTargetNode], success: true },
    }),
  );

const addWorkflowFixtureNodes = async (page: Page) => {
  test.skip(
    !workflowHelpersEnabled,
    'workflow canvas helper tests require PLAYWRIGHT_ENABLE_WORKFLOW_HELPERS=1 and a build with NEXT_PUBLIC_ENABLE_E2E_HELPERS=1',
  );
  await page.goto('/workflow/canvas');
  await page.waitForFunction(() =>
    Boolean((window as any).__VEADK_WORKFLOW_TEST__),
  );
  await page.evaluate(
    ({ source, target }) => {
      const api = (window as any).__VEADK_WORKFLOW_TEST__;
      api.addNode(source, { x: 80, y: 160 });
      api.addNode(target, { x: 520, y: 160 });
    },
    { source: workflowSourceNode, target: workflowTargetNode },
  );
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
};

const mockDatabaseResourceOptions = (page: Page) =>
  page.route(
    '**/api/dbgpt/api/v1/app/resources/list?type=database&version=v2',
    (route) =>
      route.fulfill({
        json: {
          success: true,
          data: [
            {
              param_name: 'name',
              param_type: 'string',
              label: 'name',
              default_value: 'datasource',
              required: true,
            },
            {
              param_name: 'db_name',
              param_type: 'string',
              label: 'db_name',
              required: true,
              valid_values: [
                {
                  label: '[sqlite]Walmart_Sales',
                  key: 'Walmart_Sales',
                  description: 'Default Walmart Sales example database',
                },
                {
                  label: '[veadk] TestDuckDB',
                  key: 'veadk:project:6',
                  description: 'DUCKDB data product managed by VeADK / WrenAI',
                },
              ],
            },
          ],
        },
      }),
  );

test.describe('VeADK Studio Database project isolation', () => {
  test('returns structured DuckDB init SQL validation errors', async ({
    page,
  }) => {
    const response = await page.request.post('/api/data-products', {
      data: {
        type: 'DUCKDB',
        properties: {
          displayName: `${e2ePrefix}-bad-sql`,
          initSql: 'CREATE TABLE broken AS SELECT FROM;',
          extensions: [],
          configurations: {},
        },
      },
    });
    const payload = await response.json().catch(() => ({}));
    test.skip(
      response.status() === 503,
      `Wren Engine unavailable: ${payload.error || payload.message || 'DuckDB init service is not reachable.'}`,
    );
    expect(response.status()).toBe(400);
    expect(payload.code).toBe('INIT_SQL_ERROR');
    expect(payload.stage).toBe('duckdb_init_sql');
    expect(payload.advice).toBeTruthy();
  });

  test('creates a second data product without overwriting the first project', async ({
    page,
  }) => {
    const errors = attachErrorGuards(page);
    const firstName = `${e2ePrefix}-first`;
    const secondName = `${e2ePrefix}-second`;
    const created: number[] = [];

    try {
      const firstProjectId = await createDuckDbProduct(page, firstName);
      created.push(firstProjectId);
      await page.request.post(`/api/data-products/${firstProjectId}/tables`, {
        data: { tables: [`${firstName.replace(/-/g, '_')}_orders`] },
      });
      const firstBefore = await page.request.get(
        `/api/data-products/${firstProjectId}`,
      );
      expect(firstBefore.ok()).toBeTruthy();
      const firstBeforePayload = await firstBefore.json();

      const secondProjectId = await createDuckDbProduct(page, secondName);
      created.push(secondProjectId);
      expect(secondProjectId).not.toBe(firstProjectId);

      const listAfterCreate = await getDataProducts(page);
      expect(
        listAfterCreate.some((item) => item.id === firstProjectId),
      ).toBeTruthy();
      expect(
        listAfterCreate.some((item) => item.id === secondProjectId),
      ).toBeTruthy();

      const tablesResponse = await page.request.get(
        `/api/data-products/${secondProjectId}/tables`,
      );
      expect(tablesResponse.ok()).toBeTruthy();
      const tablesPayload = await tablesResponse.json();
      const secondTableName = `${secondName.replace(/-/g, '_')}_orders`;
      expect(
        (tablesPayload.data || []).some(
          (table: { name: string }) => table.name === secondTableName,
        ),
      ).toBeTruthy();

      const saveSecond = await page.request.post(
        `/api/data-products/${secondProjectId}/tables`,
        { data: { tables: [secondTableName] } },
      );
      expect(saveSecond.ok()).toBeTruthy();

      const firstAfter = await page.request.get(
        `/api/data-products/${firstProjectId}`,
      );
      expect(firstAfter.ok()).toBeTruthy();
      const firstAfterPayload = await firstAfter.json();
      expect(firstAfterPayload.displayName).toBe(
        firstBeforePayload.displayName,
      );
      expect(firstAfterPayload.dataSource.type).toBe(
        firstBeforePayload.dataSource.type,
      );
      expect(firstAfterPayload.diagram.models.length).toBe(
        firstBeforePayload.diagram.models.length,
      );

      await page.goto('/database');
      await expect(page.getByText(firstName)).toBeVisible();
      await expect(page.getByText(secondName)).toBeVisible();
      await page.getByText(secondName).click();
      await expect(page).toHaveURL(/projectId=/);
      await page
        .getByRole('button', { name: 'arrow-left Data product' })
        .click();
      await expect(page).toHaveURL(/\/database$/);
      expectNoErrors(errors);
    } finally {
      await Promise.all(
        created.map((projectId) => deleteProduct(page, projectId)),
      );
    }
  });
});

test.describe('VeADK Studio Workflow connections', () => {
  test('adds, saves, reloads, and deletes an edge through the connection panel', async ({
    page,
  }) => {
    test.skip(
      !workflowHelpersEnabled,
      'workflow canvas helper tests require PLAYWRIGHT_ENABLE_WORKFLOW_HELPERS=1 and a build with NEXT_PUBLIC_ENABLE_E2E_HELPERS=1',
    );
    const errors = attachErrorGuards(page);
    const flowId = `flow-${runId}`;
    let savedPayload: any;

    await mockConfig(page);
    await mockWorkflowNodes(page);
    await page.route('**/api/dbgpt/api/v2/serve/awel/flows', async (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = route.request().postDataJSON();
        return route.fulfill({
          json: {
            data: {
              uid: flowId,
              name: savedPayload.name,
              label: savedPayload.label,
              flow_data: savedPayload.flow_data,
              state: savedPayload.state,
            },
            success: true,
          },
        });
      }
      return route.fallback();
    });
    await page.route(
      `**/api/dbgpt/api/v2/serve/awel/flows/${flowId}`,
      async (route) => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            json: {
              data: {
                uid: flowId,
                name: savedPayload?.name || 'saved_flow',
                label: savedPayload?.label || 'Saved flow',
                flow_data: savedPayload?.flow_data || { nodes: [], edges: [] },
                state: 'developing',
              },
              success: true,
            },
          });
        }
        if (route.request().method() === 'PUT') {
          savedPayload = route.request().postDataJSON();
          return route.fulfill({
            json: {
              data: {
                uid: flowId,
                name: savedPayload.name,
                label: savedPayload.label,
                flow_data: savedPayload.flow_data,
                state: savedPayload.state,
              },
              success: true,
            },
          });
        }
        return route.fallback();
      },
    );

    await addWorkflowFixtureNodes(page);

    await page
      .getByTestId('workflow-source-select')
      .locator('.ant-select-selector')
      .click();
    await page.getByText('Source node / Output').click();
    await page
      .getByTestId('workflow-target-select')
      .locator('.ant-select-selector')
      .click();
    await page.getByText('Target node / Input').click();
    await page.getByRole('button', { name: 'Add connection' }).click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(page.getByTestId('workflow-edge-summary')).toContainText(
      '1 connection',
    );

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByLabel('Title').fill('Saved flow');
    await page.getByLabel('Name').fill(`saved_flow_${runId}`);
    await page.getByRole('button', { name: 'OK' }).click();
    await expect.poll(() => savedPayload?.flow_data?.edges?.length).toBe(1);
    expect(savedPayload.flow_data.edges[0].source).toBeTruthy();
    expect(savedPayload.flow_data.edges[0].target).toBeTruthy();
    expect(savedPayload.flow_data.edges[0].source_handle).toContain(':output:');
    expect(savedPayload.flow_data.edges[0].target_handle).toContain(':input:');

    await page.goto(`/workflow/canvas?id=${flowId}`);
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.locator('.react-flow__edge button').click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Invalid flow')).toBeVisible();
    await expect(
      page.getByText('The input Input of node Target node is required.'),
    ).toBeVisible();
    expectNoErrors(errors);
  });

  test('connects nodes by dragging between ReactFlow handles', async ({
    page,
  }) => {
    test.skip(
      !workflowHelpersEnabled,
      'workflow canvas helper tests require PLAYWRIGHT_ENABLE_WORKFLOW_HELPERS=1 and a build with NEXT_PUBLIC_ENABLE_E2E_HELPERS=1',
    );
    const errors = attachErrorGuards(page);
    let savedPayload: any;

    await mockConfig(page);
    await mockWorkflowNodes(page);
    await page.route('**/api/dbgpt/api/v2/serve/awel/flows', async (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = route.request().postDataJSON();
        return route.fulfill({
          json: {
            data: {
              uid: `drag-flow-${runId}`,
              name: savedPayload.name,
              label: savedPayload.label,
              flow_data: savedPayload.flow_data,
              state: savedPayload.state,
            },
            success: true,
          },
        });
      }
      return route.fallback();
    });

    await addWorkflowFixtureNodes(page);

    const sourceHandle = page.getByTestId(
      'workflow-handle-source_template_0:output:0',
    );
    const targetHandle = page.getByTestId(
      'workflow-handle-target_template_0:input:0',
    );
    await expect(sourceHandle).toBeVisible();
    await expect(targetHandle).toBeVisible();

    const sourceBox = await sourceHandle.boundingBox();
    const targetBox = await targetHandle.boundingBox();
    expect(sourceBox).toBeTruthy();
    expect(targetBox).toBeTruthy();

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();

    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await expect(page.getByTestId('workflow-edge-summary')).toContainText(
      '1 connection',
    );

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByLabel('Title').fill('Dragged flow');
    await page.getByLabel('Name').fill(`dragged_flow_${runId}`);
    await page.getByRole('button', { name: 'OK' }).click();
    await expect.poll(() => savedPayload?.flow_data?.edges?.length).toBe(1);
    expect(savedPayload.flow_data.edges[0].source_handle).toBe(
      'source_template_0:output:0',
    );
    expect(savedPayload.flow_data.edges[0].target_handle).toBe(
      'target_template_0:input:0',
    );
    expectNoErrors(errors);
  });

  test('shows a clear node service failure', async ({ page }) => {
    const errors = attachErrorGuards(page);
    await mockConfig(page);
    await page.route('**/api/dbgpt/api/v2/serve/awel/nodes**', (route) =>
      route.fulfill({ json: { success: false, err_msg: 'node service down' } }),
    );
    await page.goto('/workflow/canvas');
    await expect(
      page.getByText('DB-GPT node service is unavailable'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    expectNoErrors(errors);
  });

  test('selects a configured database for the Database Retrieval node', async ({
    page,
  }) => {
    test.skip(
      !workflowHelpersEnabled,
      'workflow canvas helper tests require PLAYWRIGHT_ENABLE_WORKFLOW_HELPERS=1 and a build with NEXT_PUBLIC_ENABLE_E2E_HELPERS=1',
    );
    const errors = attachErrorGuards(page);
    let savedPayload: any;

    await mockConfig(page);
    await mockDatabaseResourceOptions(page);
    await page.route('**/api/dbgpt/api/v2/serve/awel/nodes**', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: [workflowDatabaseRetrieverNode],
        },
      }),
    );
    await page.route('**/api/dbgpt/api/v2/serve/awel/flows', async (route) => {
      if (route.request().method() === 'POST') {
        savedPayload = route.request().postDataJSON();
        return route.fulfill({
          json: {
            success: true,
            data: {
              uid: `database-retrieval-flow-${runId}`,
              name: savedPayload.name,
              label: savedPayload.label,
              flow_data: savedPayload.flow_data,
              state: savedPayload.state,
            },
          },
        });
      }
      return route.fallback();
    });

    await page.goto('/workflow/canvas');
    await page.waitForFunction(() =>
      Boolean((window as any).__VEADK_WORKFLOW_TEST__),
    );
    await page.evaluate((node) => {
      (window as any).__VEADK_WORKFLOW_TEST__.addNode(node, { x: 160, y: 160 });
    }, workflowDatabaseRetrieverNode);
    await expect(page.locator('.react-flow__node')).toHaveCount(1);

    await page
      .getByTestId('workflow-resource-select-datasource')
      .locator('.ant-select-selector')
      .click();
    await page.getByText('[veadk] TestDuckDB').click();

    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByLabel('Title').fill('Database retrieval flow');
    await page.getByLabel('Name').fill(`database_retrieval_flow_${runId}`);
    await page.getByRole('button', { name: 'OK' }).click();

    await expect
      .poll(() => savedPayload?.flow_data?.nodes?.length)
      .toBeGreaterThan(1);
    const datasourceResource = savedPayload.flow_data.nodes.find(
      (node: any) => node.data?.type_name === 'DatasourceResource',
    );
    expect(datasourceResource).toBeTruthy();
    expect(
      datasourceResource.data.parameters.find(
        (item: any) => item.name === 'db_name',
      ).value,
    ).toBe('veadk:project:6');
    const retriever = savedPayload.flow_data.nodes.find(
      (node: any) => node.data?.type_name === 'HODatasourceRetrieverOperator',
    );
    expect(
      retriever.data.parameters.find((item: any) => item.name === 'datasource')
        .value,
    ).toBe(datasourceResource.id);
    expect(
      savedPayload.flow_data.edges.some(
        (edge: any) =>
          edge.source === datasourceResource.id &&
          edge.target === retriever.id &&
          edge.target_handle === `${retriever.id}:parameter:0`,
      ),
    ).toBeTruthy();
    expectNoErrors(errors);
  });
});
