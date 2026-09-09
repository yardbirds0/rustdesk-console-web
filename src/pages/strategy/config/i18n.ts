import type { ConfigOption } from './types';

export const CONFIG_OPTION_MESSAGE_PREFIX = 'pages.strategies.option';
export const CONFIG_OPTION_YES_MESSAGE_ID = 'pages.strategies.values.yes';
export const CONFIG_OPTION_NO_MESSAGE_ID = 'pages.strategies.values.no';

export function normalizeConfigOptionValue(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'empty';
}

export function getConfigOptionLabelMessageId(optionKey: string): string {
  return `${CONFIG_OPTION_MESSAGE_PREFIX}.${optionKey}.label`;
}

export function getConfigOptionDescriptionMessageId(optionKey: string): string {
  return `${CONFIG_OPTION_MESSAGE_PREFIX}.${optionKey}.description`;
}

export function getConfigOptionValueMessageId(
  optionKey: string,
  value: string,
): string | undefined {
  // An empty protocol value is meaningful (for example, an unset text
  // option), but it has no label to translate. Returning no message ID keeps
  // the raw value from being rendered as an Intl message identifier.
  if (value.trim() === '') return undefined;

  if (value === 'Y') return CONFIG_OPTION_YES_MESSAGE_ID;
  if (value === 'N') return CONFIG_OPTION_NO_MESSAGE_ID;

  return `${CONFIG_OPTION_MESSAGE_PREFIX}.${optionKey}.value.${normalizeConfigOptionValue(value)}`;
}

export function humanizeConfigOptionKey(optionKey: string): string {
  return optionKey
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getConfigOptionLocaleMessageIds(
  option: ConfigOption,
): string[] {
  const ids = [getConfigOptionLabelMessageId(option.key)];

  if (option.description) {
    ids.push(getConfigOptionDescriptionMessageId(option.key));
  }

  for (const value of option.options || []) {
    const messageId = getConfigOptionValueMessageId(option.key, value);
    if (messageId) ids.push(messageId);
  }

  return [...new Set(ids)];
}
