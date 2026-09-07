export const canWriteSharedAddressBook = (rule?: number): boolean =>
  (rule ?? 0) >= 2;
