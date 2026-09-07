import { expect, test } from '@jest/globals';
import {
  addRequiredPermissions,
  removeDependentPermissions,
} from './permissionDependencies';

const catalog = [
  { code: 'users.view', requires: [] },
  { code: 'users.edit', requires: ['users.view'] },
  { code: 'users.security', requires: ['users.edit'] },
  { code: 'strategies.assign' },
] as API.PermissionItem[];

test('selecting a write permission adds all catalog prerequisites', () => {
  expect(addRequiredPermissions(['users.security'], catalog)).toEqual([
    'users.security',
    'users.edit',
    'users.view',
  ]);
});

test('removing a prerequisite removes all dependent permissions', () => {
  expect(
    removeDependentPermissions(
      ['users.view', 'users.edit', 'users.security', 'strategies.assign'],
      'users.view',
      catalog,
    ),
  ).toEqual(['strategies.assign']);
});

test('a permission without requirements remains independent', () => {
  expect(addRequiredPermissions(['strategies.assign'], catalog)).toEqual([
    'strategies.assign',
  ]);
});
