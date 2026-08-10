import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Modal, Pagination, Spin, Tag, Typography } from 'antd';
import ForkOutlined from '@ant-design/icons/ForkOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import {
  ConstructCard,
  ConstructEmpty,
  ConstructGrid,
  ConstructLayout,
  ConstructToolbar,
  StatusTag,
} from '@/components/construct/ConstructLayout';
import { DbgptFlow, DbgptFlowResponse, fetchDbgpt } from '@/lib/dbgpt';
import { Path } from '@/utils/enum';

const { Text } = Typography;
const PAGE_SIZE = 12;

export default function Workflow() {
  const router = useRouter();
  const [flows, setFlows] = useState<DbgptFlow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFlows = async (nextPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDbgpt<DbgptFlowResponse>(
        `/api/v2/serve/awel/flows?page=${nextPage}&page_size=${PAGE_SIZE}`,
      );
      setFlows(data?.items || []);
      setTotal(data?.total_count || 0);
      setPage(data?.page || nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load flows.');
      setFlows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlows(1);
  }, []);

  return (
    <ConstructLayout
      activeKey="workflow"
      icon={<ForkOutlined />}
      title="Workflow"
      description="Workflow follows DB-GPT's AWEL flow list and canvas model. Flows are loaded from DB-GPT; database, knowledge, and tools can be composed after the canvas/runtime contract is wired."
      loading={loading && flows.length === 0}
      actions={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => router.push(Path.Workflow + '/canvas')}
        >
          Create flow
        </Button>
      }
    >
      <ConstructToolbar
        left={<Tag>{total} flows</Tag>}
        right={<Button onClick={() => loadFlows(page)}>Refresh</Button>}
      />

      <Spin spinning={loading}>
        {error ? (
          <ConstructEmpty
            title="DB-GPT workflow service is unavailable"
            description={error}
            action={<Button onClick={() => loadFlows(1)}>Retry</Button>}
          />
        ) : flows.length === 0 ? (
          <ConstructEmpty
            title="No workflow found"
            description="Create an AWEL flow before composing database, knowledge, and tools. This page does not show sample workflows."
            action={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => router.push(Path.Workflow + '/canvas')}
              >
                Create flow
              </Button>
            }
          />
        ) : (
          <>
            <ConstructGrid>
              {flows.map((flow) => (
                <ConstructCard
                  key={flow.uid}
                  icon={<ForkOutlined />}
                  title={flow.label || flow.name}
                  onClick={() =>
                    router.push(
                      `${Path.Workflow}/canvas?id=${encodeURIComponent(
                        flow.uid,
                      )}`,
                    )
                  }
                  tags={
                    <>
                      {flow.source && (
                        <Tag color={flow.source === 'DBGPT-WEB' ? 'green' : 'blue'}>
                          {flow.source}
                        </Tag>
                      )}
                      {flow.define_type && <Tag color="purple">{flow.define_type}</Tag>}
                      <Tag>{flow.editable ? 'Editable' : 'Read only'}</Tag>
                      <StatusTag status={flow.state} />
                    </>
                  }
                  description={flow.description || 'No description.'}
                  footer={
                    <>
                      <span>{flow.nick_name || 'owner unset'}</span>
                      <span>{flow.gmt_modified || ''}</span>
                    </>
                  }
                />
              ))}
            </ConstructGrid>
            <div className="d-flex justify-end mt-4">
              <Pagination
                current={page}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={(nextPage) => loadFlows(nextPage)}
              />
            </div>
          </>
        )}
      </Spin>

      <div className="mt-4">
        <Text className="gray-7 text-sm">
          No mock workflow outputs are rendered. The flow canvas only opens as a
          builder shell until DB-GPT's canvas save/debug APIs are fully wired.
        </Text>
      </div>
    </ConstructLayout>
  );
}
