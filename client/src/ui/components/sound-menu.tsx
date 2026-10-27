import { Popover } from '@base-ui/react/popover';
import { useId, useState } from 'react';
import { useMessages } from '../../i18n';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import { cx } from '../cx';
import { Button } from './button';
import { Slider } from './slider';
import styles from './sound-menu.module.css';

/** The sound effects' setting, and how to change it. */
export interface SoundMenuProps {
  /** 0 to 1. */
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onMutedChange: (muted: boolean) => void;
  /** On the speaker, as the Phone room bar's narrower icon buttons. */
  triggerClassName?: string;
}

/**
 * The speaker before the viewer's avatar, a Secondary icon Button whose
 * glyph and name say whether sound is on, and the Zumpo/Sound menu it opens
 * under itself, lined up with its end; on a phone the menu is the screen's
 * width less its margins (SO01-SO07).
 */
export function SoundMenu({ triggerClassName, ...setting }: SoundMenuProps) {
  const m = useMessages().sound;
  const phone = useMediaQuery(PHONE);
  const [open, setOpen] = useState(false);
  // Nothing is heard at 0 either, so the speaker says sound is off.
  const silent = setting.muted || setting.volume === 0;
  // Tabbing past the volume closes the menu: Base UI closes a popover that
  // focus leaves for anything but its trigger (platform.spec).
  return (
    <Popover.Root open={open} onOpenChange={(next) => setOpen(next)}>
      <Popover.Trigger
        render={
          <Button
            variant="secondary"
            icon={silent ? 'sound-off' : 'sound'}
            iconOnly
            className={triggerClassName}
          >
            {silent ? m.trigger.off : m.trigger.on}
          </Button>
        }
      />
      <Popover.Portal>
        <Popover.Positioner
          className="zumpo"
          side="bottom"
          align="end"
          sideOffset={phone ? 12 : 16}
          collisionPadding={16}
        >
          <Popover.Popup className={styles.menu} aria-label={m.menu}>
            <SoundRows {...setting} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The menu's card on its own, as the design system's page shows it. */
export function SoundMenuCard(props: SoundMenuProps) {
  return (
    <div className={cx(styles.menu, styles.still)}>
      <SoundRows {...props} />
    </div>
  );
}

/**
 * State=On and State=Off: Sound effects, its level, the mute toggle and the
 * volume. A Music row goes under it when there is music. Moving the slider
 * while muted turns the sound back on, since that is what it asks for.
 */
function SoundRows({
  volume,
  muted,
  onVolumeChange,
  onMutedChange,
}: SoundMenuProps) {
  const m = useMessages().sound;
  const label = useId();
  const percent = Math.round(volume * 100);
  return (
    <div className={styles.row} role="group" aria-labelledby={label}>
      <div className={styles.head}>
        <span id={label} className={styles.label}>
          {m.effects.label}
        </span>
        <span className={styles.level} aria-hidden="true">
          {muted ? m.off : m.level(percent)}
        </span>
      </div>
      <div className={styles.control}>
        <Button
          variant="secondary"
          icon={muted ? 'sound-off' : 'sound'}
          iconOnly
          aria-pressed={muted}
          onClick={() => onMutedChange(!muted)}
        >
          {m.effects.mute}
        </Button>
        <Slider
          className={styles.slider}
          value={percent}
          onValueChange={(next) => {
            onVolumeChange(next / 100);
            if (muted) onMutedChange(false);
          }}
          label={m.effects.volume}
          valueText={(next) => m.valueText(next, muted)}
          muted={muted}
        />
      </div>
    </div>
  );
}
