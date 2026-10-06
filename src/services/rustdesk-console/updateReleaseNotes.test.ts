import { expect, test } from '@jest/globals';
import { matchingReleaseNotes } from './updateReleaseNotes';
import type { ComponentChange } from './systemUpdate';

const component: ComponentChange = {
  component: 'backend',
  action: 'update',
  current: '1.9.0',
  target: '1.9.1',
  releaseUrl: 'https://github.com/databk/rustdesk-console/releases/tag/v1.9.1',
};
const result = (): API.UpdateCheckResult => ({
  backend: {
    has_update: true,
    version: component.target,
    release_url: `https://github.com/databk/rustdesk-console/releases/tag/v${component.target}`,
    release_note: 'Release content',
  },
  frontend: { has_update: false },
});

test('only the matching official target metadata supplies published notes', () => {
  expect(matchingReleaseNotes(result(), component)).toBe('Release content');
  expect(
    matchingReleaseNotes(result(), { ...component, target: '999.0.0' }),
  ).toBeNull();
});

test.each([
  'https://github.com/another/rustdesk-console/releases/tag/v1.9.1',
  'https://github.com/databk/rustdesk-console-web/releases/tag/v1.9.1',
  'https://github.com/databk/rustdesk-console/releases/tag/v999.0.0',
  'http://github.com/databk/rustdesk-console/releases/tag/v1.9.1',
  'https://github.com/databk/rustdesk-console/releases/tag/v1.9.1?wrong=1',
])(
  'unrelated release URLs never label the selected target with stale notes: %s',
  (release_url) => {
    const metadata = result();
    metadata.backend.release_url = release_url;
    expect(matchingReleaseNotes(metadata, component)).toBeNull();
  },
);

test('missing data and prerelease notes remain an honest empty state', () => {
  expect(matchingReleaseNotes(null, component)).toBeNull();
  const metadata = result();
  metadata.backend.version = '1.9.1-rc.1';
  expect(matchingReleaseNotes(metadata, component)).toBeNull();
});
