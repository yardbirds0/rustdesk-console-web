import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { FormattedMessage, useIntl } from '@umijs/max';
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Flex,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getAllDeviceGroups } from '@/services/rustdesk-console/deviceGroup';
import { getPermissionList } from '@/services/rustdesk-console/permission';
import { getRoleList } from '@/services/rustdesk-console/role';
import {
  getUserRoles,
  replaceUserRoles,
} from '@/services/rustdesk-console/userRole';
import { getRequestErrorMessage } from '@/utils/requestError';
import {
  type AssignmentScopeType,
  type AssignmentValidationError,
  changeAssignmentScope,
  deriveEffectivePermissionScopes,
  groupEffectivePermissionScopes,
  type RoleAssignmentDraft,
  roleSupportsDeviceGroupScope,
  toReplaceUserRolesParams,
  validateAssignments,
} from './userRoleAssignment';

interface UserRolesModalProps {
  open: boolean;
  user: API.UserItem | null;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const loadAllRoles = async () => {
  const roles: API.RoleItem[] = [];
  let current = 1;
  let total = 0;
  do {
    const page = await getRoleList({ current, pageSize: 100 });
    roles.push(...page.data);
    total = page.total;
    current += 1;
    if (page.data.length === 0) break;
  } while (roles.length < total);
  return roles;
};

const UserRolesModal: React.FC<UserRolesModalProps> = ({
  open,
  user,
  onOpenChange,
  onSuccess,
}) => {
  const intl = useIntl();
  const { message: msgApi } = App.useApp();
  const [roles, setRoles] = useState<API.RoleItem[]>([]);
  const [groups, setGroups] = useState<API.DeviceGroupItem[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<
    API.PermissionItem[]
  >([]);
  const [drafts, setDrafts] = useState<RoleAssignmentDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const loadRequestRef = useRef(0);
  const saveRequestRef = useRef(0);
  const userGuid = user?.guid;

  const groupNameByGuid = useMemo(
    () => new Map(groups.map((group) => [group.guid, group.name])),
    [groups],
  );

  const loadData = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    if (!open || !userGuid) return;
    setLoading(true);
    setSaving(false);
    setLoadFailed(false);
    setRoles([]);
    setGroups([]);
    setPermissionCatalog([]);
    setDrafts([]);
    try {
      const [roleItems, groupItems, assignmentResponse, permissionResponse] =
        await Promise.all([
          loadAllRoles(),
          getAllDeviceGroups(),
          getUserRoles(userGuid),
          getPermissionList(),
        ]);
      if (requestId !== loadRequestRef.current) return;
      if (
        !Array.isArray(groupItems) ||
        !Array.isArray(assignmentResponse.data)
      ) {
        throw new Error('Invalid user role response');
      }
      setRoles(roleItems);
      setGroups(groupItems);
      setPermissionCatalog(permissionResponse.data);
      setDrafts(
        assignmentResponse.data.map((assignment) => ({
          key: assignment.guid,
          role_guid: assignment.role_guid,
          scope_type: assignment.scope_type,
          device_group_guids: assignment.device_group_guids,
        })),
      );
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      setLoadFailed(true);
      msgApi.error(
        getRequestErrorMessage(
          error,
          intl.formatMessage({
            id: 'pages.users.rolesLoadFailed',
            defaultMessage: 'Failed to load user roles',
          }),
        ),
      );
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [intl, msgApi, open, userGuid]);

  useEffect(() => {
    void loadData();
    return () => {
      loadRequestRef.current += 1;
      saveRequestRef.current += 1;
    };
  }, [loadData]);

  const roleByGuid = useMemo(
    () => new Map(roles.map((role) => [role.guid, role])),
    [roles],
  );

  const effectiveScope = useMemo(
    () => deriveEffectivePermissionScopes(drafts, roleByGuid),
    [drafts, roleByGuid],
  );

  const effectiveScopeGroups = useMemo(
    () => groupEffectivePermissionScopes(effectiveScope),
    [effectiveScope],
  );

  const permissionScopeByCode = useMemo(
    () =>
      new Map(
        permissionCatalog.map(({ code, scope }) => [code, scope] as const),
      ),
    [permissionCatalog],
  );

  const displayedEffectiveScopeGroups = useMemo(() => {
    const addressBooks = effectiveScopeGroups.find(
      ({ resource }) => resource === 'address_books',
    ) || { resource: 'address_books', actions: [] };
    return [
      addressBooks,
      ...effectiveScopeGroups.filter(
        ({ resource }) => resource !== 'address_books',
      ),
    ];
  }, [effectiveScopeGroups]);

  const getPermissionLabel = (permission: string) =>
    intl.formatMessage({
      id: `pages.roles.permission.${permission}`,
      defaultMessage: intl.formatMessage({
        id: 'pages.roles.unknownPermission',
        defaultMessage: 'Unknown permission',
      }),
    });

  const getResourceLabel = (resource: string) =>
    intl.formatMessage({
      id: `pages.roles.resource.${resource}`,
      defaultMessage: intl.formatMessage({
        id: 'pages.roles.unknownResource',
        defaultMessage: 'Unknown resource',
      }),
    });

  const canUseDeviceGroupScope = (roleGuid: string) => {
    return roleSupportsDeviceGroupScope(
      roleByGuid.get(roleGuid),
      permissionScopeByCode,
    );
  };

  const updateDraft = (
    key: string,
    changes: Partial<Omit<RoleAssignmentDraft, 'key'>>,
  ) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...changes } : draft,
      ),
    );
  };

  const handleRoleChange = (key: string, roleGuid: string) => {
    updateDraft(key, {
      role_guid: roleGuid,
      scope_type: 'global',
      device_group_guids: [],
    });
  };

  const handleScopeChange = (key: string, scopeType: AssignmentScopeType) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? changeAssignmentScope(draft, scopeType) : draft,
      ),
    );
  };

  const addDraft = () => {
    setDrafts((current) => {
      if (
        current.some((draft) => !draft.role_guid) ||
        current.length >= roles.length
      ) {
        return current;
      }
      return [
        ...current,
        {
          key: `new-${Date.now()}-${current.length}`,
          role_guid: '',
          scope_type: 'global',
          device_group_guids: [],
        },
      ];
    });
  };

  const handleSave = async () => {
    if (!userGuid || loading || loadFailed) return;
    const viewRequestId = loadRequestRef.current;
    const saveRequestId = ++saveRequestRef.current;
    const validationError = validateAssignments(
      drafts,
      roleByGuid,
      permissionScopeByCode,
    );
    if (validationError) {
      const errorMessages: Record<AssignmentValidationError, string> = {
        missing_role: intl.formatMessage({
          id: 'pages.users.roleRequired',
          defaultMessage: 'Select a role for every assignment',
        }),
        duplicate_role: intl.formatMessage({
          id: 'pages.users.duplicateRole',
          defaultMessage: 'A role can only be assigned once',
        }),
        unsupported_device_group_scope: intl.formatMessage({
          id: 'pages.users.unsupportedDeviceGroupScope',
          defaultMessage:
            'Device-group scope is only available for roles containing device actions and strategy assignment',
        }),
        missing_device_group: intl.formatMessage({
          id: 'pages.users.deviceGroupScopeRequired',
          defaultMessage:
            'Select at least one device group for a device-group assignment',
        }),
      };
      msgApi.error(errorMessages[validationError]);
      return;
    }

    setSaving(true);
    try {
      await replaceUserRoles(userGuid, toReplaceUserRolesParams(drafts));
      if (
        viewRequestId !== loadRequestRef.current ||
        saveRequestId !== saveRequestRef.current
      ) {
        return;
      }
      msgApi.success(
        intl.formatMessage({
          id: 'pages.users.rolesSaved',
          defaultMessage: 'User roles saved',
        }),
      );
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      if (
        viewRequestId !== loadRequestRef.current ||
        saveRequestId !== saveRequestRef.current
      ) {
        return;
      }
      msgApi.error(
        getRequestErrorMessage(
          error,
          intl.formatMessage({
            id: 'pages.users.rolesSaveFailed',
            defaultMessage: 'Failed to save user roles',
          }),
        ),
      );
    } finally {
      if (
        viewRequestId === loadRequestRef.current &&
        saveRequestId === saveRequestRef.current
      ) {
        setSaving(false);
      }
    }
  };

  const availableRoleOptions = (currentGuid: string) => {
    const selected = new Set(
      drafts
        .filter((draft) => draft.role_guid !== currentGuid)
        .map((draft) => draft.role_guid),
    );
    return roles
      .filter((role) => !selected.has(role.guid))
      .map((role) => ({ label: role.name, value: role.guid }));
  };

  return (
    <Modal
      title={
        <FormattedMessage
          id="pages.users.rolesTitle"
          defaultMessage="Roles for {name}"
          values={{ name: user?.display_name || user?.name || '' }}
        />
      }
      open={open}
      onCancel={() => onOpenChange(false)}
      onOk={() => void handleSave()}
      confirmLoading={saving}
      okButtonProps={{ disabled: loading || loadFailed }}
      okText={intl.formatMessage({
        id: 'pages.common.save',
        defaultMessage: 'Save',
      })}
      destroyOnClose
      width={760}
    >
      {loadFailed ? (
        <Alert
          type="error"
          showIcon
          message={intl.formatMessage({
            id: 'pages.users.rolesLoadFailed',
            defaultMessage: 'Failed to load user roles',
          })}
        />
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Flex vertical gap="small" style={{ width: '100%' }}>
            <Alert
              type="info"
              showIcon
              message={
                <FormattedMessage
                  id="pages.users.rolesScopeInfo"
                  defaultMessage="Global grants override narrower device-group grants."
                />
              }
            />

            {drafts.map((draft, index) => {
              const role = roleByGuid.get(draft.role_guid);
              const scopedAllowed = canUseDeviceGroupScope(draft.role_guid);
              return (
                <Card
                  key={draft.key}
                  size="small"
                  style={{ width: '100%' }}
                  title={
                    <FormattedMessage
                      id="pages.users.roleAssignmentTitle"
                      defaultMessage="Role {number}"
                      values={{ number: index + 1 }}
                    />
                  }
                  extra={
                    <Button
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      aria-label={intl.formatMessage({
                        id: 'pages.users.removeRole',
                        defaultMessage: 'Remove role',
                      })}
                      onClick={() => {
                        setDrafts((current) =>
                          current.filter((item) => item.key !== draft.key),
                        );
                      }}
                    />
                  }
                >
                  <Space
                    direction="vertical"
                    size="middle"
                    style={{ width: '100%' }}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      value={draft.role_guid || undefined}
                      options={availableRoleOptions(draft.role_guid)}
                      onChange={(value) => handleRoleChange(draft.key, value)}
                      style={{ width: '100%' }}
                      aria-label={intl.formatMessage({
                        id: 'pages.users.selectRole',
                        defaultMessage: 'Select role',
                      })}
                      placeholder={intl.formatMessage({
                        id: 'pages.users.selectRole',
                        defaultMessage: 'Select role',
                      })}
                    />
                    <Flex
                      wrap
                      gap="small"
                      align="flex-start"
                      style={{ width: '100%' }}
                    >
                      <Segmented
                        value={draft.scope_type}
                        aria-label={intl.formatMessage({
                          id: 'pages.users.scopeMode',
                          defaultMessage: 'Role scope mode',
                        })}
                        options={[
                          {
                            label: intl.formatMessage({
                              id: 'pages.users.globalScope',
                              defaultMessage: 'Global',
                            }),
                            value: 'global',
                          },
                          {
                            label: intl.formatMessage({
                              id: 'pages.users.deviceGroupScope',
                              defaultMessage: 'Selected device groups',
                            }),
                            value: 'device_group',
                            disabled: !scopedAllowed,
                          },
                        ]}
                        onChange={(value) =>
                          handleScopeChange(
                            draft.key,
                            value as AssignmentScopeType,
                          )
                        }
                      />
                      {draft.scope_type === 'device_group' && (
                        <Select
                          mode="multiple"
                          showSearch
                          optionFilterProp="label"
                          maxTagCount={2}
                          value={draft.device_group_guids}
                          options={groups.map((group) => ({
                            label: group.name,
                            value: group.guid,
                          }))}
                          onChange={(values) =>
                            updateDraft(draft.key, {
                              device_group_guids: values,
                            })
                          }
                          aria-label={intl.formatMessage({
                            id: 'pages.users.selectDeviceGroups',
                            defaultMessage: 'Select one or more device groups',
                          })}
                          placeholder={intl.formatMessage({
                            id: 'pages.users.selectDeviceGroups',
                            defaultMessage: 'Select one or more device groups',
                          })}
                          style={{ flex: '1 1 280px', minWidth: 220 }}
                          status={
                            draft.device_group_guids.length === 0 ? 'error' : ''
                          }
                        />
                      )}
                    </Flex>
                    <Space wrap size={[4, 4]}>
                      {(role?.permissions || []).map((permission) => (
                        <Tag key={permission}>
                          {getPermissionLabel(permission)}
                        </Tag>
                      ))}
                    </Space>
                  </Space>
                </Card>
              );
            })}

            <Button
              block
              type="dashed"
              icon={<PlusOutlined />}
              disabled={
                drafts.length >= roles.length ||
                drafts.some((draft) => !draft.role_guid)
              }
              onClick={addDraft}
            >
              <FormattedMessage
                id="pages.users.addRole"
                defaultMessage="Add role"
              />
            </Button>
          </Flex>

          <Divider style={{ margin: 0 }} />
          <div>
            <Typography.Title level={5} style={{ marginTop: 0 }}>
              <FormattedMessage
                id="pages.users.effectiveScope"
                defaultMessage="Effective scope"
              />
            </Typography.Title>
            <Flex vertical gap="middle">
              {displayedEffectiveScopeGroups.map(({ resource, actions }) => (
                <Card
                  key={resource}
                  size="small"
                  title={getResourceLabel(resource)}
                >
                  <Flex vertical gap="small">
                    {resource === 'address_books' && (
                      <section
                        aria-label={intl.formatMessage({
                          id: 'pages.roles.personalAddressBook',
                          defaultMessage: 'Personal address book',
                        })}
                      >
                        <Flex
                          align="center"
                          gap={4}
                          style={{
                            minWidth: 'max-content',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Typography.Text>
                            <FormattedMessage
                              id="pages.roles.personalAddressBook"
                              defaultMessage="Personal address book"
                            />
                          </Typography.Text>
                          <Tag>
                            <FormattedMessage
                              id="pages.roles.basicFunction"
                              defaultMessage="Basic feature"
                            />
                          </Tag>
                        </Flex>
                      </section>
                    )}
                    {actions.map(({ permission, scope }) => (
                      <section
                        key={permission}
                        aria-label={getPermissionLabel(permission)}
                        tabIndex={
                          scope.scope_type === 'device_group' ? 0 : undefined
                        }
                        style={{ overflowX: 'auto' }}
                      >
                        <Flex
                          align="center"
                          gap={4}
                          style={{
                            minWidth: 'max-content',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Typography.Text>
                            {getPermissionLabel(permission)}
                          </Typography.Text>
                          {scope.scope_type === 'global' ? (
                            <Tag color="green">
                              <FormattedMessage
                                id="pages.users.globalScope"
                                defaultMessage="Global"
                              />
                            </Tag>
                          ) : (
                            scope.device_group_guids.map((guid) => (
                              <Tag color="blue" key={guid}>
                                {groupNameByGuid.get(guid) || guid}
                              </Tag>
                            ))
                          )}
                        </Flex>
                      </section>
                    ))}
                  </Flex>
                </Card>
              ))}
            </Flex>
          </div>
        </Space>
      )}
    </Modal>
  );
};

export default UserRolesModal;
