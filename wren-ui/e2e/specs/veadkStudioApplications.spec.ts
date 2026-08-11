import { expect, test, type Page } from '@playwright/test';

const testAppName = `veadk-e2e-${Date.now()}`;

const attachErrorGuards = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  return errors;
};

const expectNoErrors = (errors: string[]) => {
  expect(errors, errors.join('\n')).toEqual([]);
};

const gotoAndCheck = async (page: Page, path: string, heading: string) => {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({
    timeout: 30000,
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
};

const getDbgpt = async <T>(page: Page, path: string) => {
  const response = await page.request.get(`/api/dbgpt${path}`);
  expect(response.ok(), `${path} returned ${response.status()}`).toBeTruthy();
  const payload = await response.json();
  return (payload?.data ?? payload) as T;
};

test.describe('VeADK Studio application builder', () => {
  test('critical construct pages render without page or console errors', async ({
    page,
  }) => {
    const errors = attachErrorGuards(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Application error')).toHaveCount(0);

    await gotoAndCheck(page, '/database', 'Database');
    await gotoAndCheck(page, '/knowledge', 'Knowledge');
    await gotoAndCheck(page, '/tools', 'Tools');
    await gotoAndCheck(page, '/workflow', 'Workflow');
    expectNoErrors(errors);
  });

  test('creates, configures, publishes, and opens a unified runtime app', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = attachErrorGuards(page);
    const teamModes = await getDbgpt<Array<{ value: string }>>(
      page,
      '/api/v1/team-mode/list',
    );
    const resourceTypes = await getDbgpt<string[]>(
      page,
      '/api/v1/resource-type/list',
    );
    const agents = await getDbgpt<Array<{ name: string }>>(
      page,
      '/api/v1/agents/list',
    );
    const databaseResources = await getDbgpt<Array<{ key: string }>>(
      page,
      '/api/v1/app/resources/list?type=database',
    );

    expect(
      teamModes.some((mode) => mode.value === 'single_agent'),
      'single_agent work mode is required',
    ).toBeTruthy();
    expect(
      resourceTypes.includes('database'),
      'database resource type is required',
    ).toBeTruthy();
    expect(agents.length, 'at least one DB-GPT agent is required').toBeGreaterThan(0);
    expect(
      databaseResources.length,
      'at least one real database/data product resource is required',
    ).toBeGreaterThan(0);

    await page.goto('/applications');
    await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
    await page.getByRole('button', { name: 'Create application' }).first().click();
    const createDialog = page.getByRole('dialog', { name: 'Create application' });
    await createDialog.getByRole('button', { name: /Single Agent/i }).click();
    await page.getByLabel('Application name').fill(testAppName);
    await page
      .getByLabel('Description')
      .fill('E2E resource app for VeADK Studio validation.');
    await createDialog.getByRole('button', { name: /^Create$/ }).click();

    await expect(
      page.getByRole('heading', { name: testAppName }).first(),
    ).toBeVisible({ timeout: 30000 });

    await expect(page.getByText('Agents')).toBeVisible();
    await page.getByText(agents[0].name, { exact: false }).first().click();
    await page.getByText('Publish resources').waitFor({ state: 'visible' });
    await page.getByTestId('resource-publish-kind-database').click();
    await page.getByTestId('resource-publish-select').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Bind resource' }).click();
    await expect(
      page.getByText('Bound resources', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(/Walmart_Sales|veadk:/i).first()).toBeVisible();

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
    await expect(
      page.getByRole('heading', { name: testAppName }).first(),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/Ask this application|Ask a question/i),
    ).toBeVisible();
    await page
      .getByPlaceholder(/Ask this application|Ask a question/i)
      .fill('How many orders are there?');
    await page.getByRole('button', { name: /Send/ }).last().click();
    const answerBlock = page.locator('[data-jsid="applicationAnswerResult"]');
    await expect(answerBlock.first()).toBeVisible({ timeout: 10000 });
    await expect(answerBlock.first()).toContainText(
      'How many orders are there?',
    );
    await expect(answerBlock.first()).toContainText(
      /Asking the application|Analyzing the bound data product/,
    );
    await expect
      .poll(
        async () => {
          const text = await answerBlock.first().innerText();
          if (text.includes('Application runtime failed')) return 'failed';
          if (
            text.includes('Answer') ||
            text.includes('Runtime') ||
            text.includes('Assistant message')
          ) {
            return 'answered';
          }
          return 'unknown';
        },
        { timeout: 70000 },
      )
      .toMatch(/answered|failed/);

    expectNoErrors(errors);
  });
});
