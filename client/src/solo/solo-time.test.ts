import { describe, expect, it } from 'vitest';
import { PausableClock } from './solo-time';

describe('PausableClock', () => {
  it('runs with the wall clock and stands still while paused', () => {
    let wall = 1000;
    const clock = new PausableClock(() => wall);
    expect(clock.now()).toBe(1000);

    wall = 2000;
    clock.pause();
    expect(clock.paused).toBe(true);
    wall = 6000;
    expect(clock.now()).toBe(2000);

    clock.resume();
    expect(clock.paused).toBe(false);
    expect(clock.now()).toBe(2000);
    wall = 7000;
    expect(clock.now()).toBe(3000);
  });

  it('takes off every pause, and ignores a second pause or resume', () => {
    let wall = 0;
    const clock = new PausableClock(() => wall);
    clock.pause();
    wall = 500;
    clock.pause();
    wall = 1000;
    clock.resume();
    clock.resume();
    wall = 2000;
    clock.pause();
    wall = 2500;
    clock.resume();
    wall = 3000;
    expect(clock.now()).toBe(1500);
  });
});
