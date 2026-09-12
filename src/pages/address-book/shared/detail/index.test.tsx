import { afterEach, expect, jest, test } from '@jest/globals';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { getWebSharedAddressBook } from '@/services/rustdesk-console/addressBook';
import SharedAddressBookDetail from './index';

const mockNavigate = jest.fn();
const mockReact = require('react');

jest.mock('@umijs/max', () => ({
  FormattedMessage: ({ defaultMessage }: { defaultMessage: string }) =>
    defaultMessage,
  useNavigate: () => mockNavigate,
  useParams: () => ({ guid: 'shared-book' }),
}));
jest.mock('@/services/rustdesk-console/addressBook', () => ({
  getWebSharedAddressBook: jest.fn(),
}));
jest.mock('@/pages/address-book/personal', () => ({
  __esModule: true,
  default: ({ canWrite }: { canWrite: boolean }) =>
    mockReact.createElement(
      'div',
      { 'data-testid': 'personal-address-book' },
      canWrite ? 'writable' : 'read-only',
    ),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test('uses server ACL rule for shared content writes without RBAC permissions', async () => {
  jest.mocked(getWebSharedAddressBook).mockResolvedValue({
    guid: 'shared-book',
    name: 'Shared book',
    rule: 2,
  });

  render(React.createElement(SharedAddressBookDetail));

  await waitFor(() =>
    expect(screen.getByTestId('personal-address-book').textContent).toBe(
      'writable',
    ),
  );
  expect(getWebSharedAddressBook).toHaveBeenCalledWith('shared-book');
});
