import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { FormattedMessage, useIntl } from '@umijs/max';
import React, { useRef } from 'react';
import { getConsoleAudits } from '@/services/rustdesk-console/audit';

const ConsoleAudit: React.FC = () => {
  const intl = useIntl();
  const actionRef = useRef<ActionType>(null);

  const columns: ProColumns<API.ConsoleAuditItem>[] = [
    {
      title: (
        <FormattedMessage
          id="pages.audits.operator"
          defaultMessage="Operator"
        />
      ),
      dataIndex: 'operator',
      hideInTable: true,
    },
    {
      title: <FormattedMessage id="pages.audits.user" defaultMessage="User" />,
      dataIndex: 'actor_user_name',
      width: 150,
      search: false,
      render: (_, record) =>
        record.actor_user_name ||
        record.actor_user_guid ||
        intl.formatMessage({
          id: 'pages.audits.unknownUser',
          defaultMessage: 'Unknown user',
        }),
    },
    {
      title: (
        <FormattedMessage id="pages.audits.action" defaultMessage="Action" />
      ),
      dataIndex: 'action',
      width: 150,
    },
    {
      title: (
        <FormattedMessage
          id="pages.audits.targetType"
          defaultMessage="Target type"
        />
      ),
      dataIndex: 'target_type',
      width: 150,
    },
    {
      title: (
        <FormattedMessage
          id="pages.audits.targetId"
          defaultMessage="Target ID"
        />
      ),
      dataIndex: 'target_guid',
      width: 180,
      ellipsis: true,
    },
    {
      title: (
        <FormattedMessage id="pages.audits.result" defaultMessage="Result" />
      ),
      dataIndex: 'result',
      width: 120,
    },
    {
      title: (
        <FormattedMessage id="pages.audits.reason" defaultMessage="Reason" />
      ),
      dataIndex: 'reason',
      ellipsis: true,
    },
    {
      title: <FormattedMessage id="pages.audits.time" defaultMessage="Time" />,
      dataIndex: 'created_at',
      valueType: 'dateTime',
      width: 180,
    },
  ];

  return (
    <PageContainer>
      <ProTable<API.ConsoleAuditItem>
        headerTitle={
          <FormattedMessage
            id="pages.audits.console"
            defaultMessage="Console Audits"
          />
        }
        columnsState={{
          persistenceType: 'localStorage',
          persistenceKey: 'console_audit_columns_state',
        }}
        actionRef={actionRef}
        rowKey="guid"
        request={async (params) => {
          const result = await getConsoleAudits({
            current: params.current || 1,
            pageSize: params.pageSize || 20,
            operator: params.operator,
          });
          return {
            data: result.data || [],
            total: result.total || 0,
            success: true,
          };
        }}
        columns={columns}
        search={{
          defaultCollapsed: false,
          labelWidth: 'auto',
        }}
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        options={{
          density: true,
          setting: {
            listsHeight: 400,
          },
          fullScreen: false,
          reload: true,
        }}
        scroll={{ x: 1100 }}
      />
    </PageContainer>
  );
};

export default ConsoleAudit;
