import { Empty, Space, Tag, Typography } from 'antd';
import styled from 'styled-components';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SimpleLayout from '@/components/layouts/SimpleLayout';

const { Paragraph, Text, Title } = Typography;

const Page = styled.div`
  min-height: calc(100vh - 56px);
  overflow: auto;
  background: linear-gradient(180deg, #f7f9fc 0%, #ffffff 46%, #f7f9fc 100%);
`;

const Inner = styled.div`
  width: min(1400px, calc(100% - 48px));
  margin: 0 auto;
  padding: 24px 0 72px;

  @media (max-width: 760px) {
    width: calc(100% - 28px);
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
`;

const HeaderTitle = styled.div`
  min-width: 0;
`;

const IconTile = styled.span<{ $color?: string }>`
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  margin-right: 12px;
  border-radius: 10px;
  color: #fff;
  background: ${(props) =>
    props.$color || 'linear-gradient(135deg, #2867f5, #7c3aed)'};
  box-shadow: 0 10px 24px rgba(40, 103, 245, 0.18);
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
`;

const Card = styled.div<{ $interactive?: boolean; $dashed?: boolean }>`
  display: flex;
  flex-direction: column;
  min-height: 210px;
  padding: 18px;
  border: 1px ${(props) => (props.$dashed ? 'dashed' : 'solid')}
    ${(props) =>
      props.$dashed ? 'rgba(148, 163, 184, 0.62)' : 'rgba(226, 232, 240, 0.92)'};
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
  cursor: ${(props) => (props.$interactive ? 'pointer' : 'default')};

  &:hover {
    border-color: ${(props) =>
      props.$interactive ? 'rgba(40, 103, 245, 0.34)' : undefined};
    box-shadow: ${(props) =>
      props.$interactive
        ? '0 14px 34px rgba(15, 23, 42, 0.10)'
        : '0 8px 26px rgba(15, 23, 42, 0.05)'};
    transform: ${(props) => (props.$interactive ? 'translateY(-1px)' : 'none')};
  }
`;

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
`;

const CardTitle = styled.div`
  min-width: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
`;

const CardDescription = styled.div`
  flex: 1 1 auto;
  color: #64748b;
  font-size: 13px;
  line-height: 1.58;
`;

const CardFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
  color: #64748b;
  font-size: 12px;
`;

const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Section = styled.div`
  padding: 18px;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 8px 26px rgba(15, 23, 42, 0.05);
`;

const EmptyBox = styled.div`
  display: grid;
  place-items: center;
  min-height: 360px;
  border: 1px dashed rgba(148, 163, 184, 0.62);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.66);
`;

type LayoutProps = {
  activeKey: string;
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
};

export function ConstructLayout({
  activeKey,
  icon,
  title,
  description,
  actions,
  loading,
  children,
}: LayoutProps) {
  return (
    <SimpleLayout loading={loading}>
      <Page>
        <Inner>
          <Header>
            <HeaderTitle>
              <div className="d-flex align-center">
                <IconTile>{icon}</IconTile>
                <Title level={3} className="mb-0 gray-10">
                  {title}
                </Title>
              </div>
              {description && (
                <Paragraph
                  className="gray-7 mb-0 mt-2"
                  style={{ maxWidth: 820 }}
                >
                  {description}
                </Paragraph>
              )}
            </HeaderTitle>
            {actions && <Space>{actions}</Space>}
          </Header>
          {children}
        </Inner>
      </Page>
    </SimpleLayout>
  );
}

export function ConstructToolbar({
  left,
  right,
}: {
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <Toolbar>
      <Space size={[10, 10]} wrap>
        {left}
      </Space>
      <Space size={[10, 10]} wrap>
        {right}
      </Space>
    </Toolbar>
  );
}

export function ConstructGrid({ children }: { children: React.ReactNode }) {
  return <Grid>{children}</Grid>;
}

export function ConstructCard({
  icon,
  title,
  description,
  tags,
  footer,
  actions,
  onClick,
  dashed,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  tags?: React.ReactNode;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  dashed?: boolean;
}) {
  return (
    <Card $interactive={Boolean(onClick)} $dashed={dashed} onClick={onClick}>
      <CardHeader>
        <Space align="start" size={12}>
          {icon && <IconTile>{icon}</IconTile>}
          <div>
            <CardTitle>{title}</CardTitle>
            {tags && <BadgeRow className="mt-2">{tags}</BadgeRow>}
          </div>
        </Space>
        {actions}
      </CardHeader>
      {description && <CardDescription>{description}</CardDescription>}
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}

export function ConstructSection({
  title,
  description,
  children,
  action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Section>
      <div className="d-flex align-center justify-space-between mb-3">
        <div>
          <Text strong>{title}</Text>
          {description && <div className="gray-7 text-sm">{description}</div>}
        </div>
        {action}
      </div>
      {children}
    </Section>
  );
}

export function ConstructEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <EmptyBox>
      <Empty
        image={<SearchOutlined style={{ fontSize: 44, color: '#94a3b8' }} />}
        imageStyle={{ height: 58 }}
        description={
          <div>
            <Text strong>{title}</Text>
            <div className="gray-7 text-sm mt-1">{description}</div>
          </div>
        }
      >
        {action}
      </Empty>
    </EmptyBox>
  );
}

export function StatusTag({ status }: { status?: string }) {
  const value = status || 'unknown';
  const color =
    value === 'active' || value === 'deployed' || value === 'running'
      ? 'green'
      : value === 'error' || value === 'load_failed'
        ? 'red'
        : value === 'needs_reactivation'
          ? 'orange'
          : 'blue';
  return <Tag color={color}>{value}</Tag>;
}
