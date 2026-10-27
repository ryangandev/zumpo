import { useMemo, useState } from 'react';
import { useSoundControls } from '../audio';
import type { SoundMenuProps } from '../ui';

/**
 * The sound effects' setting for the speaker before the viewer's avatar, or
 * nothing where the browser has no Web Audio: a control that could change
 * nothing is not shown, as no screen shows an action the player cannot take.
 * A speaker already shown stays, though, if the engine then fails at the
 * first gesture: the gesture may be on the speaker itself, and taking it away
 * would drop the player's focus. The setting it keeps does no harm.
 */
export function useSoundMenu(): SoundMenuProps | undefined {
  const { available, settings, setVolume, setMuted } = useSoundControls();
  const [shown, setShown] = useState(available);
  if (available && !shown) setShown(true);
  const { volume, muted } = settings.effects;
  return useMemo(
    () =>
      available || shown
        ? {
            volume,
            muted,
            onVolumeChange: (next: number) => setVolume('effects', next),
            onMutedChange: (next: boolean) => setMuted('effects', next),
          }
        : undefined,
    [available, shown, volume, muted, setVolume, setMuted],
  );
}
