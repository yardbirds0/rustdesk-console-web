import { expect, test } from '@jest/globals';
import { resolvePostLoginPath } from './utils';

const state = (
  permissions: string[] = [],
  isAdmin = false,
): Parameters<typeof resolvePostLoginPath>[1] => ({
  currentUser: { is_admin: isAdmin },
  permissions: { permissions, scopes: {} },
});

test('restores only an internal route the current user can access', () => {
  expect(
    resolvePostLoginPath('/devices?name=test#list', state(['devices.view'])),
  ).toBe('/devices?name=test#list');
  expect(resolvePostLoginPath('/settings/general', state(['devices.view']))).toBe(
    '/devices',
  );
  expect(resolvePostLoginPath('//example.com', state(['devices.view']))).toBe(
    '/devices',
  );
  expect(
    resolvePostLoginPath('https://example.com', state(['devices.view'])),
  ).toBe('/devices');
});

test('chooses the first authorized management destination', () => {
  expect(resolvePostLoginPath(undefined, state([], true))).toBe('/dashboard');
  expect(
    resolvePostLoginPath(undefined, state(['users.view', 'devices.view'])),
  ).toBe('/devices');
  expect(resolvePostLoginPath(undefined, state(['users.view']))).toBe('/users');
  expect(
    resolvePostLoginPath(undefined, state(['strategies.assign'])),
  ).toBe('/strategy');
  expect(resolvePostLoginPath(undefined, state(['audit.view']))).toBe(
    '/audits/conn',
  );
  expect(resolvePostLoginPath(undefined, state(['devices.disconnect']))).toBe(
    '/audits/conn',
  );
  expect(
    resolvePostLoginPath(undefined, state(['address_books.view'])),
  ).toBe('/address-book/shared');
});

test('restores connection audit but not unrelated audits for disconnect-only users', () => {
  expect(
    resolvePostLoginPath('/audits/conn', state(['devices.disconnect'])),
  ).toBe('/audits/conn');
  expect(
    resolvePostLoginPath('/audits/file', state(['devices.disconnect'])),
  ).toBe('/audits/conn');
});

test('sends a user without management permissions to the personal address book', () => {
  expect(resolvePostLoginPath(undefined, state())).toBe(
    '/address-book/personal',
  );
  expect(resolvePostLoginPath('/', state())).toBe('/address-book/personal');
  expect(resolvePostLoginPath('/unknown', state())).toBe(
    '/address-book/personal',
  );
  expect(resolvePostLoginPath('/address-book/shared', state())).toBe(
    '/address-book/shared',
  );
});
