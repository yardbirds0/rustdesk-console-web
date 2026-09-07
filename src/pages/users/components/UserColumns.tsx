import type { ProColumns } from '@ant-design/pro-components';
import { FormattedMessage, useIntl } from '@umijs/max';
import { Button, Divider, Popconfirm, Space } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  LogoutOutlined,
  SafetyOutlined,
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import React from 'react';
import { getUserColumns } from '@/components/UserSelectTable/columns';
import { formatUserRoleNames } from './userRoleAssignment';

interface UseUserColumnsOptions {
  userGroupGuid?: string;
  isSuperAdmin: boolean;
  canEdit: boolean;
  canSecurity: boolean;
  canForceLogout: boolean;
  canDelete: boolean;
  canMove: boolean;
  onEdit: (record: API.UserItem) => void;
  onRoles: (record: API.UserItem) => void;
  onSecurity: (record: API.UserItem) => void;
  onForceLogout: (guid: string) => void;
  onDelete: (guid: string) => void;
  onMove: (record: API.UserItem) => void;
}

export const useUserColumns = (
  options: UseUserColumnsOptions,
): ProColumns<API.UserItem>[] => {
  const intl = useIntl();
  const {
    userGroupGuid,
    isSuperAdmin,
    canEdit,
    canSecurity,
    canForceLogout,
    canDelete,
    canMove,
    onEdit,
    onRoles,
    onSecurity,
    onForceLogout,
    onDelete,
    onMove,
  } = options;

  const baseColumns = getUserColumns();

  const actionColumn: ProColumns<API.UserItem> = {
    title: (
      <FormattedMessage id="pages.common.action" defaultMessage="Action" />
    ),
    valueType: 'option',
    width: 220,
    fixed: 'right',
    hideInTable: userGroupGuid
      ? !canMove
      : !isSuperAdmin &&
        !canEdit &&
        !canSecurity &&
        !canForceLogout &&
        !canDelete,
    render: (_: unknown, record: API.UserItem) =>
      userGroupGuid ? (
        canMove ? (
          <Button
            type="link"
            size="small"
            icon={<SwapOutlined />}
            onClick={() => onMove(record)}
          >
            <FormattedMessage
              id="pages.userGroups.move"
              defaultMessage="Move"
            />
          </Button>
        ) : null
      ) : (
        <Space size={0} split={<Divider type="vertical" />}>
          {canEdit && (isSuperAdmin || !record.is_admin) && (
            <Button
              key="edit"
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => onEdit(record)}
            >
              <FormattedMessage id="pages.common.edit" defaultMessage="Edit" />
            </Button>
          )}
          {isSuperAdmin && (
            <Button
              key="roles"
              type="link"
              size="small"
              icon={<TeamOutlined />}
              onClick={() => onRoles(record)}
            >
              <FormattedMessage id="pages.users.roles" defaultMessage="Roles" />
            </Button>
          )}
          {canSecurity && (isSuperAdmin || !record.is_admin) && (
            <Button
              key="security"
              type="link"
              size="small"
              icon={<SafetyOutlined />}
              onClick={() => onSecurity(record)}
            >
              <FormattedMessage
                id="pages.users.security"
                defaultMessage="Security"
              />
            </Button>
          )}
          {canForceLogout && (isSuperAdmin || !record.is_admin) && (
            <Button
              key="logout"
              type="link"
              size="small"
              icon={<LogoutOutlined />}
              onClick={() => onForceLogout(record.guid)}
            >
              <FormattedMessage
                id="pages.users.forceLogout"
                defaultMessage="Logout"
              />
            </Button>
          )}
          {canDelete && (isSuperAdmin || !record.is_admin) && (
            <Popconfirm
              key="delete"
              title={
                <FormattedMessage
                  id="pages.users.deleteConfirm"
                  defaultMessage="Are you sure to delete this user?"
                />
              }
              onConfirm={() => onDelete(record.guid)}
              okText={intl.formatMessage({
                id: 'pages.common.confirm',
                defaultMessage: 'Yes',
              })}
              cancelText={intl.formatMessage({
                id: 'pages.common.cancel',
                defaultMessage: 'No',
              })}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                <FormattedMessage
                  id="pages.common.delete"
                  defaultMessage="Delete"
                />
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
  };

  const roleColumn: ProColumns<API.UserItem> = {
    title: <FormattedMessage id="pages.users.roles" defaultMessage="Roles" />,
    dataIndex: 'role_names',
    width: 180,
    search: false,
    ellipsis: true,
    render: (_: unknown, record) =>
      formatUserRoleNames(
        record,
        intl.formatMessage({
          id: 'pages.users.superAdmin',
          defaultMessage: 'Super administrator',
        }),
      ),
  };

  return [...baseColumns, ...(isSuperAdmin ? [roleColumn] : []), actionColumn];
};
