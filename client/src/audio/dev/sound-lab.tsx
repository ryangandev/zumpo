// The sound lab: every declared sound, played through the real engine with
// the real settings, for auditioning a new sound in place and for the
// browser check in e2e/sound/. Development only, at /dev/sound; the build
// drops it, and with it the test sounds' files.

import { useEffect, useState } from 'react';
import '../../ui/zumpo.css';
import { Button, Wordmark } from '../../ui';
import { SOUND_BANKS, type SoundGroup } from '../generated';
import { useSoundControls, useSounds } from '../provider';
import type { SoundBank } from '../types';
import styles from './sound-lab.module.css';

/**
 * The banks `?bank=hush,ui` keeps, as a page keeps only its own, and what is
 * wrong with the list: an empty one, or names no bank has, keep nothing
 * rather than everything, and say so.
 */
export function chooseBanks<Group extends string>(
  search: string,
  known: readonly Group[],
): { groups: Group[]; problem: string | null } {
  const asked = new URLSearchParams(search).get('bank');
  if (asked === null) return { groups: [...known], problem: null };
  const names = asked
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const all = `the banks are ${known.join(', ')}`;
  if (names.length === 0) {
    return { groups: [], problem: `?bank= names no bank; ${all}.` };
  }
  const unknown = names.filter((name) => !known.includes(name as Group));
  return {
    groups: known.filter((group) => names.includes(group)),
    problem: unknown.length
      ? `No bank is called ${unknown.join(', ')}; ${all}.`
      : null,
  };
}

function Bank({ group, bank }: { group: SoundGroup; bank: SoundBank }) {
  const play = useSounds(bank);
  return (
    <section className={styles.bank} aria-label={group}>
      <h2 className={styles.group}>{group}</h2>
      {Object.values(bank).map((sound) => (
        <div key={sound.id} className={styles.sound}>
          <span className={styles.id}>{sound.id}</span>
          <span className={styles.facts}>
            {sound.variants.length} variant
            {sound.variants.length === 1 ? '' : 's'}, {sound.gainDb} dB
            {sound.steps ? ', in steps' : ''}
            {sound.hiddenTab ? ', plays hidden' : ''}
          </span>
          {sound.steps ? (
            // A stepped sound is played by number, as its page does.
            sound.variants.map((_, index) => (
              <Button
                key={index}
                variant="secondary"
                onClick={() => play(sound.id, { variant: index + 1 })}
              >
                Play {sound.id} step {index + 1}
              </Button>
            ))
          ) : (
            <>
              <Button variant="secondary" onClick={() => play(sound.id)}>
                Play {sound.id}
              </Button>
              <Button
                variant="quiet"
                onClick={() => play(sound.id, { other: true })}
              >
                Play {sound.id} as another player&rsquo;s
              </Button>
            </>
          )}
        </div>
      ))}
    </section>
  );
}

export default function SoundLab() {
  const { available, state, settings, setVolume, setMuted } =
    useSoundControls();
  const [banks, setBanks] = useState<[SoundGroup, SoundBank][]>([]);
  const [{ groups, problem }] = useState(() =>
    chooseBanks(
      window.location.search,
      Object.keys(SOUND_BANKS) as SoundGroup[],
    ),
  );

  useEffect(() => {
    let live = true;
    void Promise.all(
      groups.map(async (group) => [group, await SOUND_BANKS[group]()] as const),
    ).then((loaded) => {
      if (live) setBanks(loaded.map(([group, bank]) => [group, bank]));
    });
    return () => {
      live = false;
    };
  }, [groups]);

  const { volume, muted } = settings.effects;
  return (
    <div className={`zumpo zumpo-page ${styles.page}`}>
      <Wordmark />
      <h1 className={styles.title}>Sound lab</h1>
      <p className={styles.lede}>
        Every sound in audio/sounds.json, through the engine and the settings
        the app uses. Nothing plays until the first click or key anywhere on the
        page. Add ?bank=hush,ui to keep only those banks, as a game&rsquo;s page
        does.
      </p>
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <dl className={styles.status}>
        <dt>Engine</dt>
        <dd data-testid="engine-state">{available ? state : 'unsupported'}</dd>
      </dl>
      <div className={styles.controls}>
        <label className={styles.control}>
          Effects volume
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(event) =>
              setVolume('effects', Number(event.target.value) / 100)
            }
          />
          <output>{Math.round(volume * 100)}%</output>
        </label>
        <label className={styles.control}>
          <input
            type="checkbox"
            checked={muted}
            onChange={(event) => setMuted('effects', event.target.checked)}
          />
          Mute effects
        </label>
      </div>
      {banks.map(([group, bank]) => (
        <Bank key={group} group={group} bank={bank} />
      ))}
    </div>
  );
}
