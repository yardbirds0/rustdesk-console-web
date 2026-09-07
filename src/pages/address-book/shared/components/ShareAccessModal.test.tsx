import React from 'react';
import { App } from 'antd';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, expect, jest, test } from '@jest/globals';
import ShareAccessModal from './ShareAccessModal';
import {
  addRule,
  deleteRules,
  getAddressBookShareCandidates,
  getAllRules,
  updateRule,
} from '@/services/rustdesk-console/addressBook';

jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) =>
    defaultMessage,
  useIntl: () => ({
    formatMessage: (
      { defaultMessage }: { defaultMessage: string },
      values?: Record<string, string>,
    ) =>
      values?.name
        ? defaultMessage.replace('{name}', values.name)
        : defaultMessage,
  }),
}));
jest.mock('@/services/rustdesk-console/addressBook', () => ({
  addRule: jest.fn(),
  deleteRules: jest.fn(),
  getAddressBookShareCandidates: jest.fn(),
  getAllRules: jest.fn(),
  updateRule: jest.fn(),
}));

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
  const getComputedStyle = window.getComputedStyle.bind(window);
  jest
    .spyOn(window, 'getComputedStyle')
    .mockImplementation((element) => getComputedStyle(element));
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('read-only sharing settings load rules without candidates or mutations', async () => {
  jest.mocked(getAllRules).mockResolvedValue([
    {
      guid: 'rule-guid',
      addressBook: { guid: 'book-guid' },
      rule: 1,
      ruleType: 'everyone',
    },
  ]);

  render(
    React.createElement(
      App,
      null,
      React.createElement(ShareAccessModal, {
        open: true,
        mode: 'view',
        addressBook: { guid: 'book-guid', name: 'Shared book', rule: 1 },
        onOpenChange: jest.fn(),
      }),
    ),
  );

  await waitFor(() => expect(getAllRules).toHaveBeenCalledWith('book-guid'));
  expect(getAddressBookShareCandidates).not.toHaveBeenCalled();
  expect(screen.queryByText('Add access')).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  await waitFor(() => expect(screen.getByText('Read only')).not.toBeNull());
  expect(addRule).not.toHaveBeenCalled();
  expect(updateRule).not.toHaveBeenCalled();
  expect(deleteRules).not.toHaveBeenCalled();
});
