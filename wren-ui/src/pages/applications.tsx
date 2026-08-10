import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Input,
  Pagination,
  Spin,
  Tag,
  Typography,
} from 'antd';
import AppstoreOutlined from '@ant-design/icons/AppstoreOutlined';
import BarChartOutlined from '@ant-design/icons/BarChartOutlined';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import ForkOutlined from '@ant-design/icons/ForkOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import styled from 'styled-components';
import {
  ConstructEmpty,
  ConstructLayout,
  ConstructToolbar,
  StatusTag,
} from '@/components/construct/ConstructLayout';
import { useDiagramQuery } from '@/apollo/client/graphql/diagram.generated';
import { useGetSettingsQuery } from '@/apollo/client/graphql/settings.generated';
import {
  DbgptApp,
  DbgptAppListResponse,
  fetchDbgpt,
} from '@/lib/dbgpt';
import { Path } from '@/utils/enum';

const { Paragraph, Text } = Typography;
const PAGE_SIZE = 12;

type TabKey = 'all' | 'published' | 'unpublished';

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

const AppCard = styled.div<{ $runtime?: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 220px;
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.96);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.06);
`;

const AppIcon = styled.div<{ $color?: string }>`
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 12px;
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

const getDataSourceName = (properties?: Record<string, unknown>) => {
  if (!properties) return 'WrenAI GenBI';
  return (
    (properties.displayName as string) ||
    (properties.database as string) ||
    (properties.projectId as string) ||
    'WrenAI GenBI'
  );
};

const getDbgptConstructUrl = (path: string) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_DBGPT_WEB_BASE_URL || 'http://127.0.0.1:5670';
  return `${baseUrl}${path}`;
};

export default function Applications() {
  const [apps, setApps] = useState<DbgptApp[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeKey, setActiveKey] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settingsQuery = useGetSettingsQuery({ fetchPolicy: 'cache-and-network' });
  const diagramQuery = useDiagramQuery({ fetchPolicy: 'cache-and-network' });

  const dataSource = settingsQuery.data?.settings?.dataSource;
  const hasDataProduct = Boolean(dataSource?.type);
  const productName = getDataSourceName(dataSource?.properties);
  const modelCount = diagramQuery.data?.diagram?.models?.length || 0;

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

  const runtimeCards = useMemo(() => {
    if (!hasDataProduct) return [];
    return [
      {
        key: 'wren-genbi',
        title: `${productName} Ask`,
        description:
          'WrenAI GenBI runtime for the current database product. It uses the configured semantic model and knowledge.',
      },
    ];
  }, [hasDataProduct, productName]);

  return (
    <ConstructLayout
      activeKey="applications"
      icon={<AppstoreOutlined />}
      title="Applications"
      description="Published runtime entries"
      loading={loading && apps.length === 0}
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          href={getDbgptConstructUrl('/construct/app?openModal=1')}
          target="_blank"
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
        right={<Tag>{total + runtimeCards.length} entries</Tag>}
      />

      <Spin spinning={loading}>
        {error && apps.length === 0 ? (
          <ConstructEmpty
            title="DB-GPT application service is unavailable"
            description={error}
            action={<Button onClick={() => loadApps(1)}>Retry</Button>}
          />
        ) : runtimeCards.length === 0 && apps.length === 0 ? (
          <ConstructEmpty
            title="No applications"
            description="Publish a workflow in DB-GPT or configure a WrenAI data product to expose a runtime entry."
            action={
              <Link href={Path.Database}>
                <Button icon={<DatabaseOutlined />}>Open database</Button>
              </Link>
            }
          />
        ) : (
          <>
            <AppGrid>
              {runtimeCards.map((card) => (
                <AppCard key={card.key} $runtime>
                  <AppHeader>
                    <AppIcon $color="linear-gradient(135deg, #0ea5e9, #2563eb)">
                      <BarChartOutlined />
                    </AppIcon>
                    <div style={{ minWidth: 0 }}>
                      <AppTitle>{card.title}</AppTitle>
                      <AppMeta>
                        <Tag color="blue">Database</Tag>
                        <Tag>GenBI</Tag>
                        <Tag>{modelCount} models</Tag>
                      </AppMeta>
                    </div>
                  </AppHeader>
                  <Paragraph className="gray-7 mt-4 mb-0" ellipsis={{ rows: 3 }}>
                    {card.description}
                  </Paragraph>
                  <AppFooter>
                    <Text className="gray-7 text-sm">WrenAI runtime</Text>
                    <Link href={Path.Home}>
                      <Button type="primary" size="small">
                        Ask
                      </Button>
                    </Link>
                  </AppFooter>
                </AppCard>
              ))}

              {apps.map((app) => (
                <AppCard key={app.app_code}>
                  <AppHeader>
                    <AppIcon>
                      <ForkOutlined />
                    </AppIcon>
                    <div style={{ minWidth: 0 }}>
                      <AppTitle>{app.app_name}</AppTitle>
                      <AppMeta>
                        {app.language && <Tag>{app.language}</Tag>}
                        {app.team_mode && <Tag>{app.team_mode}</Tag>}
                        <StatusTag
                          status={
                            app.published === 'true'
                              ? 'published'
                              : 'unpublished'
                          }
                        />
                      </AppMeta>
                    </div>
                  </AppHeader>
                  <Paragraph className="gray-7 mt-4 mb-0" ellipsis={{ rows: 3 }}>
                    {app.app_describe || 'No description.'}
                  </Paragraph>
                  <AppFooter>
                    <Text className="gray-7 text-sm">
                      {app.owner_name || 'owner unset'}
                      {app.updated_at ? ` · ${app.updated_at}` : ''}
                    </Text>
                    <Button
                      size="small"
                      href={getDbgptConstructUrl('/construct/app')}
                      target="_blank"
                    >
                      Open
                    </Button>
                  </AppFooter>
                </AppCard>
              ))}
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
    </ConstructLayout>
  );
}
