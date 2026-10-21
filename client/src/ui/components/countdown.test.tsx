import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Countdown, formatClock } from './countdown';

describe('formatClock', () => {
  it('shows minutes and seconds, zero padded', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(72)).toBe('1:12');
  });

  it('rounds a part second up, so the clock never shows 0 while time is left', () => {
    expect(formatClock(4.2)).toBe('0:05');
    expect(formatClock(0.1)).toBe('0:01');
  });

  it('never goes below zero', () => {
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('Countdown', () => {
  it('reads as one timer with its purpose', () => {
    render(<Countdown seconds={15} label="to pick" />);
    expect(screen.getByRole('timer')).toHaveTextContent('0:15to pick');
  });
});

/** The tone the timer takes. */
const toneOf = (props: {
  deadline?: boolean;
  waiting?: boolean;
  seconds: number;
}) => {
  const { unmount } = render(<Countdown label="to a hint" {...props} />);
  const tone = screen.getByRole('timer').dataset['tone'];
  unmount();
  return tone;
};

describe('Countdown tones', () => {
  it('turns urgent in the last seconds of a deadline', () => {
    expect(toneOf({ seconds: 12 })).toBe('running');
    expect(toneOf({ seconds: 3 })).toBe('urgent');
    expect(toneOf({ seconds: 12, waiting: true })).toBe('waiting');
  });

  it('draws a clock that is no deadline apart, and never urgent', () => {
    expect(toneOf({ seconds: 12, deadline: false })).toBe('info');
    expect(toneOf({ seconds: 3, deadline: false })).toBe('info');
    expect(toneOf({ seconds: 3, deadline: false, waiting: true })).toBe(
      'info',
    );
  });
});
