export const getStrategyListMode = (canView: boolean) =>
  canView ? 'full' : 'candidates';

export type StrategyAssignmentTargetType = 'device' | 'user' | 'device_group';

export function getAssignableStrategyTargetTypes(options: {
  canAssignUsers: boolean;
}): StrategyAssignmentTargetType[] {
  return [
    'device',
    ...(options.canAssignUsers ? (['user'] as const) : []),
    'device_group',
  ];
}
