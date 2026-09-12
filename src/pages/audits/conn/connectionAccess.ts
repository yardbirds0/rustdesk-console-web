export const getConnectionPageMode = (canAuditView: boolean) =>
  canAuditView ? 'full' : 'restricted';

export const canDisconnectAuditRecord = (
  canDisconnect: boolean,
  record: API.ConnectionAuditItem,
): record is API.ConnectionAuditItem & {
  deviceUuid: string;
  connId: string | number;
} =>
  canDisconnect &&
  record.can_disconnect === true &&
  typeof record.deviceUuid === 'string' &&
  record.deviceUuid.length > 0 &&
  (typeof record.connId === 'number' ||
    (typeof record.connId === 'string' && record.connId.trim() !== '')) &&
  Number.isInteger(Number(record.connId));

export const canDisconnectActiveConnection = (
  canDisconnect: boolean,
  record: API.ActiveConnectionItem,
) => canDisconnect && record.can_disconnect === true;
