import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import styles from './gallery.module.css';

interface FigmaNode {
  w: number;
  h: number;
}

interface FigmaFamily {
  node?: FigmaNode;
  variants?: { name: string; node: FigmaNode }[];
}

const families = new Map<string, Promise<FigmaFamily | null>>();

function loadFamily(file: string) {
  let family = families.get(file);
  if (!family) {
    family = fetch(`/__figma/components/${file}.json`)
      .then((response) =>
        response.ok ? (response.json() as Promise<FigmaFamily>) : null,
      )
      .catch(() => null);
    families.set(file, family);
  }
  return family;
}

export interface SpecimenProps {
  /** The family's file in design/figma/components, without .json; leave out
   * for a specimen Figma has no counterpart for, which is then not measured. */
  family?: string;
  /** The Figma variant name, such as "Style=Primary, State=Default". */
  variant?: string;
  /** Caption; defaults to the variant name. */
  label?: string;
  /** Width of the slot, for components that fill their container in Figma. */
  width?: number;
  /** Compare the rendered height only, for content-sized widths. */
  heightOnly?: boolean;
  /** Why code differs from Figma on purpose, and by how much: within that
   * difference the size is shown as a known deviation, outside it as a
   * mismatch, so the reason cannot hide a regression or outlive its cause. */
  deviation?: Deviation;
  /** Why Figma has no size for this specimen though the family has one, such
   * as a boolean property its variants leave off: it is not compared, and
   * the reason is in its caption. */
  uncompared?: string;
  children: ReactNode;
}

export interface Deviation {
  reason: string;
  /** Code's width less Figma's, in px. */
  dw?: number;
  /** Code's height less Figma's, in px. */
  dh?: number;
}

/**
 * One component state, captioned with its Figma variant, and measured against
 * the export: a mismatch of more than half a pixel is flagged. In a phone-wide
 * window components take their phone sizes, which Figma has no variants for,
 * so there the size is shown but not compared.
 */
export function Specimen({
  family,
  variant,
  label,
  width,
  heightOnly,
  deviation,
  uncompared,
  children,
}: SpecimenProps) {
  const slot = useRef<HTMLDivElement>(null);
  const phone = useMediaQuery(PHONE);
  const [check, setCheck] = useState<{
    figma: FigmaNode;
    code: FigmaNode;
    /** Measured at phone width, where Figma has nothing to compare with. */
    phone: boolean;
  } | null>(null);
  /** Done measuring, whether or not Figma had a size to compare with. */
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (!family) return;
    let live = true;
    void Promise.all([
      loadFamily(family),
      document.fonts.ready,
      settled(slot.current),
    ]).then(([data]) => {
      let element = slot.current?.firstElementChild;
      // A component whose root lays out as contents is measured by what
      // it draws.
      while (element && getComputedStyle(element).display === 'contents') {
        element = element.firstElementChild;
      }
      if (!live) return;
      setMeasured(true);
      if (!data || !element) return;
      if (uncompared) return;
      const figma = variant
        ? data.variants?.find((v) => v.name === variant)?.node
        : data.node;
      if (!figma) return;
      const rect = element.getBoundingClientRect();
      setCheck({ figma, code: { w: rect.width, h: rect.height }, phone });
    });
    return () => {
      live = false;
    };
  }, [family, variant, phone, uncompared]);

  const compared = check != null && !check.phone;
  const off = (dw: number, dh: number) =>
    check != null &&
    !check.phone &&
    ((!heightOnly && widthOff(check.figma.w, check.code.w - dw)) ||
      Math.abs(check.figma.h - (check.code.h - dh)) > 0.5);
  const differs = off(0, 0);
  const mismatch = deviation
    ? off(deviation.dw ?? 0, deviation.dh ?? 0)
    : differs;

  return (
    <figure
      className={styles.specimen}
      data-family={family}
      data-variant={variant}
      data-measured={measured || undefined}
      data-compared={compared || undefined}
      data-uncompared={uncompared}
      data-mismatch={mismatch || undefined}
      data-deviation={(differs && !mismatch && deviation) || undefined}
    >
      <div
        ref={slot}
        className={styles.slot}
        data-fill={width ? true : undefined}
        style={width ? ({ width } as CSSProperties) : undefined}
      >
        {children}
      </div>
      <figcaption className={styles.caption}>
        <span>{label ?? variant ?? 'Default'}</span>
        {check && (
          <span className={styles.size}>
            {differs
              ? `Figma ${check.figma.w} × ${check.figma.h} · code ${round(check.code.w)} × ${round(check.code.h)}`
              : `${round(check.code.w)} × ${round(check.code.h)}${check.phone ? '' : ' ✓'}`}
          </span>
        )}
        {uncompared && (
          <span className={styles.deviation}>Not compared: {uncompared}</span>
        )}
        {compared && deviation && (differs || mismatch) && (
          <span className={styles.deviation}>
            {deviation.reason}
            {mismatch && ` Expected code ${expected(deviation)}.`}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

// A specimen that animates as it mounts, as a Pairs card flips open, is
// measured once it comes to rest, not partway through. An animation that
// never ends has no resting size to wait for.
function settled(slot: HTMLElement | null) {
  const running = (slot?.getAnimations({ subtree: true }) ?? []).filter(
    (animation) => animation.effect?.getComputedTiming().endTime !== Infinity,
  );
  return Promise.all(running.map((animation) => animation.finished)).catch(
    () => undefined,
  );
}

// Figma sizes auto-width text to whole pixels, rounding up, so a row of
// text runs can be up to a pixel or two wider there than in the browser.
function widthOff(figma: number, code: number) {
  return code - figma > 0.5 || figma - code >= 2;
}

/** "7 px wider", "2 px shorter", "2 px narrower and 1 px taller". */
function expected({ dw = 0, dh = 0 }: Deviation) {
  const parts = [
    dw && `${Math.abs(dw)} px ${dw > 0 ? 'wider' : 'narrower'}`,
    dh && `${Math.abs(dh)} px ${dh > 0 ? 'taller' : 'shorter'}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : 'the same size';
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
