import { pickFrom } from '../../../shared/list';
import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../shell/use-media-query';
import styles from './confetti.module.css';

/** The brand's accents, and the sun brush for a little gold. */
const COLOURS = [
  '--zumpo-coral',
  '--zumpo-lime',
  '--zumpo-blue',
  '--zumpo-peach',
  '--zumpo-brush-sun',
];

const GRAVITY = 0.32;
const DRAG = 0.986;
/** How long a piece lives, and the last stretch of it spent fading. */
const LIFE_MS = 4200;
const FADE_MS = 900;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** Phase of the flip that makes a piece flutter as it falls. */
  flip: number;
  flipSpeed: number;
  width: number;
  height: number;
  round: boolean;
  colour: string;
  bornAt: number;
}

const between = (low: number, high: number) =>
  low + Math.random() * (high - low);

/**
 * Pieces from a cannon at the bottom corner of the window, fired up and in.
 * `side` is -1 for the left corner, 1 for the right.
 */
function volley(
  count: number,
  side: -1 | 1,
  width: number,
  height: number,
  colours: string[],
  now: number,
): Piece[] {
  // Fast enough to reach most of the way up whatever the window's height.
  const reach = Math.sqrt(2 * GRAVITY * height * 0.9);
  return Array.from({ length: count }, () => {
    const angle = (between(52, 78) * Math.PI) / 180;
    const speed = reach * between(0.75, 1.15);
    return {
      x: side < 0 ? between(-10, 30) : width - between(-10, 30),
      y: height + 10,
      vx: -side * Math.cos(angle) * speed,
      vy: -Math.sin(angle) * speed,
      angle: between(0, Math.PI * 2),
      spin: between(-0.2, 0.2),
      flip: between(0, Math.PI * 2),
      flipSpeed: between(0.08, 0.2),
      width: between(7, 11),
      height: between(10, 16),
      round: Math.random() < 0.25,
      colour: pickFrom(colours, Math.random),
      bornAt: now,
    };
  });
}

/**
 * A burst of confetti over the whole window, for a game's winner. It runs
 * once, then removes itself; with reduced motion asked for, it never starts.
 */
export function Confetti() {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const style = getComputedStyle(canvas);
    const colours = COLOURS.map((name) =>
      style.getPropertyValue(name).trim(),
    ).filter(Boolean);

    let width = 0;
    let height = 0;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);

    const start = performance.now();
    let pieces = [
      ...volley(90, -1, width, height, colours, start),
      ...volley(90, 1, width, height, colours, start),
    ];
    // A second, smaller volley as the first one peaks.
    let secondFired = false;

    let last = start;
    let frame = requestAnimationFrame(function draw(now) {
      // In frames of 60 per second, so a slow frame moves pieces as far.
      const steps = Math.min((now - last) / (1000 / 60), 3);
      last = now;
      if (!secondFired && now - start > 450) {
        secondFired = true;
        pieces.push(
          ...volley(45, -1, width, height, colours, now),
          ...volley(45, 1, width, height, colours, now),
        );
      }

      context.clearRect(0, 0, width, height);
      pieces = pieces.filter((piece) => {
        const age = now - piece.bornAt;
        if (age > LIFE_MS || piece.y > height + 40) return false;
        const drag = DRAG ** steps;
        piece.vx *= drag;
        piece.vy = piece.vy * drag + GRAVITY * steps;
        piece.x += piece.vx * steps;
        piece.y += piece.vy * steps;
        piece.angle += piece.spin * steps;
        piece.flip += piece.flipSpeed * steps;

        context.save();
        context.globalAlpha = Math.min(1, (LIFE_MS - age) / FADE_MS);
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        context.scale(1, Math.cos(piece.flip));
        context.fillStyle = piece.colour;
        if (piece.round) {
          context.beginPath();
          context.arc(0, 0, piece.width / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillRect(
            -piece.width / 2,
            -piece.height / 2,
            piece.width,
            piece.height,
          );
        }
        context.restore();
        return true;
      });

      if (pieces.length > 0 || !secondFired) {
        frame = requestAnimationFrame(draw);
      } else {
        setDone(true);
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', fit);
    };
  }, []);

  if (reducedMotion || done) return null;
  return <canvas ref={canvasRef} className={styles.confetti} aria-hidden />;
}
