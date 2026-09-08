import { InfoCircleOutlined } from '@ant-design/icons';
import { Space, Tag, Tooltip } from 'antd';
import type { DataNode } from 'antd/es/tree';
import React from 'react';

export const PROTECTED_ACCOUNT_KEY = 'builtin.protected-account';
const SYSTEM_CAPABILITY_KEY_PREFIX = 'builtin.system-capability:';

export const getSystemCapabilityTreeKey = (capability: string): string =>
  `${SYSTEM_CAPABILITY_KEY_PREFIX}${capability}`;

export type RoleTreeMessage = {
  id: string;
  defaultMessage: string;
};

export type RoleTreeFormatter = (message: RoleTreeMessage) => string;

export const getAssignablePermissionCodes = (
  catalog: API.PermissionItem[],
): Set<string> =>
  new Set(
    catalog
      .filter((permission) => permission.assignable)
      .map((permission) => permission.code),
  );

export const getAssignablePermissionPayload = (
  selectedKeys: string[],
  catalog: API.PermissionItem[],
): string[] => {
  const assignable = getAssignablePermissionCodes(catalog);
  return selectedKeys.filter((key) => assignable.has(key));
};

export function buildRolePermissionTreeData(
  catalog: API.PermissionItem[],
  formatMessage: RoleTreeFormatter,
  options: {
    includeBuiltInRows?: boolean;
    systemCapabilities?: readonly string[];
  } = {},
): DataNode[] {
  const grouped = new Map<string, API.PermissionItem[]>();
  for (const permission of catalog) {
    const values = grouped.get(permission.resource) || [];
    values.push(permission);
    grouped.set(permission.resource, values);
  }

  if (options.includeBuiltInRows && !grouped.has('address_books')) {
    grouped.set('address_books', []);
  }

  const treeData = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([resource, values]) => {
      const children: DataNode[] = [...values]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((permission) => {
          const assignable = permission.assignable;
          const label = formatMessage({
            id: `pages.roles.permission.${permission.code}`,
            defaultMessage: permission.name,
          });
          return {
            key: permission.code,
            title: assignable ? (
              label
            ) : (
              <Space size={6}>
                <span>{label}</span>
                <Tag>
                  {formatMessage({
                    id: 'pages.roles.ownerOnly',
                    defaultMessage: 'Super administrator only',
                  })}
                </Tag>
              </Space>
            ),
            disabled: !assignable,
            disableCheckbox: !assignable,
          };
        });

      if (options.includeBuiltInRows && resource === 'users') {
        children.push({
          key: PROTECTED_ACCOUNT_KEY,
          title: (
            <Space size={6}>
              {formatMessage({
                id: 'pages.roles.protectedAccount',
                defaultMessage: 'Protected accounts',
              })}
              <Tooltip
                title={formatMessage({
                  id: 'pages.roles.protectedAccountInfo',
                  defaultMessage:
                    'Members cannot be managed by anyone except the super administrator.',
                })}
              >
                <InfoCircleOutlined />
              </Tooltip>
            </Space>
          ),
        });
      }
      if (options.includeBuiltInRows && resource === 'address_books') {
        children.unshift({
          key: 'builtin.personal-address-book',
          title: (
            <Space size={6}>
              {formatMessage({
                id: 'pages.roles.personalAddressBook',
                defaultMessage: 'Personal address book',
              })}
              <Tag>
                {formatMessage({
                  id: 'pages.roles.basicFunction',
                  defaultMessage: 'Basic feature',
                })}
              </Tag>
            </Space>
          ),
          disableCheckbox: true,
        });
      }

      return {
        key: `resource:${resource}`,
        title: formatMessage({
          id: `pages.roles.resource.${resource}`,
          defaultMessage: resource,
        }),
        children,
      };
    });

  if (options.systemCapabilities?.length) {
    treeData.push({
      key: 'resource:system',
      title: formatMessage({
        id: 'pages.roles.resource.system',
        defaultMessage: 'System capabilities',
      }),
      children: options.systemCapabilities.map((capability) => ({
        key: getSystemCapabilityTreeKey(capability),
        title: (
          <Space size={6}>
            <span>
              {formatMessage({
                id: `pages.users.systemCapability.${capability}`,
                defaultMessage: capability,
              })}
            </span>
            <Tag>
              {formatMessage({
                id: 'pages.roles.ownerOnly',
                defaultMessage: 'Super administrator only',
              })}
            </Tag>
          </Space>
        ),
        disabled: true,
        disableCheckbox: true,
      })),
    });
  }

  return treeData;
}
