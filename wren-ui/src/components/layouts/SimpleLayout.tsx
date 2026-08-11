import { Layout } from 'antd';
import HeaderBar from '@/components/HeaderBar';
import PageLoading from '@/components/PageLoading';
import { useWithOnboarding } from '@/hooks/useCheckOnboarding';
import clsx from 'clsx';

const { Content } = Layout;

interface Props {
  children: React.ReactNode;
  loading?: boolean;
  checkOnboarding?: boolean;
}

export default function SimpleLayout(props: Props) {
  const { children, loading, checkOnboarding = true } = props;
  const { loading: onboardingLoading } = useWithOnboarding({
    enabled: checkOnboarding,
  });
  const fetching = checkOnboarding ? onboardingLoading : false;
  const pageLoading = fetching || loading;
  return (
    <Layout
      className={clsx('adm-main bg-gray-3', {
        'overflow-hidden': pageLoading,
      })}
    >
      <HeaderBar />
      <Content className="adm-content">{children}</Content>
      <PageLoading visible={pageLoading} />
    </Layout>
  );
}
