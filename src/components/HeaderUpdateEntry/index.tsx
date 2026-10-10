import { InfoCircleOutlined } from '@ant-design/icons';
import { useAccess, useIntl } from '@umijs/max';
import { Tooltip } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import UpdateCheckModal from '@/components/UpdateCheckModal';
import { useSystemUpdate } from '@/components/UpdateCheckModal/useSystemUpdate';
import {
  isTerminalJob,
  readSavedUpdate,
} from '@/services/rustdesk-console/systemUpdate';
import { getToken } from '@/utils/auth';

export default function HeaderUpdateEntry() {
  const access = useAccess();
  const intl = useIntl();
  const [modalOpen, setModalOpen] = useState(false);
  const autoChecked = useRef(false);
  const enabled = access.isSuperAdmin && Boolean(getToken());
  // One read-only controller powers the header and dialog. Checking never submits a job.
  const update = useSystemUpdate(enabled);

  useEffect(() => {
    if (autoChecked.current || !enabled || update.state === 'checking') return;
    autoChecked.current = true;
    if (
      readSavedUpdate()?.submission ||
      (update.job && !isTerminalJob(update.job))
    )
      setModalOpen(true);
  }, [enabled, update.state, update.job]);

  if (!access.isSuperAdmin) return null;
  const active = Boolean(
    update.job &&
      (update.job.status === 'queued' || update.job.status === 'running'),
  );
  const available = Boolean(
    update.plan?.executable &&
      update.plan.changes &&
      !update.plan.blockers.length &&
      !active &&
      (update.state === 'preview' || update.state === 'terminal'),
  );
  const checking = update.state === 'checking';
  const label = intl.formatMessage({
    id: `app.systemUpdate.${checking ? 'checkingUpdates' : available ? 'available' : 'check'}`,
  });
  const open = () => {
    setModalOpen(true);
    if (
      !['checking', 'submitting', 'tracking', 'reconnecting'].includes(
        update.state,
      )
    )
      update.reconnect();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Tooltip title={label}>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="dialog"
          aria-busy={checking}
          onClick={open}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: 0,
            padding: 4,
            border: 0,
            background: 'transparent',
            font: 'inherit',
            fontSize: 18,
            lineHeight: 1,
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              width: 18,
              height: 18,
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {available ? (
              <svg
                aria-hidden="true"
                data-icon="upgrade"
                width="18"
                height="18"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="12" r="12" fill="#00c800" />
                <path d="M12 6L18 12H14V18H10V12H6Z" fill="#fff" />
              </svg>
            ) : (
              <InfoCircleOutlined
                aria-hidden
                style={{ fontSize: 18, color: 'inherit' }}
              />
            )}
          </span>
        </button>
      </Tooltip>
      <UpdateCheckModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        update={update}
      />
    </div>
  );
}
