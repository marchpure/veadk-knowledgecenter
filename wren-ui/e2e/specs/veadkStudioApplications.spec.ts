import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test';

const e2ePrefix = 'veadk-e2e-';
const testRunId = Date.now();
const testAppName = `${e2ePrefix}${testRunId}`;

type DbgptApp = {
  app_code: string;
  app_name: string;
  published?: string;
  details?: Array<{
    resources?: Array<{ type?: string; name?: string; value?: string }>;
  }>;
  recommend_questions?: Array<{ question?: string; valid?: boolean | string }>;
};

type DbgptAppListResponse = {
  app_list: DbgptApp[];
  total_count: number;
};

type DbgptResourceOption = {
  key: string;
  label?: string;
  description?: string;
};

type DbgptFlowResponse = {
  items: Array<{ name: string; label?: string; uid?: string }>;
  total_count: number;
};

type ConnectorInstance = {
  id: string;
  connector_type: string;
  display_name: string;
  status: string;
  config?: Record<string, unknown>;
};

class ExternalDependencyError extends Error {
  constructor(
    message: string,
    readonly dependency: string,
  ) {
    super(message);
    this.name = 'ExternalDependencyError';
  }
}

const isFailureEnvelope = (payload: any) =>
  payload &&
  typeof payload === 'object' &&
  payload.success === false &&
  (payload.err_code || payload.err_msg || payload.error);

const getFailureMessage = (payload: any, fallback: string) =>
  [
    payload?.err_code,
    payload?.err_msg || payload?.error || payload?.message || fallback,
    payload?.target ? `target=${payload.target}` : '',
  ]
    .filter(Boolean)
    .join(' ');

const skipExternalDependency = (error: unknown, dependency = 'DB-GPT') => {
  if (error instanceof ExternalDependencyError) {
    test.skip(true, `${error.dependency} unavailable: ${error.message}`);
    return;
  }
  test.skip(
    true,
    `${dependency} unavailable: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
};

const guardCleanups = new WeakMap<string[], () => void>();

const attachErrorGuards = (
  page: Page,
  options: {
    allowHttpError?: (status: number, url: string) => boolean;
  } = {},
) => {
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
    if (options.allowHttpError?.(status, url)) return;
    errors.push(`http.${status}: ${url}`);
  };
  page.on('pageerror', onPageError);
  page.on('console', onConsole);
  page.on('response', onResponse);
  guardCleanups.set(errors, () => {
    page.off('pageerror', onPageError);
    page.off('console', onConsole);
    page.off('response', onResponse);
    errors.length = 0;
  });
  return errors;
};

const detachErrorGuards = (page: Page, errors: string[]) => {
  guardCleanups.get(errors)?.();
};

const expectNoErrors = (errors: string[]) => {
  expect(errors, errors.join('\n')).toEqual([]);
};

const gotoAndCheck = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}`));
  await expect(page.locator('body')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Application error')).toHaveCount(0);
  await page.waitForLoadState('networkidle').catch(() => undefined);
};

const getDbgpt = async <T>(page: Page, path: string) => {
  const response = await page.request.get(`/api/dbgpt${path}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(`${path} returned ${response.status()}`);
  }
  if (isFailureEnvelope(payload)) {
    throw new ExternalDependencyError(
      getFailureMessage(payload, `${path} failed`),
      'DB-GPT',
    );
  }
  return (payload?.data ?? payload) as T;
};

const requireDbgpt = async <T>(page: Page, path: string) => {
  try {
    return await getDbgpt<T>(page, path);
  } catch (error) {
    skipExternalDependency(error);
    throw error;
  }
};

const postDbgpt = async <T>(
  page: Page,
  path: string,
  body: Record<string, unknown>,
) => {
  const response = await page.request.post(`/api/dbgpt${path}`, {
    data: body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(`${path} returned ${response.status()}`);
  }
  if (isFailureEnvelope(payload)) {
    throw new ExternalDependencyError(
      getFailureMessage(payload, `${path} failed`),
      'DB-GPT',
    );
  }
  return (payload?.data ?? payload) as T;
};

const cleanupE2eApplications = async (page: Page, runOnly = false) => {
  const list = await postDbgpt<DbgptAppListResponse>(
    page,
    '/api/v1/app/list?page=1&page_size=100',
    {
      page: 1,
      page_size: 100,
      app_name: runOnly ? testAppName : e2ePrefix,
    },
  ).catch(() => ({ app_list: [], total_count: 0 }));
  const targets = (list.app_list || []).filter((app) =>
    runOnly
      ? app.app_name === testAppName
      : app.app_name?.startsWith(e2ePrefix),
  );
  await Promise.all(
    targets.map((app) =>
      page.request
        .post('/api/dbgpt/api/v1/app/remove', {
          data: { app_code: app.app_code },
        })
        .catch(() => undefined),
    ),
  );
};

const getVeadkDatabaseResource = async (
  page: Page,
  options: { requireQuestions?: boolean } = {},
) => {
  const databaseResources = await getDbgpt<DbgptResourceOption[]>(
    page,
    '/api/v1/app/resources/list?type=database',
  );
  const veadkResources = databaseResources.filter((item) =>
    item.key?.startsWith('veadk:project:'),
  );
  if (!options.requireQuestions) return veadkResources[0];

  for (const resource of veadkResources) {
    const projectId = Number(resource.key.replace('veadk:project:', ''));
    const response = await page.request.get(
      `/api/applications/data-products/${projectId}`,
    );
    if (!response.ok()) continue;
    const payload = await response.json().catch(() => ({}));
    if (
      Array.isArray(payload?.questions) &&
      payload.questions.some((item: any) => item.valid && item.question)
    ) {
      return resource;
    }
  }
  return undefined;
};

const getDataProductQuestion = async (
  page: Page,
  resource: DbgptResourceOption,
) => {
  const projectId = Number(resource.key.replace('veadk:project:', ''));
  const response = await page.request.get(
    `/api/applications/data-products/${projectId}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  const question = payload?.questions?.find(
    (item: any) => item.valid,
  )?.question;
  expect(
    question,
    'data product must expose at least one valid question',
  ).toBeTruthy();
  const questions = (payload?.questions || [])
    .filter((item: any) => item.valid && item.question)
    .map((item: any) => String(item.question));
  return { projectId, question: String(question), questions };
};

const findWorkingSqlQuestion = async (
  page: Page,
  projectId: number,
  questions: string[],
) => {
  for (const candidate of questions.slice(0, 5)) {
    const response = await page.request.post('/api/applications/ask', {
      data: {
        appCode: 'veadk-e2e-probe',
        projectId,
        question: candidate,
        threadId: `veadk-e2e-probe-${testRunId}-${Date.now()}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok() && payload?.type === 'SQL_QUERY' && payload?.sql) {
      return candidate;
    }
  }
  return '';
};

const selectResourceOption = async (
  page: Page,
  option: DbgptResourceOption,
) => {
  await page.getByTestId('resource-publish-select').click();
  await page.getByTitle(option.label || option.key).click();
};

const createSingleAgentApp = async (
  page: Page,
  appName: string,
  description = 'E2E resource app for VeADK Studio validation.',
) => {
  const agents = await requireDbgpt<Array<{ name: string }>>(
    page,
    '/api/v1/agents/list',
  );
  expect(
    agents.length,
    'at least one DB-GPT agent is required',
  ).toBeGreaterThan(0);

  await page.goto('/applications');
  await expect(
    page.getByRole('heading', { name: 'Applications' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create application' })
    .first()
    .click();
  const createDialog = page.getByRole('dialog', { name: 'Create application' });
  await createDialog.getByRole('button', { name: /Single Agent/i }).click();
  await page.getByLabel('Application name').fill(appName);
  await page.getByLabel('Description').fill(description);
  await createDialog.getByRole('button', { name: /^Create$/ }).click();
  await expect(
    page.getByRole('heading', { name: appName }).first(),
  ).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText('Agents')).toBeVisible();
  await page.getByText(agents[0].name, { exact: false }).first().click();
  await page.getByText('Publish resources').waitFor({ state: 'visible' });
  return { agent: agents[0] };
};

const createApplication = async (
  page: Page,
  appName: string,
  modeMatcher: RegExp,
  description = 'E2E app for VeADK Studio validation.',
) => {
  await page.goto('/applications');
  await expect(
    page.getByRole('heading', { name: 'Applications' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Create application' })
    .first()
    .click();
  const createDialog = page.getByRole('dialog', { name: 'Create application' });
  await createDialog.getByRole('button', { name: modeMatcher }).click();
  await page.getByLabel('Application name').fill(appName);
  await page.getByLabel('Description').fill(description);
  await createDialog.getByRole('button', { name: /^Create$/ }).click();
  await expect(
    page.getByRole('heading', { name: appName }).first(),
  ).toBeVisible({
    timeout: 30000,
  });
};

const publishDatabaseRuntimeApp = async (page: Page, appName: string) => {
  const databaseResource = await getVeadkDatabaseResource(page, {
    requireQuestions: true,
  });
  test.skip(
    !databaseResource,
    'at least one real VeADK database/data product resource with valid recommended questions is required',
  );
  const { projectId, question, questions } = await getDataProductQuestion(
    page,
    databaseResource!,
  );

  await createSingleAgentApp(page, appName);
  await page.getByTestId('resource-publish-kind-database').click();
  await selectResourceOption(page, databaseResource!);
  await page.getByRole('button', { name: 'Bind resource' }).click();
  await expect(
    page.getByText(databaseResource!.label || databaseResource!.key).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Application configuration saved.')).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Publish' }).first().click();
  await expect(page.getByText('Application published.')).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'Run' }).first().click();
  await expect(page).toHaveURL(/\/applications\/run\//, { timeout: 30000 });
  const url = new URL(page.url());
  const appCode = decodeURIComponent(
    url.pathname.split('/').filter(Boolean).pop() || '',
  );
  expect(appCode, 'runtime URL must include app code').toBeTruthy();
  return {
    appCode,
    projectId,
    question,
    questions,
    databaseResource: databaseResource!,
  };
};

const askRuntime = async (page: Page, question: string) => {
  const input = page.getByPlaceholder(/Ask this application|Ask a question/i);
  await input.fill(question);
  await page.getByTestId('runtime-send-button').click();
  return page.locator('[data-testid="application-answer-result"]').last();
};

const waitForRuntimeAnswer = async (
  answerBlock: ReturnType<Page['locator']>,
) => {
  return await expect
    .poll(
      async () => {
        const text = await answerBlock.innerText();
        if (text.includes('Application runtime failed')) return 'failed';
        if (
          text.includes('Answer') ||
          text.includes('Runtime') ||
          text.includes('Assistant message') ||
          text.includes('Query finished') ||
          text.includes('Hi. This application is connected')
        ) {
          return 'answered';
        }
        return 'unknown';
      },
      { timeout: 70000 },
    )
    .toMatch(/answered|failed/);
};

const clickRuntimeTab = async (
  answerBlock: ReturnType<Page['locator']>,
  name: string,
) => {
  await answerBlock.getByRole('tab', { name: new RegExp(name, 'i') }).click();
};

test.afterEach(async ({ page }) => {
  await cleanupE2eApplications(page);
});

test.describe('VeADK Studio application builder', () => {
  test('critical construct pages render without page or console errors', async ({
    page,
  }) => {
    const errors = attachErrorGuards(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Application error')).toHaveCount(0);

    await gotoAndCheck(page, '/database');
    await gotoAndCheck(page, '/knowledge');
    await gotoAndCheck(page, '/tools');
    await gotoAndCheck(page, '/workflow');
    expectNoErrors(errors);
  });

  test('root route shows a fallback when onboarding status is missing', async ({
    page,
  }) => {
    const errors = attachErrorGuards(page);
    await page.route('**/api/graphql', async (route) => {
      const body = route.request().postData() || '';
      if (body.includes('OnboardingStatus')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { onboardingStatus: null } }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/');
    await expect(
      page.getByText('No WrenAI data product is configured', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Applications' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open' }).first(),
    ).toBeVisible();
    await expect(page.getByText('Loading...')).toHaveCount(0);
    expectNoErrors(errors);
  });

  test('DB-GPT database resource catalog exposes real VeADK data products when upstream is unavailable', async ({
    page,
  }) => {
    const errors = attachErrorGuards(page);
    const response = await page.request.get(
      '/api/dbgpt/api/v1/app/resources/list?type=database',
    );
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    const resources = payload?.data || payload;
    expect(Array.isArray(resources)).toBeTruthy();
    expect(
      resources.some((item: DbgptResourceOption) =>
        item.key?.startsWith('veadk:project:'),
      ),
    ).toBeTruthy();
    expectNoErrors(errors);
  });

  test('creates, configures, publishes, and opens a unified runtime app', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = attachErrorGuards(page);
    const teamModes = await requireDbgpt<Array<{ value: string }>>(
      page,
      '/api/v1/team-mode/list',
    );
    const resourceTypes = await requireDbgpt<string[]>(
      page,
      '/api/v1/resource-type/list',
    );
    const databaseResource = await getVeadkDatabaseResource(page);

    expect(
      teamModes.some((mode) => mode.value === 'single_agent'),
      'single_agent work mode is required',
    ).toBeTruthy();
    expect(
      resourceTypes.includes('database'),
      'database resource type is required',
    ).toBeTruthy();
    test.skip(
      !databaseResource,
      'at least one real VeADK database/data product resource is required',
    );
    await createSingleAgentApp(page, testAppName);
    await page.getByTestId('resource-publish-kind-database').click();
    await selectResourceOption(page, databaseResource!);
    await page.getByRole('button', { name: 'Bind resource' }).click();
    await expect(
      page.getByText('Bound resources', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(databaseResource!.label || databaseResource!.key).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(
      page.getByText('Application configuration saved.'),
    ).toBeVisible({
      timeout: 30000,
    });

    await page.getByRole('button', { name: 'Publish' }).first().click();
    await expect(page.getByText('Application published.')).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Run' }).first().click();
    await expect(page).toHaveURL(/\/applications\/run\//, { timeout: 30000 });
    await expect(
      page.getByRole('heading', { name: testAppName }).first(),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/Ask this application|Ask a question/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Runtime Dashboard/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/veadk_data_product|chat_agent/i).first(),
    ).toBeVisible();
    expectNoErrors(errors);
  });

  test('blocks stale VeADK data product resources before save, publish, or run', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const staleProjectId = '999999';
    const staleResource: DbgptResourceOption = {
      key: `veadk:project:${staleProjectId}`,
      label: '[veadk] Missing data product',
      description: 'Stale VeADK data product returned by the resource catalog.',
    };
    await page.route(
      '**/api/dbgpt/api/v1/app/resources/list?**',
      async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('type') !== 'database') {
          await route.continue();
          return;
        }
        if (url.searchParams.get('version') === 'v2') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: [
                {
                  param_name: 'db_name',
                  param_type: 'select',
                  required: true,
                  valid_values: [staleResource],
                },
                {
                  param_name: 'name',
                  param_type: 'string',
                  required: false,
                  default_value: staleResource.label,
                },
              ],
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: [staleResource],
          }),
        });
      },
    );
    await page.route(
      `**/api/applications/data-products/${staleProjectId}`,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Data product was not found.' }),
        });
      },
    );

    const appName = `${testAppName}-stale`;
    await createSingleAgentApp(page, appName);
    await page.getByTestId('resource-publish-kind-database').click();
    await selectResourceOption(page, staleResource);
    await expect(page.getByText('Data product unavailable')).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page
        .getByText(/Data product is unavailable in the current runtime/i)
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Bind resource' }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Save' }).first(),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Publish' }).first(),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Run' }).first(),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Refresh resources' }).first(),
    ).toBeVisible();
  });

  test('database runtime shows pending, SQL/data/chart tabs, thread restore, and share answer', async ({
    page,
  }) => {
    test.setTimeout(180000);
    const appName = `${testAppName}-runtime`;
    const { appCode } = await publishDatabaseRuntimeApp(page, appName);
    const errors = attachErrorGuards(page);
    await page.evaluate((code) => {
      window.localStorage.removeItem(
        `veadk:application-runtime:${code}:sessions`,
      );
    }, appCode);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: appName }).first(),
    ).toBeVisible({
      timeout: 30000,
    });

    await page.route('**/api/applications/ask', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });

    const greetingAnswer = await askRuntime(page, '你好');
    await expect(
      page.getByText('Analyzing the bound data product...'),
    ).toBeVisible();
    await expect(page.getByTestId('application-answer-pending')).toBeVisible();
    await expect(page.getByTestId('application-answer-skeleton')).toBeVisible();
    await expect(page.getByTestId('share-answer-disabled')).toHaveAttribute(
      'aria-label',
      /Wait for this answer to finish before sharing/i,
    );
    await expect(page.getByTestId('runtime-send-button')).toContainText(
      'Asking',
    );
    await waitForRuntimeAnswer(greetingAnswer);
    await expect(greetingAnswer).toContainText(
      /Hi\. This application is connected|你好|Answer/i,
    );
    const shareResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/applications/share') &&
        response.request().method() === 'POST',
    );
    await greetingAnswer.getByTestId('share-answer-button').click();
    const shareResponse = await shareResponsePromise;
    expect(shareResponse.status()).toBe(200);
    const sharePayload = await shareResponse.json();
    expect(sharePayload.token).toBeTruthy();
    expect(sharePayload.shareUrl).toContain(
      `/applications/share/${sharePayload.token}`,
    );
    await expect(
      page.getByText(/Application result link copied|Application result link/i),
    ).toBeVisible({ timeout: 10000 });
    const shareLinkDialog = page.locator('.ant-modal').filter({
      hasText: 'Application result link',
    });
    if (await shareLinkDialog.isVisible().catch(() => false)) {
      await shareLinkDialog.getByRole('button', { name: 'Close' }).click();
      await expect(shareLinkDialog).toBeHidden();
    }

    const sharePage = await page.context().newPage();
    const shareErrors = attachErrorGuards(sharePage);
    await sharePage.goto(`/applications/share/${sharePayload.token}`);
    await expect(
      sharePage.getByRole('heading', { name: appName }).first(),
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(sharePage.getByText('你好').first()).toBeVisible();
    await expect(
      sharePage.getByText(/Hi\. This application is connected/i).first(),
    ).toBeVisible();
    expectNoErrors(shareErrors);
    await sharePage.close();

    const firstSessionId = new URL(page.url()).searchParams.get('session_id');
    expect(firstSessionId).toBeTruthy();
    await page.unroute('**/api/applications/ask');

    await page.getByTestId('runtime-new-thread').click();
    const secondSessionId = new URL(page.url()).searchParams.get('session_id');
    expect(secondSessionId).toBeTruthy();
    expect(secondSessionId).not.toBe(firstSessionId);
    await expect(
      page.getByText('Hi. This application is connected'),
    ).toHaveCount(0);

    const newThreadQuestion = 'help';
    const newThreadAnswer = await askRuntime(page, newThreadQuestion);
    await waitForRuntimeAnswer(newThreadAnswer);
    await page.reload();
    await expect(page.getByText(newThreadQuestion).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByText(/Hi\. This application is connected|Answer/i).first(),
    ).toBeVisible();
    const threadItems = page.getByTestId('runtime-thread-item');
    await expect(threadItems).toHaveCount(2);
    await threadItems.nth(1).click();
    await expect(
      page.getByText('Hi. This application is connected').first(),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get('session_id')).toBe(
      firstSessionId,
    );
    await threadItems.nth(0).click();
    expect(new URL(page.url()).searchParams.get('session_id')).toBe(
      secondSessionId,
    );
    await expect(page.getByText(newThreadQuestion).first()).toBeVisible();

    await page.getByTestId('runtime-delete-thread').first().click();
    await page.getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.getByTestId('runtime-thread-item')).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get('session_id')).toBeTruthy();

    expectNoErrors(errors);
  });

  test('database runtime exposes SQL, data, chart, and share for executable data product questions', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const appName = `${testAppName}-sql-runtime`;
    const { projectId, questions } = await publishDatabaseRuntimeApp(
      page,
      appName,
    );
    const sqlQuestion = await findWorkingSqlQuestion(
      page,
      projectId,
      questions,
    );
    test.skip(
      !sqlQuestion,
      'No configured VeADK data product question currently returns executable SQL/data; Wren Engine/Ibis data source is an external dependency.',
    );

    const errors = attachErrorGuards(page);
    const curatedAnswer = await askRuntime(page, sqlQuestion);
    await waitForRuntimeAnswer(curatedAnswer);
    await clickRuntimeTab(curatedAnswer, 'Data');
    await expect(curatedAnswer.locator('.ant-table')).toBeVisible();
    await clickRuntimeTab(curatedAnswer, 'SQL');
    await expect(curatedAnswer.locator('pre')).toContainText(/select|with/i);
    await clickRuntimeTab(curatedAnswer, 'Chart');
    await expect(curatedAnswer.getByTestId('runtime-db-chart')).toBeVisible();
    await expect(
      curatedAnswer.getByTestId('runtime-chart-contract'),
    ).toContainText(/table|sql/i);
    await clickRuntimeTab(curatedAnswer, 'Runtime');
    await expect(curatedAnswer).toContainText(
      /Chat mode|Resource mode|Execution path|Resources/,
    );

    const shareResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/applications/share') &&
        response.request().method() === 'POST',
    );
    await curatedAnswer.getByTestId('share-answer-button').click();
    const shareResponse = await shareResponsePromise;
    expect(shareResponse.status()).toBe(200);
    const sharePayload = await shareResponse.json();
    expect(sharePayload.token).toBeTruthy();
    expect(sharePayload.shareUrl).toContain(
      `/applications/share/${sharePayload.token}`,
    );
    await expect(
      page.getByText(/Application result link copied|Application result link/i),
    ).toBeVisible({
      timeout: 10000,
    });

    const sharePage = await page.context().newPage();
    const shareErrors = attachErrorGuards(sharePage);
    await sharePage.goto(`/applications/share/${sharePayload.token}`);
    await expect(
      sharePage.getByRole('heading', { name: appName }).first(),
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(sharePage.getByText(sqlQuestion).first()).toBeVisible();
    await expect(sharePage.getByText('SQL').first()).toBeVisible();
    await expect(sharePage.getByText('Structured data').first()).toBeVisible();
    await expect(sharePage.getByText('Chart contract').first()).toBeVisible();
    expectNoErrors(shareErrors);
    await sharePage.close();
    expectNoErrors(errors);
  });

  test('returns structured VeADK ask errors for non-curated questions', async ({
    page,
  }) => {
    test.setTimeout(45000);
    const databaseResource = await getVeadkDatabaseResource(page);
    test.skip(!databaseResource, 'VeADK data product resource is required');
    const { projectId } = await getDataProductQuestion(page, databaseResource!);
    const response = await page.request
      .post('/api/applications/ask', {
        timeout: 25000,
        data: {
          appCode: 'veadk-e2e-contract',
          projectId,
          question: 'How many orders are there?',
          threadId: `veadk-e2e-contract-${testRunId}`,
        },
      })
      .catch((error) => {
        skipExternalDependency(error, 'WrenAI SQL generation');
        throw error;
      });
    expect(response.status()).not.toBe(500);
    const payload = await response.json();
    if (!response.ok()) {
      expect(payload.error || payload.message).toBeTruthy();
      expect(payload.stage).toBeTruthy();
      expect(payload.advice).toBeTruthy();
    }
  });

  test('publishes a knowledge lightweight app into unified runtime', async ({
    page,
  }) => {
    test.setTimeout(150000);
    const knowledgeResources = await requireDbgpt<DbgptResourceOption[]>(
      page,
      '/api/v1/app/resources/list?type=knowledge',
    );
    test.skip(
      !knowledgeResources.length,
      'real DB-GPT knowledge resource is required',
    );
    const knowledge = knowledgeResources[0];
    const appName = `${testAppName}-knowledge`;

    await createSingleAgentApp(
      page,
      appName,
      'E2E knowledge app for VeADK Studio validation.',
    );
    await page.getByTestId('resource-publish-kind-knowledge').click();
    await selectResourceOption(page, knowledge);
    await page.getByRole('button', { name: 'Bind resource' }).click();
    await expect(
      page.getByText(knowledge.label || knowledge.key).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(
      page.getByText('Application configuration saved.'),
    ).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Publish' }).first().click();
    await expect(page.getByText('Application published.')).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Run' }).first().click();
    await expect(page).toHaveURL(/\/applications\/run\//, { timeout: 30000 });
    const errors = attachErrorGuards(page);
    await expect(
      page.getByRole('button', { name: /Runtime Dashboard/i }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/Ask this application|Ask a question/i),
    ).toBeEnabled();
    const answerBlock = await askRuntime(
      page,
      'Summarize this knowledge space.',
    );
    await expect(answerBlock).toContainText(
      /Asking the application|Summarize this knowledge space/,
    );
    await expect
      .poll(
        async () => {
          const text = await answerBlock.innerText();
          if (text.includes('Application runtime failed')) return 'finished';
          if (text.includes('Answer') || text.includes('Runtime'))
            return 'finished';
          return 'pending';
        },
        { timeout: 70000 },
      )
      .toBe('finished');
    await clickRuntimeTab(answerBlock, 'Runtime');
    await expect(answerBlock).toContainText(
      /Chat mode|Resource mode|Execution path|Resources/,
    );
    await expect(answerBlock).toContainText(
      /Knowledge|Bound knowledge|knowledge/i,
    );
    expectNoErrors(errors);
  });

  test('publishes a tool connector app only when a real active connector exists', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const connectors = await requireDbgpt<ConnectorInstance[]>(
      page,
      '/api/v2/serve/connectors',
    );
    const activeConnector = connectors.find(
      (item) => item.status === 'active' && item.config?.server_uri,
    );
    test.skip(!activeConnector, 'real active custom MCP connector is required');
    const appName = `${testAppName}-tool`;

    await createSingleAgentApp(
      page,
      appName,
      'E2E tool connector app for VeADK Studio validation.',
    );
    await page.getByTestId('resource-publish-kind-tool').click();
    await page.getByTestId('resource-publish-select').click();
    await page
      .getByTitle(
        `${activeConnector!.display_name} (${activeConnector!.connector_type})`,
      )
      .click();
    await page.getByRole('button', { name: 'Bind resource' }).click();
    await expect(
      page.getByText(activeConnector!.display_name).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(
      page.getByText('Application configuration saved.'),
    ).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Publish' }).first().click();
    await expect(page.getByText('Application published.')).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Run' }).first().click();
    await expect(page).toHaveURL(/\/applications\/run\//, { timeout: 30000 });
    const errors = attachErrorGuards(page);
    await expect(
      page.getByPlaceholder(/Ask this application|Ask a question/i),
    ).toBeEnabled();
    const answerBlock = await askRuntime(
      page,
      'List the available tools and call the most relevant one if needed.',
    );
    await expect
      .poll(
        async () => {
          const text = await answerBlock.innerText();
          if (text.includes('Application runtime failed')) return 'finished';
          if (text.includes('Answer') || text.includes('Runtime'))
            return 'finished';
          return 'pending';
        },
        { timeout: 70000 },
      )
      .toBe('finished');
    await clickRuntimeTab(answerBlock, 'Runtime');
    await expect(answerBlock).toContainText(
      /Tool connector|tool|Runtime events|No runtime events/i,
    );
    const bodyText = await answerBlock.innerText();
    expect(
      /Tool calls|Tool error|No runtime events were returned|Runtime payload|Runtime details/i.test(
        bodyText,
      ),
    ).toBeTruthy();
    expectNoErrors(errors);
  });

  test('publishes workflow composite apps into unified runtime when flows exist', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const flows = await requireDbgpt<DbgptFlowResponse>(
      page,
      '/api/v2/serve/awel/flows?page=1&page_size=10000',
    );
    test.skip(!flows.items.length, 'real deployed AWEL workflow is required');
    const flow = flows.items[0];
    const appName = `${testAppName}-workflow`;

    await createApplication(
      page,
      appName,
      /AWEL Flow App/i,
      'E2E workflow composite app for VeADK Studio validation.',
    );
    await expect(
      page.getByText(/Workflow apps compose|workflow/i).first(),
    ).toBeVisible();
    await page.getByLabel('Workflow').click();
    await page.getByTitle(flow.label || flow.name).click();
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(
      page.getByText('Application configuration saved.'),
    ).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Publish' }).first().click();
    await expect(page.getByText('Application published.')).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole('button', { name: 'Run' }).first().click();
    await expect(page).toHaveURL(/\/applications\/run\//, { timeout: 30000 });
    const errors = attachErrorGuards(page);
    await expect(
      page.getByText(/AWEL flow application|chat_agent|chat_flow/i),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/Ask this application|Ask a question/i),
    ).toBeEnabled();
    const answerBlock = await askRuntime(page, 'Run this workflow.');
    await expect
      .poll(
        async () => {
          const text = await answerBlock.innerText();
          if (text.includes('Application runtime failed')) return 'finished';
          if (text.includes('Answer') || text.includes('Runtime'))
            return 'finished';
          return 'pending';
        },
        { timeout: 70000 },
      )
      .toBe('finished');
    await clickRuntimeTab(answerBlock, 'Runtime');
    await expect(answerBlock).toContainText(
      flow.name || flow.uid || 'Workflow',
    );
    await expect(answerBlock).toContainText(
      /Workflow events|No runtime events were returned|Runtime details/i,
    );
    expectNoErrors(errors);
  });

  test('application lifecycle keeps publish and start states consistent', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors = attachErrorGuards(page);
    const appName = `${testAppName}-lifecycle`;
    const databaseResource = await getVeadkDatabaseResource(page, {
      requireQuestions: true,
    });
    test.skip(!databaseResource, 'VeADK data product resource is required');

    await createSingleAgentApp(page, appName);
    await page.getByTestId('resource-publish-kind-database').click();
    await selectResourceOption(page, databaseResource!);
    await page.getByRole('button', { name: 'Bind resource' }).click();
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(
      page.getByText('Application configuration saved.'),
    ).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByText(databaseResource!.label || databaseResource!.key).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).first().click();
    await expect(page.getByText('Application published.')).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByRole('button', { name: 'Run' }).first(),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Unpublish' }).first(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Unpublish' }).first().click();
    await expect(page.getByText('Application unpublished.')).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByRole('button', { name: 'Run' }).first(),
    ).toBeDisabled();
    await expect(
      page.getByText(databaseResource!.label || databaseResource!.key).first(),
    ).toBeVisible();
    expectNoErrors(errors);
  });
});
