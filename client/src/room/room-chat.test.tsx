import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../../shared/wire-types';
import { LocaleProvider } from '../i18n';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { ME, minesweeperState } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';
import { chatLines } from './chat-lines';
import { usePageTitle } from '../shell/use-page-title';
import { useTurnTitle } from './use-turn-title';

const joined = (id: number, name: string): ChatMessage => ({
  id,
  kind: 'system',
  notice: { type: 'room:joined', name },
});
const said = (id: number, playerId: string, text: string): ChatMessage => ({
  id,
  kind: 'player',
  playerId,
  username: playerId === ME ? 'Ryan' : 'Maya',
  text,
});

describe('chat lines', () => {
  it('makes one line of a run of joins', () => {
    const messages = [
      joined(1, 'Ana'),
      joined(2, 'Ben'),
      joined(3, 'Cam'),
      said(4, 'p2', 'hi'),
      joined(5, 'Dee'),
    ];
    expect(chatLines(messages, ME, en).map((line) => line.text)).toEqual([
      'Ana, Ben and Cam have joined the room.',
      'hi',
      'Dee has joined the room.',
    ]);
    expect(chatLines(messages, ME, zh)[0]!.text).toBe(
      'Ana、Ben 和 Cam 加入了房间。',
    );
    // The merged line stands for everything up to its newest join.
    expect(chatLines(messages, ME, en)[0]).toMatchObject({ key: 1, id: 3 });
  });

  it('marks the viewer’s close Draw & Guess guess, and words the room’s notice', () => {
    const messages: ChatMessage[] = [
      { ...said(1, ME, 'turtel'), audience: 'sender', close: true },
      { id: 2, kind: 'system', notice: { type: 'dg:close', name: 'Ryan' } },
    ];
    expect(chatLines(messages, ME, en)).toEqual([
      {
        key: 1,
        id: 1,
        kind: 'close',
        name: 'You',
        text: 'turtel',
        note: 'So close!',
        mine: true,
      },
      {
        key: 2,
        id: 2,
        kind: 'system',
        text: 'Ryan is close!',
        mine: false,
      },
    ]);
    expect(
      chatLines(messages, ME, zh).map(({ name, text, note }) => ({
        name,
        text,
        note,
      })),
    ).toEqual([
      { name: '你', text: 'turtel', note: '很接近了！' },
      { name: undefined, text: 'Ryan 很接近了！', note: undefined },
    ]);
  });
});

describe('the phone’s Chat tab', () => {
  it('counts what others said while it was out of sight, and clears once read', async () => {
    const user = userEvent.setup();
    onPhone();
    const { fake } = await renderSeated(
      minesweeperState({ isGameStarted: true }),
    );
    const send = (message: ChatMessage) =>
      act(() => fake.serverEmits('chat:message', 'r1', message));

    send(said(1, ME, 'mine'));
    send({
      id: 2,
      kind: 'system',
      notice: {
        type: 'ms:mines',
        round: 1,
        hits: [{ name: 'Maya', points: -20 }],
      },
    });
    // Nothing worth a mark: the viewer's own line, a quiet round line.
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();

    send(said(3, 'p2', 'hello'));
    send(said(4, 'p2', 'anyone?'));
    expect(screen.getByRole('tab', { name: 'Chat, 2 new' })).toHaveTextContent(
      '2',
    );

    await user.click(screen.getByRole('tab', { name: 'Chat, 2 new' }));
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    send(said(5, 'p2', 'seen right away'));
    await user.click(screen.getByRole('tab', { name: 'Game' }));
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();

    // A reconnect brings the whole history back, with what was said while
    // the connection was down: that is news too.
    act(() =>
      fake.serverEmits('chat:history', 'r1', [
        said(1, ME, 'mine'),
        said(3, 'p2', 'hello'),
        said(4, 'p2', 'anyone?'),
        said(5, 'p2', 'seen right away'),
        said(6, 'p2', 'you there?'),
        said(7, 'p2', 'hello??'),
      ]),
    );
    expect(screen.getByRole('tab', { name: 'Chat, 2 new' })).toHaveTextContent(
      '2',
    );
  });
});

/** The tab goes to the background, or comes back. */
const hide = (hidden: boolean) => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
};

/** The room page and its game's room, as they sit in the tree. */
const room = ({ name, turn }: { name: string; turn: boolean }) => {
  usePageTitle(name, 'Liar’s Dice');
  useTurnTitle(turn);
};

describe('the turn title', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it is the viewer’s turn in a background tab, and takes it back', () => {
    const { rerender, unmount } = renderHook(room, {
      initialProps: { name: 'Friday table', turn: true },
      wrapper: LocaleProvider,
    });
    expect(document.title).toBe('Friday table · Liar’s Dice · Zumpo');

    hide(true);
    expect(document.title).toBe(
      '(!) Your turn · Friday table · Liar’s Dice · Zumpo',
    );
    hide(false);
    expect(document.title).toBe('Friday table · Liar’s Dice · Zumpo');

    hide(true);
    rerender({ name: 'Friday table', turn: false });
    expect(document.title).toBe('Friday table · Liar’s Dice · Zumpo');

    // Leaving the room mid-turn, with the tab still hidden, takes it off too.
    rerender({ name: 'Friday table', turn: true });
    expect(document.title).toContain('(!) Your turn');
    unmount();
    expect(document.title).toBe('Friday table · Liar’s Dice · Zumpo');
  });

  it('keeps the signal when the room is renamed, and follows the new name', () => {
    const { rerender } = renderHook(room, {
      initialProps: { name: 'Friday table', turn: true },
      wrapper: LocaleProvider,
    });
    hide(true);
    rerender({ name: 'Late table', turn: true });
    expect(document.title).toBe(
      '(!) Your turn · Late table · Liar’s Dice · Zumpo',
    );
    hide(false);
    expect(document.title).toBe('Late table · Liar’s Dice · Zumpo');
  });

  it('shows the signal when the page mounts in an already hidden tab', () => {
    hide(true);
    renderHook(room, {
      initialProps: { name: 'Friday table', turn: true },
      wrapper: LocaleProvider,
    });
    expect(document.title).toBe(
      '(!) Your turn · Friday table · Liar’s Dice · Zumpo',
    );
  });
});
