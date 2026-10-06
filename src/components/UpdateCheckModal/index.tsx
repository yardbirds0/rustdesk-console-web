import {
  CheckCircleFilled,
  ExclamationCircleFilled,
  LinkOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import {
  Alert,
  Button,
  Modal,
  Skeleton,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import React, { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { checkUpdate } from '@/services/rustdesk-console/system';
import { isTerminalJob } from '@/services/rustdesk-console/systemUpdate';
import { matchingReleaseNotes } from '@/services/rustdesk-console/updateReleaseNotes';
import type { SystemUpdateView } from './useSystemUpdate';

const { Paragraph, Text, Link } = Typography;
const manualUrl = 'https://github.com/databk/rustdesk-console#readme';

function reasonKey(code?: string) {
  if (!code) return 'blocked';
  if (code === 'HELPER_VERIFY_FAILED') return 'internalUpdateFailed';
  if (/HELPER|UPDATER|SOCKET|NOT_CONFIGURED/.test(code))
    return 'helperUnavailable';
  if (/UNSUPPORTED|INSTALLATION|DEPLOYMENT|CONFIG|PLATFORM/.test(code))
    return 'deploymentBlocked';
  if (/BACKUP|MYSQL|SQLITE|DATABASE|SPACE|DISK|DATA_DIR/.test(code))
    return 'backupBlocked';
  if (/RELEASE|MANIFEST|ARTIFACT|INCOMPATIBLE|SOURCE/.test(code))
    return 'releaseBlocked';
  if (/PLAN|CONCURRENT|JOB_ACTIVE|IDEMPOTENCY/.test(code)) return 'planChanged';
  if (/INVALID_RESPONSE|PROTOCOL/.test(code)) return 'protocolMismatch';
  if (/WEB_VERSION/.test(code)) return 'verifyPending';
  return 'requestFailed';
}

const StatusBadge: React.FC<{ hasUpdate: boolean }> = ({ hasUpdate }) => (
  <div
    style={{
      width: 36,
      height: 36,
      borderRadius: '50%',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
      background: hasUpdate ? '#e6f4ff' : '#f6ffed',
      color: hasUpdate ? '#1677ff' : '#52c41a',
    }}
  >
    {hasUpdate ? <SyncOutlined /> : <CheckCircleFilled />}
  </div>
);

const UpdateCard: React.FC<{
  title: string;
  data: API.UpdateCheckComponent | null;
  uncertain: boolean;
}> = ({ title, data, uncertain }) => {
  const intl = useIntl();

  if (!data) return null;

  return (
    <section
      aria-label={title}
      style={{
        display: 'flex',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 8,
        background: '#fafafa',
        border: `1px solid ${data.has_update ? '#d6e4ff' : '#f0f0f0'}`,
        borderLeft: `3px solid ${data.has_update ? '#1677ff' : '#52c41a'}`,
      }}
    >
      {(!uncertain || data.has_update) && (
        <StatusBadge hasUpdate={data.has_update} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: 4,
          }}
        >
          <Text strong>{title}</Text>
          {data.version && (
            <Tag
              color={data.has_update ? 'processing' : 'success'}
              style={{ margin: 0 }}
            >
              {data.version}
            </Tag>
          )}
        </div>
        {data.has_update ? (
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            {data.published_at && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {dayjs(data.published_at).format('YYYY-MM-DD')}
              </Text>
            )}
            {data.release_note && (
              <div
                style={{
                  background: '#fff',
                  borderRadius: 6,
                  padding: '8px 12px',
                  maxHeight: 180,
                  overflow: 'auto',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: '1px solid #f0f0f0',
                }}
              >
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  skipHtml
                  components={{
                    img: () => null,
                    a: ({ href, children }) =>
                      /^https?:\/\//i.test(href || '') ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {children}
                        </a>
                      ) : (
                        <span>{children}</span>
                      ),
                  }}
                >
                  {data.release_note}
                </Markdown>
              </div>
            )}
            {data.release_url && /^https?:\/\//i.test(data.release_url) && (
              <Button
                type="link"
                size="small"
                icon={<LinkOutlined />}
                href={data.release_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: 0, height: 'auto' }}
              >
                {intl.formatMessage({ id: 'app.updateCheck.viewRelease' })}
              </Button>
            )}
          </Space>
        ) : (
          !uncertain && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {intl.formatMessage({ id: 'app.updateCheck.upToDate' })}
            </Text>
          )
        )}
      </div>
    </section>
  );
};

const UpdateCheckModal: React.FC<{
  open: boolean;
  onClose: () => void;
  update: SystemUpdateView;
}> = ({ open, onClose, update }) => {
  const intl = useIntl();
  const text = (key: string) =>
    intl.formatMessage({ id: `app.systemUpdate.${key}` });
  const [releases, setReleases] = useState<API.UpdateCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, contextHolder] = Modal.useModal();
  const confirming = useRef(false);
  const confirmation = useRef<ReturnType<typeof modal.confirm> | null>(null);
  useEffect(() => {
    if (!open) {
      confirmation.current?.destroy();
      confirming.current = false;
    }
    return () => {
      confirmation.current?.destroy();
      confirming.current = false;
    };
  }, [open]);
  const components = update.plan?.components || update.job?.components;
  const targetIdentity = components
    ?.map((component) => `${component.component}:${component.target}`)
    .join('|');
  const checking = update.state === 'checking';
  const auth = update.state === 'auth';
  useEffect(() => {
    if (!open || checking || auth) return;
    let stopped = false;
    setLoading(true);
    void checkUpdate(
      { frontend_version: FRONTEND_VERSION },
      { skipErrorHandler: true },
    )
      .then((result) => {
        if (!stopped) setReleases(result);
      })
      .catch(() => {
        if (!stopped) setReleases(null);
      })
      .finally(() => {
        if (!stopped) setLoading(false);
      });
    return () => {
      stopped = true;
    };
  }, [open, targetIdentity, checking, auth]);
  const blockers = [
    ...new Map(
      (update.plan?.blockers || update.capabilities?.blockers || []).map(
        (blocker) => [reasonKey(blocker.code), blocker],
      ),
    ).values(),
  ];
  const busy = ['checking', 'submitting', 'tracking', 'reconnecting'].includes(
    update.state,
  );
  const canExecute =
    !busy &&
    !auth &&
    update.plan?.executable &&
    update.plan.changes &&
    !blockers.length;
  const status = update.job?.status;
  const activeJob = update.job && !isTerminalJob(update.job);
  const pageOutdated =
    status === 'succeeded' &&
    update.job?.components.some(
      (component) =>
        component.component === 'web' &&
        component.action === 'update' &&
        (typeof FRONTEND_VERSION === 'undefined' ||
          FRONTEND_VERSION !== component.target),
    );
  const cardData = (
    component: 'backend' | 'web',
  ): API.UpdateCheckComponent | null => {
    const release = releases?.[component === 'web' ? 'frontend' : 'backend'];
    const planned = components?.find((item) => item.component === component);
    if (!planned) return release || null;
    const notes = matchingReleaseNotes(releases, planned);
    return {
      has_update: planned.action === 'update',
      version: planned.target,
      release_note: notes || undefined,
      release_url: planned.releaseUrl,
      published_at: notes ? release?.published_at : undefined,
    };
  };
  const backend = cardData('backend');
  const frontend = cardData('web');
  const uncertain =
    blockers.length > 0 || (!components && Boolean(update.error));
  const updateCount = [backend?.has_update, frontend?.has_update].filter(
    Boolean,
  ).length;
  const confirmUpdate = () => {
    if (confirming.current) return;
    confirming.current = true;
    confirmation.current = modal.confirm({
      title: text('title'),
      content: text('confirmDowntime'),
      okText: text('action'),
      cancelText: text('cancel'),
      onOk: () => update.submit(true),
      afterClose: () => {
        confirming.current = false;
        confirmation.current = null;
      },
    });
  };

  return (
    <Modal
      title={intl.formatMessage({ id: 'app.updateCheck.title' })}
      open={open}
      onCancel={onClose}
      width={560}
      footer={[
        <Button
          key="recheck"
          icon={<SyncOutlined />}
          onClick={update.reconnect}
          loading={checking || loading}
          disabled={busy || auth}
        >
          {intl.formatMessage({ id: 'app.updateCheck.recheck' })}
        </Button>,
        canExecute && (
          <Button key="update" type="primary" onClick={confirmUpdate}>
            {text('action')}
          </Button>
        ),
        update.state === 'submitting' && (
          <Button key="submitting" type="primary" loading disabled>
            {text('submitting')}
          </Button>
        ),
        update.pending && update.state === 'reconnecting' && (
          <Button key="retry" onClick={() => void update.submit(true)}>
            {text('retry')}
          </Button>
        ),
        status === 'succeeded' && !canExecute && pageOutdated && (
          <Button
            key="done"
            type="primary"
            onClick={() => window.location.reload()}
          >
            {text('refreshPage')}
          </Button>
        ),
        <Button
          key="close"
          type={
            updateCount && !canExecute && !pageOutdated ? 'primary' : 'default'
          }
          onClick={onClose}
        >
          {intl.formatMessage({ id: 'app.updateCheck.close' })}
        </Button>,
      ]}
    >
      {contextHolder}
      <Space
        orientation="vertical"
        size={12}
        style={{ width: '100%' }}
        aria-live="polite"
      >
        <Spin spinning={loading || checking}>
          {backend || frontend ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              {!uncertain && (
                <Alert
                  type={updateCount ? 'info' : 'success'}
                  showIcon
                  title={
                    updateCount
                      ? intl.formatMessage(
                          { id: 'app.updateCheck.newVersionAvailable' },
                          { count: updateCount },
                        )
                      : intl.formatMessage({
                          id: 'app.updateCheck.allUpToDate',
                        })
                  }
                />
              )}
              <UpdateCard
                title={intl.formatMessage({ id: 'app.updateCheck.backend' })}
                data={backend}
                uncertain={uncertain}
              />
              <UpdateCard
                title={intl.formatMessage({ id: 'app.updateCheck.frontend' })}
                data={frontend}
                uncertain={uncertain}
              />
            </Space>
          ) : loading || checking ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '32px 0',
              }}
            >
              <ExclamationCircleFilled
                style={{ fontSize: 40, color: '#faad14' }}
              />
              <Paragraph
                type="secondary"
                style={{ margin: 0, textAlign: 'center' }}
              >
                {intl.formatMessage({ id: 'app.updateCheck.failed' })}
              </Paragraph>
            </div>
          )}
        </Spin>
        {!activeJob &&
          blockers.map((blocker) => (
            <Alert
              key={reasonKey(blocker.code)}
              showIcon
              type="warning"
              title={text(reasonKey(blocker.code))}
            />
          ))}
        {update.state === 'blocked' && !blockers.length && (
          <Alert showIcon type="warning" title={text('blocked')} />
        )}
        {update.state === 'blocked' && (
          <Link href={manualUrl} target="_blank" rel="noopener noreferrer">
            {text('manual')}
          </Link>
        )}
        {update.state === 'reconnecting' && (
          <Alert
            type="info"
            showIcon
            title={text('reconnecting')}
            description={text('recoveryHelp')}
          />
        )}
        {auth && (
          <Alert
            type="error"
            showIcon
            title={text(
              update.error?.status === 403 ? 'forbidden' : 'loginExpired',
            )}
          />
        )}
        {update.error && !['auth', 'reconnecting'].includes(update.state) && (
          <Alert
            type="warning"
            showIcon
            title={text(reasonKey(update.error.code))}
          />
        )}
        {update.job && (
          <>
            <Alert
              showIcon
              type={
                status === 'succeeded'
                  ? 'success'
                  : activeJob
                    ? 'info'
                    : 'warning'
              }
              title={text(`status.${status}`)}
              description={
                activeJob ? text(`phase.${update.job.phase}`) : undefined
              }
            />
            {update.job.resultCode && status !== 'succeeded' && (
              <Text type="secondary">
                {text(reasonKey(update.job.resultCode))}
              </Text>
            )}
            {status === 'recovery_required' && (
              <Alert
                type="error"
                title={text('recoveryHelp')}
                description={
                  <Link
                    href={manualUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {text('manual')}
                  </Link>
                }
              />
            )}
            {status === 'succeeded' &&
              !canExecute &&
              pageOutdated &&
              !update.verified && (
                <Text type="secondary">{text('verifyPending')}</Text>
              )}
          </>
        )}
      </Space>
    </Modal>
  );
};

export default UpdateCheckModal;
