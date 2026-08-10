import { useRouter } from 'next/router';
import { Button, Layout, Space } from 'antd';
import styled from 'styled-components';
import LogoBar from '@/components/LogoBar';
import { Path } from '@/utils/enum';
import Deploy from '@/components/deploy/Deploy';

const { Header } = Layout;

const StyledButton = styled(Button)<{ $isHighlight: boolean }>`
  background: ${(props) =>
    props.$isHighlight ? 'rgba(40, 103, 245, 0.10)' : 'transparent'};
  font-weight: ${(props) => (props.$isHighlight ? '700' : '500')};
  border: none;
  color: ${(props) =>
    props.$isHighlight ? 'var(--gray-10)' : 'var(--gray-7)'};
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;

  &:hover,
  &:focus {
    background: ${(props) =>
      props.$isHighlight ? 'rgba(40, 103, 245, 0.10)' : 'var(--gray-3)'};
    color: var(--gray-10);
  }
`;

const StyledHeader = styled(Header)`
  height: 56px;
  border-bottom: 1px solid var(--gray-4);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
  padding: 12px 20px;
  position: sticky;
  top: 0;
  z-index: 20;
`;

const navItems = [
  { key: 'applications', label: 'Applications', path: Path.Applications },
  { key: 'workflow', label: 'Workflow', path: Path.Workflow },
  { key: 'database', label: 'Database', path: Path.Database },
  { key: 'knowledge', label: 'Knowledge', path: Path.Knowledge },
  { key: 'tools', label: 'Tools', path: Path.Tools },
];

const getActiveKey = (pathname: string) => {
  if (pathname.startsWith(Path.Workflow)) return 'workflow';
  if (pathname.startsWith(Path.Applications)) return 'applications';

  if (
    pathname.startsWith(Path.Database) ||
    pathname.startsWith(Path.Modeling) ||
    pathname.startsWith(Path.Onboarding)
  ) {
    return 'database';
  }

  if (pathname.startsWith(Path.Knowledge)) return 'knowledge';
  if (pathname.startsWith(Path.Tools)) return 'tools';
  return 'applications';
};

export default function HeaderBar() {
  const router = useRouter();
  const { pathname } = router;
  const showNav = !pathname.startsWith(Path.Onboarding);
  const isModeling = pathname.startsWith(Path.Modeling);
  const activeKey = getActiveKey(pathname);

  return (
    <StyledHeader>
      <div
        className="d-flex justify-space-between align-center"
        style={{ marginTop: 0 }}
      >
        <Space size={[48, 0]}>
          <LogoBar />
          {showNav && (
            <Space size={[4, 0]}>
              {navItems.map((item) => (
                <StyledButton
                  key={item.key}
                  shape="round"
                  size="small"
                  $isHighlight={activeKey === item.key}
                  onClick={() => router.push(item.path)}
                >
                  {item.label}
                </StyledButton>
              ))}
            </Space>
          )}
        </Space>
        {isModeling && (
          <Space size={[16, 0]}>
            <Deploy />
          </Space>
        )}
      </div>
    </StyledHeader>
  );
}
