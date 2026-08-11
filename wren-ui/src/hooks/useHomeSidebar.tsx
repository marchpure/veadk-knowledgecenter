import { useMemo } from 'react';
import { useRouter } from 'next/router';
import { Path } from '@/utils/enum';
import {
  useDeleteThreadMutation,
  useThreadsQuery,
  useUpdateThreadMutation,
} from '@/apollo/client/graphql/home.generated';

export default function useHomeSidebar() {
  const router = useRouter();
  const { data, refetch } = useThreadsQuery({
    fetchPolicy: 'cache-and-network',
  });
  const [updateThread] = useUpdateThreadMutation({
    onError: (error) => console.error(error),
  });
  const [deleteThread] = useDeleteThreadMutation({
    onError: (error) => console.error(error),
  });

  const threads = useMemo(
    () =>
      (data?.threads || []).map((thread) => ({
        id: thread.id.toString(),
        name: thread.summary,
      })),
    [data],
  );

  const onSelect = (selectKeys: string[]) => {
    router.push({
      pathname: `${Path.Home}/${selectKeys[0]}`,
      query: router.query.projectId
        ? { projectId: router.query.projectId }
        : {},
    });
  };

  const onNewThread = () => {
    router.push({
      pathname: Path.Home,
      query: router.query.projectId
        ? { projectId: router.query.projectId }
        : {},
    });
  };

  const onRename = async (id: string, newName: string) => {
    await updateThread({
      variables: { where: { id: Number(id) }, data: { summary: newName } },
    });
    refetch();
  };

  const onDelete = async (id) => {
    await deleteThread({ variables: { where: { id: Number(id) } } });
    refetch();
  };

  return {
    data: { threads },
    compactTopNav: Boolean(router.query.projectId),
    onSelect,
    onNewThread,
    onRename,
    onDelete,
    refetch,
  };
}
