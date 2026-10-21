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
    await user.click(screen.getByRole('tab', { name: 'Board' }));
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
  });
});

/** The tab goes to the background, or comes back. */
const hide = (hidden: boolean) => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(hidden);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
};

describe('the turn title', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.title = 'Zumpo';
  });

  it('says it is the viewer’s turn in a background tab, and gives the title back', () => {
    document.title = 'Friday table · Zumpo';
    const { rerender } = renderHook(({ turn }) => useTurnTitle(turn), {
      initialProps: { turn: true },
      wrapper: LocaleProvider,
    });
    expect(document.title).toBe('Friday table · Zumpo');

    hide(true);
    expect(document.title).toBe('(!) Your turn · Zumpo');
    hide(false);
    expect(document.title).toBe('Friday table · Zumpo');

    hide(true);
    rerender({ turn: false });
    expect(document.title).toBe('Friday table · Zumpo');
  });
});
