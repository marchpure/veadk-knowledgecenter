import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useOnboardingStatusQuery } from '@/apollo/client/graphql/onboarding.generated';
import { OnboardingStatus } from '@/apollo/client/graphql/__types__';
import { Path } from '@/utils/enum';

const redirectRoute = {
  [OnboardingStatus.DATASOURCE_SAVED]: Path.OnboardingModels,
  [OnboardingStatus.NOT_STARTED]: Path.OnboardingConnection,
  [OnboardingStatus.ONBOARDING_FINISHED]: Path.Modeling,
  [OnboardingStatus.WITH_SAMPLE_DATASET]: Path.Modeling,
};

export const useWithOnboarding = (
  options: { enabled?: boolean; autoRedirect?: boolean } = {},
) => {
  const enabled = options.enabled ?? true;
  const autoRedirect = options.autoRedirect ?? true;
  const router = useRouter();
  const { data, loading, error, refetch } = useOnboardingStatusQuery({
    skip: !enabled,
    errorPolicy: 'all',
  });

  const onboardingStatus = data?.onboardingStatus?.status;

  useEffect(() => {
    if (!enabled) return;
    if (!autoRedirect) return;
    if (onboardingStatus) {
      const newPath = redirectRoute[onboardingStatus];
      const pathname = router.pathname;
      const projectScopedPaths = new Set([
        Path.Modeling,
        Path.KnowledgeQuestionSQLPairs,
        Path.KnowledgeInstructions,
      ]);
      const rawProjectId = Array.isArray(router.query.projectId)
        ? router.query.projectId[0]
        : router.query.projectId;
      const projectId = Number(rawProjectId);
      const isProjectScopedPage =
        projectScopedPaths.has(pathname as Path) &&
        Number.isFinite(projectId) &&
        projectId > 0;

      // A project-scoped construct page is already past the global onboarding
      // flow. Its project id is carried by the Apollo request context, so the
      // onboarding status of the default project must not redirect it to the
      // legacy setup wizard.
      if (isProjectScopedPage) {
        return;
      }

      // redirect to new path if onboarding is not completed
      if (newPath && newPath !== Path.Modeling) {
        // do not redirect if the new path and router pathname are the same
        if (newPath === pathname) {
          return;
        }

        // allow return back to previous steps
        if (
          router.pathname.startsWith(Path.Onboarding) &&
          onboardingStatus !== OnboardingStatus.ONBOARDING_FINISHED
        ) {
          return;
        }

        router.push(newPath);
        return;
      }

      // redirect to home page if onboarding is completed

      // redirect to the home page when entering the Index page
      if (pathname === '/') {
        router.push(newPath);
        return;
      }

      // redirect to home page since user using sample dataset
      if (
        pathname === Path.OnboardingRelationships &&
        onboardingStatus === OnboardingStatus.WITH_SAMPLE_DATASET
      ) {
        router.push(newPath);
        return;
      }

      // redirect to home page when entering the connection page or select models page
      if (
        [Path.OnboardingConnection, Path.OnboardingModels].includes(
          pathname as Path,
        )
      ) {
        router.push(newPath);
        return;
      }
    }
  }, [
    autoRedirect,
    enabled,
    onboardingStatus,
    router.pathname,
    router.query.projectId,
  ]);

  return {
    loading: enabled ? loading : false,
    error,
    refetch,
    onboardingStatus,
  };
};

export default function useOnboardingStatus() {
  const { data, loading, error, refetch } = useOnboardingStatusQuery();

  return {
    loading,
    error,
    refetch,
    onboardingStatus: data?.onboardingStatus?.status,
  };
}
