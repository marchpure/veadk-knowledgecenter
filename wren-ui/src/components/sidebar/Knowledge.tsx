import Link from 'next/link';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import FunctionOutlined from '@ant-design/icons/FunctionOutlined';
import { Path, MENU_KEY } from '@/utils/enum';
import { InstructionsSVG } from '@/utils/svgs';
import SidebarMenu from '@/components/sidebar/SidebarMenu';

const Layout = styled.div`
  padding: 16px 0 0;
  width: 100%;
  background-color: var(--gray-2);
  overflow: hidden;
`;

const ScopeLabel = styled.div`
  padding: 0 16px 6px;
  color: var(--gray-7);
  font-size: 12px;
  font-weight: 700;
`;

const MENU_KEY_MAP = {
  [Path.KnowledgeQuestionSQLPairs]: MENU_KEY.QUESTION_SQL_PAIRS,
  [Path.KnowledgeInstructions]: MENU_KEY.INSTRUCTIONS,
};

const linkStyle = { color: 'inherit', transition: 'none' };

const getQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default function Knowledge() {
  const router = useRouter();
  const projectId = getQueryValue(router.query.projectId);
  const scopedQuery = projectId ? { projectId } : {};
  const isProjectScoped = Boolean(projectId);

  const menuItems = [
    {
      'data-guideid': 'question-sql-pairs',
      label: (
        <Link
          style={linkStyle}
          href={{
            pathname: Path.KnowledgeQuestionSQLPairs,
            query: scopedQuery,
          }}
        >
          Question-SQL pairs
        </Link>
      ),
      icon: <FunctionOutlined />,
      key: MENU_KEY.QUESTION_SQL_PAIRS,
      className: 'pl-4',
    },
    {
      'data-guideid': 'instructions',
      label: (
        <Link
          style={linkStyle}
          href={{ pathname: Path.KnowledgeInstructions, query: scopedQuery }}
        >
          Instructions
        </Link>
      ),
      icon: <InstructionsSVG />,
      key: MENU_KEY.INSTRUCTIONS,
      className: 'pl-4',
    },
  ];

  return (
    <Layout>
      {isProjectScoped && <ScopeLabel>Data product configuration</ScopeLabel>}
      <SidebarMenu
        items={menuItems}
        selectedKeys={MENU_KEY_MAP[router.pathname]}
      />
    </Layout>
  );
}
