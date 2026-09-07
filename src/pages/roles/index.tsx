import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { FormattedMessage, useAccess, useIntl } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Tree,
} from 'antd';
import React, { useMemo, useRef, useState } from 'react';
import { getPermissionList } from '@/services/rustdesk-console/permission';
import {
  createRole,
  deleteRole,
  getRoleDetail,
  getRoleList,
  getRoleProtectionImpact,
  updateRole,
} from '@/services/rustdesk-console/role';
import { getRequestErrorMessage } from '@/utils/requestError';
import {
  addRequiredPermissions,
  removeDependentPermissions,
} from './permissionDependencies';
import {
  buildRolePermissionTreeData,
  getAssignablePermissionCodes,
  PROTECTED_ACCOUNT_KEY,
} from './permissionTree';
import type { RolePermissionPresetSelection } from './rbacPresentation';
import {
  applyRolePermissionPreset,
  CUSTOM_ROLE_PERMISSION_PRESET_KEY,
  getMatchingRolePermissionPreset,
  PERSONAL_ADDRESS_BOOK_KEY,
  presetEnablesProtection,
  ROLE_PERMISSION_PRESETS,
} from './rbacPresentation';

const RoleList: React.FC = () => {
  const intl = useIntl();
  const { message: msgApi } = App.useApp();
  const access = useAccess();
  const isOwner = access.isSuperAdmin;
  const actionRef = useRef<ActionType>(null);
  const [form] = Form.useForm<API.CreateRoleParams>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<API.RoleItem | null>(null);
  const [readOnlyModal, setReadOnlyModal] = useState(false);
  const [catalog, setCatalog] = useState<API.PermissionItem[]>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [protectedAccount, setProtectedAccount] = useState(false);
  const [roleMemberCount, setRoleMemberCount] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [systemIdentity, setSystemIdentity] = useState<
    'ordinary' | 'superAdmin' | null
  >(null);
  const [saving, setSaving] = useState(false);
  const detailRequestRef = useRef(0);

  const loadCatalog = async () => {
    if (catalog.length > 0) return catalog;
    setCatalogLoading(true);
    try {
      const response = await getPermissionList();
      const items = response.data;
      setCatalog(items);
      return items;
    } catch (error) {
      msgApi.error(
        getRequestErrorMessage(
          error,
          intl.formatMessage({
            id: 'pages.roles.permissionsLoadFailed',
            defaultMessage: 'Failed to load the permission catalog',
          }),
        ),
      );
      return [];
    } finally {
      setCatalogLoading(false);
    }
  };

  const permissionCodes = useMemo(
    () => getAssignablePermissionCodes(catalog),
    [catalog],
  );
  const selectedPreset = useMemo(
    () =>
      getMatchingRolePermissionPreset(checkedKeys, catalog, protectedAccount),
    [catalog, checkedKeys, protectedAccount],
  );

  const treeData = useMemo(
    () =>
      buildRolePermissionTreeData(
        catalog,
        (message) => intl.formatMessage(message),
        {
          includeBuiltInRows: true,
        },
      ),
    [catalog, intl],
  );

  const closeModal = () => {
    detailRequestRef.current += 1;
    setModalOpen(false);
    setEditingRole(null);
    setReadOnlyModal(false);
    setCheckedKeys([]);
    setProtectedAccount(false);
    setRoleMemberCount(0);
    setDetailLoading(false);
    form.resetFields();
  };

  const openSystemIdentity = (identity: 'ordinary' | 'superAdmin') => {
    setSystemIdentity(identity);
    if (identity === 'superAdmin') void loadCatalog();
  };

  const closeSystemIdentity = () => setSystemIdentity(null);

  const openCreate = () => {
    detailRequestRef.current += 1;
    setEditingRole(null);
    setReadOnlyModal(false);
    setProtectedAccount(false);
    setRoleMemberCount(0);
    setCheckedKeys([]);
    setDetailLoading(false);
    form.resetFields();
    setModalOpen(true);
    void loadCatalog();
  };

  const openEdit = async (record: API.RoleItem, readOnly = false) => {
    const requestId = ++detailRequestRef.current;
    setEditingRole(record);
    setReadOnlyModal(readOnly);
    setModalOpen(true);
    setDetailLoading(true);
    const loadedCatalog = await loadCatalog();
    if (requestId !== detailRequestRef.current) return;
    try {
      const detail = await getRoleDetail(record.guid);
      if (requestId !== detailRequestRef.current) return;
      form.setFieldsValue({ name: detail.name, note: detail.note || '' });
      setProtectedAccount(detail.protected_account === true);
      setRoleMemberCount(detail.member_count || record.member_count || 0);
      setEditingRole({ ...record, ...detail });
      const validCodes = getAssignablePermissionCodes(loadedCatalog);
      setCheckedKeys(detail.permissions.filter((code) => validCodes.has(code)));
    } catch (error) {
      if (requestId !== detailRequestRef.current) return;
      msgApi.error(
        getRequestErrorMessage(
          error,
          intl.formatMessage({
            id: 'pages.roles.detailLoadFailed',
            defaultMessage: 'Failed to load role details',
          }),
        ),
      );
      closeModal();
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  };

  const openView = async (record: API.RoleItem) => {
    await openEdit(record, true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (readOnlyModal || !isOwner) return;
      let confirmedProtectionChange = false;
      let affectedMemberCount = roleMemberCount;
      if (editingRole?.protected_account && !protectedAccount) {
        const impact = await getRoleProtectionImpact(editingRole.guid);
        affectedMemberCount = impact.affected_member_count;
      }
      if (
        editingRole?.protected_account &&
        !protectedAccount &&
        affectedMemberCount > 0
      ) {
        const confirmed = await new Promise<boolean>((resolve) => {
          Modal.confirm({
            title: intl.formatMessage({
              id: 'pages.roles.disableProtectionConfirm',
              defaultMessage: 'Disable protection for this role?',
            }),
            content: intl.formatMessage(
              {
                id: 'pages.roles.disableProtectionAffected',
                defaultMessage:
                  '{count} members will become manageable by delegated administrators.',
              },
              { count: affectedMemberCount },
            ),
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          });
        });
        if (!confirmed) return;
        confirmedProtectionChange = true;
      }
      setSaving(true);
      const payload: API.CreateRoleParams = {
        name: values.name.trim(),
        note: values.note,
        permissions: checkedKeys.filter((code) => permissionCodes.has(code)),
        protected_account: protectedAccount,
        ...(confirmedProtectionChange
          ? { confirm_protected_account_change: true }
          : {}),
      };
      if (editingRole) {
        await updateRole(editingRole.guid, payload);
      } else {
        await createRole(payload);
      }
      msgApi.success(
        intl.formatMessage({
          id: editingRole
            ? 'pages.roles.updateSuccess'
            : 'pages.roles.createSuccess',
          defaultMessage: editingRole
            ? 'Role updated successfully'
            : 'Role created successfully',
        }),
      );
      closeModal();
      actionRef.current?.reload();
    } catch (error) {
      if ((error as { errorFields?: unknown })?.errorFields) return;
      msgApi.error(
        getRequestErrorMessage(
          error,
          intl.formatMessage({
            id: editingRole
              ? 'pages.roles.updateFailed'
              : 'pages.roles.createFailed',
            defaultMessage: editingRole
              ? 'Failed to update role'
              : 'Failed to create role',
          }),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (guid: string) => {
    try {
      await deleteRole(guid);
      msgApi.success(
        intl.formatMessage({
          id: 'pages.roles.deleteSuccess',
          defaultMessage: 'Role deleted successfully',
        }),
      );
      actionRef.current?.reload();
    } catch (error) {
      msgApi.error(
        getRequestErrorMessage(
          error,
          intl.formatMessage({
            id: 'pages.roles.deleteFailed',
            defaultMessage: 'Failed to delete role',
          }),
        ),
      );
    }
  };

  const columns: ProColumns<API.RoleItem>[] = [
    {
      title: '',
      dataIndex: 'index',
      valueType: 'indexBorder',
      width: 50,
    },
    {
      title: (
        <FormattedMessage id="pages.roles.name" defaultMessage="Role Name" />
      ),
      dataIndex: 'name',
      width: 220,
      render: (_, record) => (
        <Space>
          <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
          <span>{record.name}</span>
        </Space>
      ),
    },
    {
      title: <FormattedMessage id="pages.roles.note" defaultMessage="Note" />,
      dataIndex: 'note',
      width: 260,
      ellipsis: true,
      render: (_, record) => record.note || '-',
    },
    {
      title: (
        <span>
          <FormattedMessage
            id="pages.roles.permissions"
            defaultMessage="Permissions"
          />
          <Tooltip
            title={intl.formatMessage({
              id: 'pages.roles.permissionsInfo',
              defaultMessage: 'Number of assigned permissions',
            })}
          >
            <InfoCircleOutlined style={{ marginLeft: 4 }} />
          </Tooltip>
        </span>
      ),
      dataIndex: 'permissions',
      width: 130,
      search: false,
      render: (_, record) => (
        <Tag color="blue">{record.permissions.length}</Tag>
      ),
    },
    {
      title: (
        <FormattedMessage id="pages.common.action" defaultMessage="Action" />
      ),
      valueType: 'option',
      width: 190,
      fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<Divider type="vertical" />}>
          {!isOwner && (
            <Button
              key="view"
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => void openView(record)}
            >
              <FormattedMessage id="pages.roles.view" defaultMessage="View" />
            </Button>
          )}
          <Tooltip
            title={
              !isOwner
                ? intl.formatMessage({
                    id: 'pages.roles.ownerOnly',
                    defaultMessage: 'Super administrator only',
                  })
                : undefined
            }
          >
            <span>
              <Button
                key="edit"
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => void openEdit(record)}
                disabled={!isOwner}
              >
                <FormattedMessage
                  id="pages.common.edit"
                  defaultMessage="Edit"
                />
              </Button>
            </span>
          </Tooltip>
          <Tooltip
            title={
              !isOwner
                ? intl.formatMessage({
                    id: 'pages.roles.ownerOnly',
                    defaultMessage: 'Super administrator only',
                  })
                : undefined
            }
          >
            <Popconfirm
              title={intl.formatMessage({
                id: 'pages.roles.deleteConfirm',
                defaultMessage: 'Are you sure to delete this role?',
              })}
              onConfirm={() => void handleDelete(record.guid)}
              disabled={!isOwner}
              okText={intl.formatMessage({
                id: 'pages.common.confirm',
                defaultMessage: 'Yes',
              })}
              cancelText={intl.formatMessage({
                id: 'pages.common.cancel',
                defaultMessage: 'No',
              })}
            >
              <Button
                key="delete"
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!isOwner}
              >
                <FormattedMessage
                  id="pages.common.delete"
                  defaultMessage="Delete"
                />
              </Button>
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={intl.formatMessage({
          id: 'pages.roles.superAdminInfo',
          defaultMessage:
            'Super-administrator access is protected separately and cannot be granted through a role.',
        })}
      />
      <Space
        direction="vertical"
        size="middle"
        style={{ width: '100%', marginBottom: 16 }}
      >
        <Card
          size="small"
          title={
            <Space>
              <SafetyCertificateOutlined />
              <FormattedMessage
                id="pages.roles.systemIdentity.ordinary"
                defaultMessage="Ordinary user"
              />
              <Tag>
                <FormattedMessage
                  id="pages.roles.systemIdentity.builtIn"
                  defaultMessage="Built-in"
                />
              </Tag>
            </Space>
          }
          extra={
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => openSystemIdentity('ordinary')}
            >
              <FormattedMessage
                id="pages.roles.systemIdentity.view"
                defaultMessage="View"
              />
            </Button>
          }
        >
          <FormattedMessage
            id="pages.roles.systemIdentity.ordinarySummary"
            defaultMessage="Personal address book basic functionality only."
          />
        </Card>
        <Card
          size="small"
          title={
            <Space>
              <SafetyCertificateOutlined />
              <FormattedMessage
                id="pages.roles.systemIdentity.superAdmin"
                defaultMessage="Super administrator"
              />
              <Tag>
                <FormattedMessage
                  id="pages.roles.systemIdentity.builtIn"
                  defaultMessage="Built-in"
                />
              </Tag>
            </Space>
          }
          extra={
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => openSystemIdentity('superAdmin')}
            >
              <FormattedMessage
                id="pages.roles.systemIdentity.view"
                defaultMessage="View"
              />
            </Button>
          }
        >
          <FormattedMessage
            id="pages.roles.systemIdentity.superAdminSummary"
            defaultMessage="Full effective authority for the unique system owner."
          />
        </Card>
      </Space>
      <ProTable<API.RoleItem>
        headerTitle={
          <FormattedMessage id="pages.roles.list" defaultMessage="Role List" />
        }
        columnsState={{
          persistenceType: 'localStorage',
          persistenceKey: 'role_list_columns_state',
        }}
        actionRef={actionRef}
        rowKey="guid"
        request={async (params) => {
          const result = await getRoleList({
            current: params.current,
            pageSize: params.pageSize,
            search: params.name,
          });
          return {
            data: result.data,
            total: result.total,
            success: true,
          };
        }}
        columns={columns}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        scroll={{ x: 900 }}
        search={{ labelWidth: 'auto' }}
        toolBarRender={() => [
          <Tooltip
            key="create-tip"
            title={
              !isOwner
                ? intl.formatMessage({
                    id: 'pages.roles.ownerOnly',
                    defaultMessage: 'Super administrator only',
                  })
                : undefined
            }
          >
            <span>
              <Button
                key="create"
                type="primary"
                icon={<PlusOutlined />}
                onClick={openCreate}
                disabled={!isOwner}
              >
                <FormattedMessage
                  id="pages.roles.create"
                  defaultMessage="Create Role"
                />
              </Button>
            </span>
          </Tooltip>,
        ]}
        options={{
          density: true,
          setting: { listsHeight: 400 },
          fullScreen: false,
          reload: true,
        }}
      />

      <Modal
        title={
          <FormattedMessage
            id={
              readOnlyModal
                ? 'pages.roles.view'
                : editingRole
                  ? 'pages.roles.edit'
                  : 'pages.roles.create'
            }
            defaultMessage={
              readOnlyModal
                ? 'View Role'
                : editingRole
                  ? 'Edit Role'
                  : 'Create Role'
            }
          />
        }
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void handleSubmit()}
        footer={readOnlyModal ? null : undefined}
        confirmLoading={saving}
        okButtonProps={{
          disabled:
            readOnlyModal ||
            !isOwner ||
            detailLoading ||
            catalogLoading ||
            catalog.length === 0,
        }}
        destroyOnClose
        width={680}
      >
        {detailLoading || catalogLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label={
                <FormattedMessage
                  id="pages.roles.name"
                  defaultMessage="Role Name"
                />
              }
              rules={[
                {
                  required: true,
                  whitespace: true,
                  message: intl.formatMessage({
                    id: 'pages.common.pleaseEnterRoleName',
                    defaultMessage: 'Please enter role name',
                  }),
                },
              ]}
            >
              <Input maxLength={255} disabled={!isOwner || readOnlyModal} />
            </Form.Item>
            <Form.Item
              name="note"
              label={
                <FormattedMessage id="pages.roles.note" defaultMessage="Note" />
              }
            >
              <Input.TextArea
                rows={3}
                maxLength={2000}
                disabled={!isOwner || readOnlyModal}
              />
            </Form.Item>
            <Form.Item>
              <Space size={8} wrap={false}>
                <label
                  htmlFor="role-permission-preset"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <FormattedMessage
                    id="pages.roles.permissionPresets"
                    defaultMessage="Permission presets"
                  />
                </label>
                <Select<RolePermissionPresetSelection>
                  id="role-permission-preset"
                  size="small"
                  value={selectedPreset}
                  style={{ width: 220 }}
                  onChange={(presetKey) => {
                    if (!isOwner) return;
                    setCheckedKeys((current) =>
                      applyRolePermissionPreset(presetKey, current, catalog),
                    );
                    setProtectedAccount(presetEnablesProtection(presetKey));
                  }}
                  disabled={!isOwner || readOnlyModal}
                  options={[
                    {
                      value: CUSTOM_ROLE_PERMISSION_PRESET_KEY,
                      label: intl.formatMessage({
                        id: 'pages.roles.preset.custom',
                        defaultMessage: 'Custom',
                      }),
                    },
                    ...ROLE_PERMISSION_PRESETS.map((preset) => ({
                      value: preset.key,
                      label: intl.formatMessage({
                        id: `pages.roles.preset.${preset.key}`,
                        defaultMessage: preset.defaultMessage,
                      }),
                    })),
                  ]}
                />
              </Space>
            </Form.Item>
            <Form.Item
              label={
                <FormattedMessage
                  id="pages.roles.selectPermissions"
                  defaultMessage="Select Permissions"
                />
              }
              extra={intl.formatMessage({
                id: 'pages.roles.permissionScopeInfo',
                defaultMessage:
                  'Device actions can be assigned globally or to selected device groups when a user receives this role.',
              })}
            >
              <Tree
                checkable
                disabled={!isOwner || readOnlyModal}
                defaultExpandAll
                height={320}
                treeData={treeData}
                checkedKeys={[
                  ...checkedKeys,
                  PERSONAL_ADDRESS_BOOK_KEY,
                  ...(protectedAccount ? [PROTECTED_ACCOUNT_KEY] : []),
                ]}
                onCheck={(keys, info) => {
                  const values = Array.isArray(keys) ? keys : keys.checked;
                  const selected = values
                    .map(String)
                    .filter((code) => permissionCodes.has(code));
                  const changedCode = String(info.node.key);
                  if (changedCode === PROTECTED_ACCOUNT_KEY) {
                    if (isOwner) setProtectedAccount(info.checked);
                    return;
                  }
                  if (!isOwner || readOnlyModal) return;
                  setCheckedKeys(
                    info.checked
                      ? addRequiredPermissions(selected, catalog)
                      : removeDependentPermissions(
                          selected,
                          changedCode,
                          catalog,
                        ),
                  );
                }}
              />
            </Form.Item>
          </Form>
        )}
      </Modal>
      <Modal
        title={
          <FormattedMessage
            id={
              systemIdentity === 'ordinary'
                ? 'pages.roles.systemIdentity.ordinary'
                : 'pages.roles.systemIdentity.superAdmin'
            }
            defaultMessage={
              systemIdentity === 'ordinary'
                ? 'Ordinary user'
                : 'Super administrator'
            }
          />
        }
        open={systemIdentity !== null}
        onCancel={closeSystemIdentity}
        footer={null}
        destroyOnClose
      >
        {systemIdentity === 'superAdmin' && catalogLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : (
          <List
            size="small"
            dataSource={
              systemIdentity === 'ordinary'
                ? [
                    intl.formatMessage({
                      id: 'pages.roles.personalAddressBook',
                      defaultMessage: 'Personal address book',
                    }),
                    intl.formatMessage({
                      id: 'pages.roles.basicFunction',
                      defaultMessage: 'Basic feature',
                    }),
                  ]
                : [
                    ...catalog.map((permission) =>
                      intl.formatMessage({
                        id: `pages.roles.permission.${permission.code}`,
                        defaultMessage: permission.name,
                      }),
                    ),
                    intl.formatMessage({
                      id: 'pages.roles.systemIdentity.systemSettings',
                      defaultMessage: 'System settings',
                    }),
                    intl.formatMessage({
                      id: 'pages.roles.systemIdentity.deviceGroupStructure',
                      defaultMessage: 'Device-group structure',
                    }),
                    intl.formatMessage({
                      id: 'pages.roles.systemIdentity.identityAdministration',
                      defaultMessage: 'Identity administration',
                    }),
                  ]
            }
            renderItem={(item) => <List.Item>{item}</List.Item>}
          />
        )}
      </Modal>
    </PageContainer>
  );
};

export default RoleList;
