import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import {
  act,
  cleanup,
  fireEvent,
  render,
  within,
} from '@testing-library/react';
import { request } from '@umijs/max';
import { checkUpdate } from '@/services/rustdesk-console/system';
import React from 'react';
import en from '@/locales/en-US/pwa';
import zh from '@/locales/zh-CN/pwa';
import fr from '@/locales/fr-FR/pwa';
import pt from '@/locales/pt-BR/pwa';
import ru from '@/locales/ru-RU/pwa';
import {
  capability,
  installationId,
  job,
  jobId,
  plan,
} from '@/services/rustdesk-console/systemUpdate.testFixtures';
import { useSystemUpdate } from './useSystemUpdate';
import UpdateCheckModal from './index';

let mockLocale: Record<string, string> = en;
let mockLocaleName = 'en-US';
jest.mock('@umijs/max', () => ({
  request: jest.fn(),
  history: { push: jest.fn() },
  useIntl: () => ({
    locale: mockLocaleName,
    formatMessage: ({ id }: { id: string }) => mockLocale[id] || id,
  }),
  getIntl: () => ({
    formatMessage: ({ defaultMessage }: { defaultMessage: string }) =>
      defaultMessage,
  }),
}));
jest.mock('@/services/rustdesk-console/system', () => ({
  checkUpdate: jest.fn(),
}));
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: any) => children,
}));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));
jest.mock('antd', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Box = ({ children }: any) => R.createElement('div', null, children);
  const Modal = ({ open, title, children, footer, onCancel }: any) =>
    open
      ? R.createElement(
          'div',
          { role: 'dialog' },
          R.createElement('h2', null, title),
          R.createElement(
            'button',
            { onClick: onCancel, 'aria-label': 'Close dialog' },
            '×',
          ),
          children,
          footer,
        )
      : null;
  Modal.useModal = () => {
    const [confirmation, setConfirmation] = R.useState<any>(null);
    const close = () => {
      setConfirmation(null);
      confirmation?.afterClose?.();
    };
    return [
      {
        confirm: (props: any) => {
          setConfirmation(props);
          return { destroy: () => setConfirmation(null) };
        },
      },
      confirmation &&
        R.createElement(
          'div',
          { role: 'alertdialog' },
          R.createElement('p', null, confirmation.content),
          R.createElement(
            'button',
            {
              onClick: () => {
                confirmation.onCancel?.();
                close();
              },
            },
            confirmation.cancelText,
          ),
          R.createElement(
            'button',
            {
              onClick: async () => {
                await confirmation.onOk();
                close();
              },
            },
            confirmation.okText,
          ),
        ),
    ];
  };
  return {
    Modal,
    Space: Box,
    Spin: Box,
    Tag: Box,
    Skeleton: Box,
    Typography: {
      Text: Box,
      Paragraph: Box,
      Link: ({ children, href }: any) =>
        R.createElement('a', { href }, children),
    },
    Alert: ({ title, description }: any) =>
      R.createElement(
        'div',
        { role: 'status' },
        R.createElement('strong', null, title),
        R.createElement('div', null, description),
      ),
    Button: ({ children, disabled, onClick, href }: any) =>
      href
        ? R.createElement('a', { href }, children)
        : R.createElement(
            'button',
            { disabled, onClick, type: 'button' },
            children,
          ),
    message: { error: jest.fn() },
    notification: { open: jest.fn() },
  };
});
function TestModal({
  open,
  onClose = jest.fn(),
}: {
  open: boolean;
  onClose?: () => void;
}) {
  const update = useSystemUpdate(open);
  return React.createElement(UpdateCheckModal, { open, onClose, update });
}

const requestMock =
  jest.mocked<(url: string, options?: { data?: any }) => Promise<unknown>>(
    request,
  );
let nextPlan = plan();
let nextCapability = capability();
let current: import('@/services/rustdesk-console/systemUpdate').JobView | null =
  null;
beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  current = null;
  nextPlan = plan();
  nextCapability = capability();
  mockLocale = en;
  mockLocaleName = 'en-US';
  Object.defineProperty(globalThis, 'FRONTEND_VERSION', {
    value: '1.6.0',
    configurable: true,
  });
  jest.mocked(checkUpdate).mockResolvedValue({
    backend: { has_update: false },
    frontend: { has_update: false },
  });
  requestMock.mockImplementation(async (url) => {
    if (url.endsWith('/capabilities')) return nextCapability;
    if (url.endsWith('/jobs/current')) return { installationId, job: current };
    if (url.endsWith('/plans')) return nextPlan;
    if (url.endsWith('/jobs'))
      return {
        jobId,
        statusUrl: `/api/system-update/jobs/${jobId}`,
        job: job(),
      };
    if (url.includes('/jobs/')) return job();
    if (url === '/system-update-health.json')
      return {
        component: 'web',
        version: current?.components.find(
          (component) => component.component === 'web',
        )?.target,
        sourceCommit: 'a'.repeat(40),
        ready: true,
        maintenanceProtocol: 1,
      };
    return {};
  });
});
afterEach(cleanup);
const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
};
const submissions = () =>
  requestMock.mock.calls.filter((call) => call[0].endsWith('/jobs'));

test.each([
  ['managed-compose', 'sqlite'],
  ['managed-compose', 'mysql'],
  ['managed-linux', 'sqlite'],
  ['managed-linux', 'mysql'],
] as const)(
  'one update button for %s / %s; nothing submitted before confirmation',
  async (deployment, database) => {
    nextCapability = capability({ deployment, database });
    nextPlan = plan({
      backup: { database, method: database, includesBusinessFiles: true },
    });
    const view = render(React.createElement(TestModal, { open: true }));
    await settle();
    expect(
      view.getAllByRole('button', { name: en['app.systemUpdate.action'] }),
    ).toHaveLength(1);
    expect(
      view
        .getByRole('button', { name: en['app.systemUpdate.action'] })
        .hasAttribute('disabled'),
    ).toBe(false);
    expect(view.queryByRole('checkbox')).toBeNull();
    expect(view.getAllByRole('link')).toHaveLength(2);
    expect(view.queryByRole('alertdialog')).toBeNull();
    expect(submissions()).toHaveLength(0);
    expect(view.getAllByText(nextPlan.components[0].target)).toHaveLength(2);
    fireEvent.click(
      view.getByRole('button', { name: en['app.systemUpdate.action'] }),
    );
    expect(view.getByRole('alertdialog')).toBeTruthy();
    expect(view.getByText(en['app.systemUpdate.confirmDowntime'])).toBeTruthy();
    expect(submissions()).toHaveLength(0);
    fireEvent.click(
      view.getByRole('button', { name: en['app.systemUpdate.cancel'] }),
    );
    await settle();
    expect(submissions()).toHaveLength(0);
    fireEvent.click(
      view.getByRole('button', { name: en['app.systemUpdate.action'] }),
    );
    const confirm = within(view.getByRole('alertdialog')).getByRole('button', {
      name: en['app.systemUpdate.action'],
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await settle();
    expect(submissions()).toHaveLength(1);
    expect(submissions()[0][1]?.data.acknowledgeDowntime).toBe(true);
  },
);

test('double click opens one confirmation; cancelling does not submit', async () => {
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  const button = view.getByRole('button', {
    name: en['app.systemUpdate.action'],
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(view.getAllByRole('alertdialog')).toHaveLength(1);
  fireEvent.click(
    view.getByRole('button', { name: en['app.systemUpdate.cancel'] }),
  );
  await settle();
  expect(submissions()).toHaveLength(0);
});

test('official update dialog keeps its controls and adds one Update action without a duplicate section', async () => {
  const view = render(
    React.createElement(TestModal, { open: true, onClose: jest.fn() }),
  );
  await settle();
  expect(
    view.getByRole('heading', { name: en['app.updateCheck.title'] }),
  ).toBeTruthy();
  expect(view.getAllByRole('button')).toHaveLength(4);
  expect(
    view.getByRole('button', { name: en['app.updateCheck.recheck'] }),
  ).toBeTruthy();
  expect(
    view.getByRole('button', { name: en['app.updateCheck.close'] }),
  ).toBeTruthy();
  expect(view.getByRole('button', { name: 'Update' })).toBeTruthy();
  expect(
    view.queryByText(/manual release|preview|backup process|local build/i),
  ).toBeNull();
  expect(jest.mocked(checkUpdate)).toHaveBeenCalledTimes(1);
  fireEvent.click(
    view.getByRole('button', { name: en['app.updateCheck.recheck'] }),
  );
  await settle();
  expect(jest.mocked(checkUpdate)).toHaveBeenCalledTimes(2);
  expect(submissions()).toHaveLength(0);
});

test.each(['backend', 'web'] as const)(
  'one-sided %s update shows one version for the unchanged component',
  async (changed) => {
    nextPlan = plan({}, changed === 'backend' ? 'backendOnly' : 'webOnly');
    const view = render(React.createElement(TestModal, { open: true }));
    await settle();
    expect(
      view.getAllByRole('button', { name: en['app.systemUpdate.action'] }),
    ).toHaveLength(1);
    const unchanged = nextPlan.components.find(
      (component) => component.action === 'unchanged',
    );
    expect(unchanged).toBeDefined();
    const region = view.getByRole('region', {
      name: en[
        `app.updateCheck.${unchanged?.component === 'web' ? 'frontend' : 'backend'}`
      ],
    });
    expect(within(region).getByText(unchanged?.current || '')).toBeTruthy();
    expect(within(region).queryByText('→')).toBeNull();
  },
);

test('no changes and blocked releases cannot submit', async () => {
  nextPlan = plan({}, 'noUpdates');
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(
    view.queryByRole('button', { name: en['app.systemUpdate.action'] }),
  ).toBeNull();
  expect(view.getByText(en['app.updateCheck.allUpToDate'])).toBeTruthy();
  view.unmount();
  nextPlan = plan({}, 'blocked');
  const blocked = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(
    blocked.queryByRole('button', { name: en['app.systemUpdate.action'] }),
  ).toBeNull();
  expect(blocked.getByText(en['app.systemUpdate.releaseBlocked'])).toBeTruthy();
});

test('a release-source failure cannot label unchanged fallback targets as up to date', async () => {
  nextPlan = plan(
    {
      blockers: [
        {
          code: 'RELEASE_UNAVAILABLE',
          message: 'Release source could not be read.',
        },
      ],
    },
    'noUpdates',
  );
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.queryByText(en['app.updateCheck.upToDate'])).toBeNull();
  expect(view.queryByText(en['app.updateCheck.allUpToDate'])).toBeNull();
  expect(view.getByText(en['app.systemUpdate.releaseBlocked'])).toBeTruthy();
  expect(
    view.queryByRole('button', { name: en['app.systemUpdate.action'] }),
  ).toBeNull();
});

test('a missing capability endpoint shows the real request error without a legacy guide', async () => {
  requestMock.mockRejectedValue({ response: { status: 404 } });
  const view = render(
    React.createElement(TestModal, { open: true, onClose: jest.fn() }),
  );
  await settle();
  expect(view.getByText(en['app.systemUpdate.requestFailed'])).toBeTruthy();
  expect(
    view.queryByRole('link', { name: en['app.systemUpdate.manual'] }),
  ).toBeNull();
  expect(view.queryByText(en['app.updateCheck.allUpToDate'])).toBeNull();
  expect(view.queryByRole('button', { name: 'Update' })).toBeNull();
  expect(jest.mocked(checkUpdate)).toHaveBeenCalledTimes(1);
});

test.each([en, zh, fr, pt, ru])(
  'selected locale covers every visible confirmation string',
  async (locale) => {
    mockLocale = locale;
    mockLocaleName =
      locale === zh
        ? 'zh-CN'
        : locale === fr
          ? 'fr-FR'
          : locale === pt
            ? 'pt-BR'
            : locale === ru
              ? 'ru-RU'
              : 'en-US';
    const view = render(
      React.createElement(TestModal, { open: true, onClose: jest.fn() }),
    );
    await settle();
    expect(view.getByText(locale['app.updateCheck.backend'])).toBeTruthy();
    expect(view.getByText(locale['app.updateCheck.frontend'])).toBeTruthy();
    fireEvent.click(
      view.getByRole('button', { name: locale['app.systemUpdate.action'] }),
    );
    expect(
      view.getByText(locale['app.systemUpdate.confirmDowntime']),
    ).toBeTruthy();
    expect(
      view.getByRole('button', { name: locale['app.systemUpdate.cancel'] }),
    ).toBeTruthy();
    expect(
      view.queryByText(/Console|本地独立|本地构建|SQLite|MySQL/),
    ).toBeNull();
  },
);

test('official component cards show matching published notes and localized release links', async () => {
  mockLocale = zh;
  mockLocaleName = 'zh-CN';
  const backend = nextPlan.components.find(
    (component) => component.component === 'backend',
  );
  const web = nextPlan.components.find(
    (component) => component.component === 'web',
  );
  if (!backend || !web) throw new Error('Missing component fixture');
  jest.mocked(checkUpdate).mockResolvedValue({
    backend: {
      has_update: true,
      version: backend.target,
      release_url: `https://github.com/databk/rustdesk-console/releases/tag/v${backend.target}`,
      release_note: '后端更新内容',
    },
    frontend: {
      has_update: true,
      version: web.target,
      release_url: `https://github.com/databk/rustdesk-console-web/releases/tag/v${web.target}`,
      release_note: '前端更新内容',
    },
  });
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.getAllByRole('region')).toHaveLength(2);
  expect(
    view.getAllByRole('link', { name: zh['app.updateCheck.viewRelease'] }),
  ).toHaveLength(2);
  expect(view.getByText('后端更新内容')).toBeTruthy();
  expect(view.getByText('前端更新内容')).toBeTruthy();
  expect(
    view.getAllByRole('button', { name: zh['app.systemUpdate.action'] }),
  ).toHaveLength(1);
});

test('stale release metadata is an empty note state and cannot hide the update action', async () => {
  jest.mocked(checkUpdate).mockResolvedValue({
    backend: {
      has_update: true,
      version: '999.0.0',
      release_url:
        'https://github.com/databk/rustdesk-console/releases/tag/v999.0.0',
      release_note: 'Unrelated old content',
    },
    frontend: { has_update: false },
  });
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.queryByText('Unrelated old content')).toBeNull();
  expect(
    view.getByRole('button', { name: en['app.systemUpdate.action'] }),
  ).toBeTruthy();
});

test('raw English blockers, failures and recovery guidance never enter the Chinese window', async () => {
  mockLocale = zh;
  nextCapability = capability({
    ready: false,
    blockers: [
      { code: 'DISK_SPACE', message: 'Database backup requires 128 MiB.' },
    ],
  });
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.getByText(zh['app.systemUpdate.backupBlocked'])).toBeTruthy();
  expect(view.queryByText(/Database|128 MiB/)).toBeNull();
  view.unmount();
  nextCapability = capability();
  current = job({
    status: 'recovery_required',
    resultCode: 'RESTORE_FAILED',
    safeMessage: 'Recovery failed.',
    recoveryGuidance: 'Inspect the protected host journal.',
  });
  const recovery = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(
    recovery.getByText(zh['app.systemUpdate.status.recovery_required']),
  ).toBeTruthy();
  expect(
    recovery.queryByText(/Recovery failed|Inspect the protected/),
  ).toBeNull();
  expect(
    recovery.queryByRole('button', { name: zh['app.systemUpdate.action'] }),
  ).toBeNull();
});

test('missing update service explains the blocker without creating a plan', async () => {
  nextCapability = capability({}, 'helperMissing');
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.getByText(en['app.systemUpdate.helperUnavailable'])).toBeTruthy();
  expect(view.queryByText(nextCapability.blockers[0].message)).toBeNull();
  expect(
    requestMock.mock.calls.some((call) => call[0].endsWith('/plans')),
  ).toBe(false);
});

test('active job retains the real phase and has no extra actions', async () => {
  nextCapability = capability({}, 'activeJob');
  current = job({ phase: 'switching' });
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.getByText(en['app.systemUpdate.status.running'])).toBeTruthy();
  expect(view.getByText(en['app.systemUpdate.phase.switching'])).toBeTruthy();
  expect(
    view.queryByRole('button', { name: en['app.systemUpdate.action'] }),
  ).toBeNull();
  expect(
    requestMock.mock.calls.some((call) => call[0].endsWith('/plans')),
  ).toBe(false);
});

test('a finished job does not hide a newly available update', async () => {
  current = job({
    status: 'failed',
    resultCode: 'HELPER_VERIFY_FAILED',
    safeMessage: 'The updated helper did not become ready.',
  });
  const view = render(React.createElement(TestModal, { open: true }));
  await settle();
  expect(view.getByText(en['app.systemUpdate.status.failed'])).toBeTruthy();
  expect(
    view.getByText(en['app.systemUpdate.internalUpdateFailed']),
  ).toBeTruthy();
  expect(view.queryByText(current.safeMessage)).toBeNull();
  expect(view.getByRole('button', { name: 'Update' })).toBeTruthy();
});

test('all five locales contain the complete update vocabulary', () => {
  const keys = Object.keys(en)
    .filter((key) => key.startsWith('app.systemUpdate.'))
    .sort();
  for (const locale of [zh, fr, pt, ru]) {
    expect(
      Object.keys(locale)
        .filter((key) => key.startsWith('app.systemUpdate.'))
        .sort(),
    ).toEqual(keys);
    for (const key of keys)
      expect((locale as Record<string, string>)[key]).not.toBe('');
  }
});
