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
  /** Why code differs from Figma on purpose: the size is then shown as a
   * known deviation, not a mismatch. */
  deviation?: string;
  children: ReactNode;
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
  }, [family, variant, phone]);

  const differs =
    check != null &&
    !check.phone &&
    ((!heightOnly && widthOff(check.figma.w, check.code.w)) ||
      Math.abs(check.figma.h - check.code.h) > 0.5);
  const mismatch = differs && !deviation;

  return (
    <figure
      className={styles.specimen}
      data-family={family}
      data-variant={variant}
      data-measured={measured || undefined}
      data-mismatch={mismatch || undefined}
      data-deviation={(differs && deviation) || undefined}
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
        {differs && deviation && (
          <span className={styles.deviation}>{deviation}</span>
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

function round(value: number) {
  return Math.round(value * 10) / 10;
}
