import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Space, Typography } from 'antd';
import { useWithOnboarding } from '@/hooks/useCheckOnboarding';
import { Path } from '@/utils/enum';

const { Paragraph, Text, Title } = Typography;

export default function Index() {
  const { loading, error, onboardingStatus, refetch } = useWithOnboarding({
    autoRedirect: false,
  });
  const [showFallback, setShowFallback] = useState(false);
  const missingOnboardingStatus = !loading && !error && !onboardingStatus;

  useEffect(() => {
    if (!loading) {
      setShowFallback(false);
      return;
    }
    const timeout = window.setTimeout(() => setShowFallback(true), 6000);
    return () => window.clearTimeout(timeout);
  }, [loading]);

  const hasInitializationIssue =
    error || showFallback || missingOnboardingStatus;
  const description = error
    ? error.message ||
      'GraphQL or project initialization failed while opening Home.'
    : missingOnboardingStatus
      ? 'No WrenAI data product is configured or the project service returned no onboarding status.'
      : showFallback
        ? 'Home is still waiting for WrenAI project initialization.'
        : 'Workspace status is available.';

  return (
    <main style={{ minHeight: '100vh', background: '#f7f9fc', padding: 24 }}>
      <div
        style={{
          maxWidth: 1040,
          margin: '72px auto 0',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Text type="secondary">VeADK Studio</Text>
          <Title level={2} style={{ margin: '8px 0 8px' }}>
            Knowledge Center
          </Title>
          <Paragraph style={{ maxWidth: 680, marginBottom: 0 }}>
            Configure data products, knowledge spaces, connectors, workflows,
            and published applications from one workspace.
          </Paragraph>
        </div>

        {hasInitializationIssue && (
          <Alert
            style={{ marginBottom: 18 }}
            type={error ? 'error' : 'info'}
            showIcon
            message={
              error
                ? 'Home initialization failed'
                : missingOnboardingStatus
                  ? 'No WrenAI data product is configured'
                  : 'Home initialization is still running'
            }
            description={description}
            action={
              <Button size="small" onClick={() => refetch?.()}>
                Retry
              </Button>
            }
          />
        )}

        {!hasInitializationIssue && (
          <Alert
            style={{ marginBottom: 18 }}
            type="success"
            showIcon
            message="Workspace ready"
            description={`Onboarding status: ${onboardingStatus}`}
          />
        )}

        {loading && !showFallback && (
          <Alert
            style={{ marginBottom: 18 }}
            type="info"
            showIcon
            message="Checking workspace status"
            description="You can open Applications immediately while WrenAI Home finishes initialization."
          />
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {[
            {
              title: 'Applications',
              description: 'Publish and test unified application runtimes.',
              path: Path.Applications,
              primary: true,
            },
            {
              title: 'Database',
              description: 'Create data products and semantic QA spaces.',
              path: Path.Database,
            },
            {
              title: 'Knowledge',
              description: 'Manage knowledge spaces, documents, and indexes.',
              path: Path.Knowledge,
            },
            {
              title: 'Tools',
              description: 'Configure connectors such as custom MCP tools.',
              path: Path.Tools,
            },
            {
              title: 'Workflow',
              description: 'Build and run DB-GPT style workflow apps.',
              path: Path.Workflow,
            },
            {
              title: 'Data QA Dashboard',
              description:
                'Open the WrenAI dashboard when a data product exists.',
              path: Path.HomeDashboard,
            },
          ].map((entry) => (
            <div
              key={entry.path}
              style={{
                display: 'flex',
                minHeight: 168,
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 18,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#fff',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
              }}
            >
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  {entry.title}
                </Title>
                <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
                  <Text type="secondary">{entry.description}</Text>
                </Paragraph>
              </div>
              <Space style={{ marginTop: 18 }}>
                <Link href={entry.path}>
                  <Button type={entry.primary ? 'primary' : 'default'}>
                    Open
                  </Button>
                </Link>
              </Space>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
