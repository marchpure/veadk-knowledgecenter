import { useRouter } from 'next/router';
import { Button, Tabs, Tag } from 'antd';
import ArrowLeftOutlined from '@ant-design/icons/ArrowLeftOutlined';
import CloudUploadOutlined from '@ant-design/icons/CloudUploadOutlined';
import PartitionOutlined from '@ant-design/icons/PartitionOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SettingOutlined from '@ant-design/icons/SettingOutlined';
import {
  ConstructEmpty,
  ConstructLayout,
  ConstructSection,
} from '@/components/construct/ConstructLayout';
import { Path } from '@/utils/enum';

export default function KnowledgeDetail() {
  const router = useRouter();
  const spaceName = String(router.query.spaceName || '');

  return (
    <ConstructLayout
      activeKey="knowledge"
      icon={<PartitionOutlined />}
      title={spaceName || 'Knowledge detail'}
      description="This route mirrors DB-GPT's knowledge detail shell. Document upload, segmentation, retrieval testing, and chat need the DB-GPT detail APIs wired before they become editable in WrenUI."
      actions={
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(Path.Knowledge)}>
          Back
        </Button>
      }
    >
      <ConstructSection
        title="Space pipeline"
        description="The list and create flow are live; this detail surface is intentionally not filled with mock documents."
        action={<Tag>DB-GPT compatible</Tag>}
      >
        <Tabs defaultActiveKey="documents">
          <Tabs.TabPane
            tab={
              <span>
                <CloudUploadOutlined /> Documents
              </span>
            }
            key="documents"
          >
            <ConstructEmpty
              title="Document management is not wired in WrenUI yet"
              description="Use DB-GPT's space detail APIs for upload, sync, segmentation, and chunk operations before enabling edits here."
            />
          </Tabs.TabPane>
          <Tabs.TabPane
            tab={
              <span>
                <SearchOutlined /> Recall test
              </span>
            }
            key="recall"
          >
            <ConstructEmpty
              title="Recall test is pending integration"
              description="This tab is reserved for DB-GPT's retrieval strategy and recall test components."
            />
          </Tabs.TabPane>
          <Tabs.TabPane
            tab={
              <span>
                <SettingOutlined /> Arguments
              </span>
            }
            key="arguments"
          >
            <ConstructEmpty
              title="Arguments are pending integration"
              description="No placeholder parameters are shown until they can be read from DB-GPT."
            />
          </Tabs.TabPane>
        </Tabs>
      </ConstructSection>
    </ConstructLayout>
  );
}
