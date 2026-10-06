import type { ComponentChange } from './systemUpdate';

const stableVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

// Release notes are display metadata. Only the update plan authorizes installation.
export function matchingReleaseNotes(
  result: API.UpdateCheckResult | null,
  component: ComponentChange,
): string | null {
  const release =
    result?.[component.component === 'web' ? 'frontend' : 'backend'];
  const version =
    typeof release?.version === 'string'
      ? release.version.replace(/^v/, '')
      : null;
  if (
    !version ||
    !stableVersion.test(version) ||
    version !== component.target.replace(/^v/, '') ||
    typeof release?.release_url !== 'string'
  )
    return null;
  try {
    const url = new URL(release.release_url);
    const repository =
      component.component === 'web'
        ? 'rustdesk-console-web'
        : 'rustdesk-console';
    const prefix = `/databk/${repository}/releases/tag/`;
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.port ||
      url.username ||
      url.password ||
      !url.pathname.startsWith(prefix) ||
      url.search ||
      url.hash ||
      decodeURIComponent(url.pathname.slice(prefix.length)).replace(
        /^v/,
        '',
      ) !== version
    )
      return null;
    return typeof release.release_note === 'string' &&
      release.release_note.trim()
      ? release.release_note
      : null;
  } catch {
    return null;
  }
}
