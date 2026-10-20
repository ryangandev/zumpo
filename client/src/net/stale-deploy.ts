const RELOADED_AT_KEY = 'zumpo:reloaded-for-deploy';

/** A reload this soon after the last one would only fail the same way. */
const RELOAD_COOLDOWN_MS = 10_000;

/**
 * Reloads the page once when a chunk it asked for is gone, as after a deploy.
 * False, and no reload, when it already did so moments ago: the chunk is
 * missing from the new build too, and the crash page says so instead of the
 * page reloading forever.
 */
export function reloadForNewDeploy(
  now: number = Date.now(),
  reload: () => void = () => window.location.reload(),
): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_AT_KEY));
    if (now - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(now));
  } catch {
    // Without storage a reload could not tell it had already tried.
    return false;
  }
  reload();
  return true;
}
