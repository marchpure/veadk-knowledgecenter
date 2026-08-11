import { useRouter } from 'next/router';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import styled from 'styled-components';
import { Path } from '@/utils/enum';
import { StyledTreeNodeLink } from '@/components/sidebar/SidebarTree';

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const BackLink = styled(StyledTreeNodeLink)`
  color: var(--gray-8);
  margin-top: 16px;

  &:hover,
  &:focus {
    background: var(--gray-4);
    color: var(--gray-8);
  }
`;

export default function HomeProjectReturn() {
  const router = useRouter();
  const projectId = getQueryValue(router.query.projectId);

  if (!projectId) return null;

  return (
    <BackLink
      href={{
        pathname: Path.Database,
        query: { mode: 'edit', step: 'ask', projectId },
      }}
    >
      <DatabaseOutlined className="mr-2" />
      <span>Database</span>
    </BackLink>
  );
}
