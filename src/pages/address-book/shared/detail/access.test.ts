import { describe, expect, it } from '@jest/globals';
import { canWriteSharedAddressBook } from './access';

describe('shared address-book content access', () => {
  it.each<[number | undefined, boolean]>([
    [undefined, false],
    [0, false],
    [1, false],
    [2, true],
    [3, true],
  ])('maps share rule %s to write access %s', (rule, expected) => {
    expect(canWriteSharedAddressBook(rule)).toBe(expected);
  });
});
