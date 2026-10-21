import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  DoodleChainEntry,
  DoodleChainRoomState,
} from '../../../shared/wire-types';
import { doodleChainState, ME } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';

const RYAN = { playerId: ME, username: 'Ryan' };
const MAYA = { playerId: 'p2', username: 'Maya' };
const LEO = { playerId: 'p3', username: 'Leo' };

/** Leo's first line, as Ryan is given it at step 2. */
const leosLine: DoodleChainEntry = {
  chain: 2,
  step: 1,
  kind: 'prompt',
  author: LEO,
  content: { type: 'text', text: 'A turtle on a skateboard' },
  hearts: 0,
};

/** Step 1 of 3: everybody writes, nobody done yet. */
const writing = doodleChainState({
  isGameStarted: true,
  phase: 'write',
  step: 1,
  phaseEndsInMs: 30_000,
  table: {
    p1: { done: false, sitsOut: false },
    p2: { done: false, sitsOut: false },
    p3: { done: false, sitsOut: false },
  },
  task: { kind: 'prompt', chain: 0, sitsOut: false },
});

/** Step 2 of 3: Ryan draws Leo's line. */
const drawing = doodleChainState({
  ...writing,
  phase: 'draw',
  step: 2,
  phaseEndsInMs: 60_000,
  task: { kind: 'drawing', chain: 2, sitsOut: false, given: leosLine },
});

/** One stroke, as a drawing so far. */
const stroke = {
  color: '#000',
  size: 10,
  points: [
    { x: 10, y: 10 },
    { x: 50, y: 40 },
  ],
};

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^(Players|Hearts)/ }));

/** Ryan's chain as far as the reveal has shown it, Maya's drawing last. */
const ryansChain: DoodleChainEntry[] = [
  {
    chain: 0,
    step: 1,
    kind: 'prompt',
    author: RYAN,
    content: { type: 'text', text: 'A cat riding a bicycle' },
    hearts: 1,
  },
  {
    chain: 0,
    step: 2,
    kind: 'drawing',
    author: MAYA,
    content: { type: 'drawing', drawing: 'd1' },
    hearts: 2,
  },
];

function revealing(
  overrides: Partial<DoodleChainRoomState> = {},
): DoodleChainRoomState {
  return doodleChainState({
    isGameStarted: true,
    phase: 'reveal',
    step: 3,
    table: {},
    reveal: {
      chain: 0,
      shown: 2,
      total: 2,
      chains: [
        { owner: RYAN, length: 3 },
        { owner: MAYA, length: 3 },
        { owner: LEO, length: 3 },
      ],
      entries: [ryansChain],
      hearts: {},
    },
    ...overrides,
  });
}

describe('a Doodle Chain room', () => {
  it('says how the game goes with this many players, and lets the host start', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(doodleChainState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(
      screen.getByText(
        /^3 players, so 3 steps: write, draw, describe\. 60s to draw; about \d+ minutes? with the reveal\./,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('asks for a third player', async () => {
    const { playerList } = doodleChainState();
    await renderSeated(
      doodleChainState({
        currentPlayerCount: 2,
        steps: 2,
        playerList: { p1: playerList.p1!, p2: playerList.p2! },
      }),
    );

    expect(screen.getByText('One more to start.')).toBeInTheDocument();
    expect(screen.getByText(/Invite one more\.$/)).toBeInTheDocument();
  });

  it('writes the first line, sends it as it is typed, and is done with it', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(writing);

    expect(turn().getByText('Step 1 of 3')).toBeInTheDocument();
    expect(turn().getByText('Write the first line')).toBeInTheDocument();
    expect(turn().getByText('Maya draws it next.')).toBeInTheDocument();
    expect(scoreboard().getAllByText('Writing')).toHaveLength(3);
    // Nobody has a heart until the reveal.
    expect(scoreboard().queryByText(/^\d+$/)).toBeNull();

    // A blank line cannot be Done, by the button or by Enter.
    const field = screen.getByRole('textbox', { name: 'Your first line' });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('aria-disabled', 'true');
    await user.click(done);
    await user.type(field, '{Enter}');
    expect(fake.sentArgs('dc:done')).toEqual([]);

    await user.type(field, 'A');
    expect(done).not.toHaveAttribute('aria-disabled', 'true');
    expect(fake.sentArgs('dc:text')[0]).toEqual(['r1', { text: 'A' }]);
    expect(
      screen.getByText('1 / 80 · anything drawable, in any language'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    expect((field as HTMLInputElement).value).not.toBe('A');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    // Done sends the latest words first, then says it is done.
    expect(fake.sentArgs('dc:text').at(-1)?.[1]).toHaveProperty('suggestion');
    expect(fake.sentArgs('dc:done')).toEqual([['r1', true]]);

    update({
      ...writing,
      table: { ...writing.table, p1: { done: true, sitsOut: false } },
    });
    expect(
      screen.getByText('Done. Waiting for Maya and Leo.'),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Done')).toBeInTheDocument();
    // Done takes the field and itself away, so Keep editing has the focus.
    const keepEditing = screen.getByRole('button', { name: 'Keep editing' });
    expect(keepEditing).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(fake.sentArgs('dc:done').at(-1)).toEqual(['r1', false]);
    update(writing);
    expect(field).toHaveFocus();
  });

  it('cannot be done with a line of only spaces', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(writing);
    const field = screen.getByRole('textbox', { name: 'Your first line' });

    await user.type(field, '   {Enter}');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(fake.sentArgs('dc:done')).toEqual([]);
  });

  it('names nobody next when the next player has left', async () => {
    const { playerList, table } = writing;
    await renderSeated({
      ...writing,
      playerList: { p1: playerList.p1!, p3: playerList.p3! },
      table: { p1: table.p1!, p3: table.p3! },
    });

    expect(
      turn().getByText('The chains stay secret until the reveal.'),
    ).toBeInTheDocument();
    expect(turn().queryByText(/Maya/)).toBeNull();
  });

  it('picks up the words already sent when it comes back mid-step', async () => {
    await renderSeated({ ...writing, draft: { text: 'A ghost doing' } });

    expect(
      screen.getByRole('textbox', { name: 'Your first line' }),
    ).toHaveValue('A ghost doing');
  });

  it('draws the words it was given, on the canvas', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(drawing);

    expect(turn().getByText('Draw this')).toBeInTheDocument();
    expect(turn().getByText('A turtle on a skateboard')).toBeInTheDocument();
    expect(turn().getByText('Maya describes it next.')).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing canvas')).toBeInTheDocument();
    expect(
      screen.getByText(
        'When the clock runs out, your drawing goes on as it is.',
      ),
    ).toBeInTheDocument();
    expect(scoreboard().getAllByText('Drawing')).toHaveLength(3);

    // An empty drawing cannot be Done.
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done).toHaveAttribute('aria-disabled', 'true');
    await user.click(done);
    expect(fake.sentArgs('dc:done')).toEqual([]);
    act(() => fake.serverEmits('dc:canvas:sync', 'r1', [stroke]));
    expect(done).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(done);
    expect(fake.sentArgs('dc:done')).toEqual([['r1', true]]);
  });

  it('keeps the focus through a drawing being done and edited again', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(drawing);
    const finished = {
      ...drawing,
      table: { ...drawing.table, p1: { done: true, sitsOut: false } },
    };

    act(() => fake.serverEmits('dc:canvas:sync', 'r1', [stroke]));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    update(finished);
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(fake.sentArgs('dc:done').at(-1)).toEqual(['r1', false]);
    update(drawing);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
  });

  it('describes a drawing once its strokes have come, as the last step', async () => {
    const { fake } = await renderSeated({
      ...writing,
      phase: 'describe',
      step: 3,
      task: {
        kind: 'description',
        chain: 1,
        sitsOut: false,
        given: {
          chain: 1,
          step: 2,
          kind: 'drawing',
          author: LEO,
          content: { type: 'drawing', drawing: 'd7' },
          hearts: 0,
        },
      },
    });

    expect(
      turn().getByText('What does this drawing show?'),
    ).toBeInTheDocument();
    expect(
      turn().getByText('Yours is the last step of this chain.'),
    ).toBeInTheDocument();
    const given = screen.getByRole('img', {
      name: 'The drawing you were given',
    });
    expect(given.querySelector('path')).toBeNull();

    act(() =>
      fake.serverEmits('dc:drawing', 'r1', 'd7', [
        {
          color: '#000',
          size: 10,
          points: [
            { x: 10, y: 10 },
            { x: 50, y: 40 },
          ],
        },
      ]),
    );
    expect(given.querySelector('path')).toHaveAttribute('d', 'M10 10L50 40');
    expect(
      screen.getByRole('textbox', { name: 'Your description' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suggest' })).toBeNull();
  });

  it('sits a step out when the entry before came back empty', async () => {
    await renderSeated({
      ...drawing,
      table: { ...drawing.table, p1: { done: false, sitsOut: true } },
      task: {
        kind: 'drawing',
        chain: 2,
        sitsOut: true,
        skipped: {
          ...leosLine,
          content: { type: 'empty', reason: 'left' },
        },
      },
    });

    expect(turn().getByText('You sit this step out')).toBeInTheDocument();
    expect(turn().getByText('You’re back in step 3.')).toBeInTheDocument();
    expect(screen.getByText('Nothing to draw')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Leo left the game, so Leo’s chain skips this step and goes on to Maya.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Drawing canvas')).toBeNull();
    expect(scoreboard().getByText('Sits this step out')).toBeInTheDocument();
  });

  it('shows a spectator how far the step is, and no chain', async () => {
    const { playerList } = drawing;
    await renderSeated({
      ...drawing,
      task: undefined,
      playerList: {
        p2: playerList.p2!,
        p3: playerList.p3!,
        p4: { username: 'Sam', points: 0, isConnected: true },
      },
      spectators: { p1: { username: 'Ryan', isConnected: true } },
      table: {
        p2: { done: true, sitsOut: false },
        p3: { done: false, sitsOut: false },
        p4: { done: false, sitsOut: false },
      },
    });

    expect(turn().getByText('Everybody is drawing')).toBeInTheDocument();
    expect(
      turn().getByText('The chains stay secret until the reveal.'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 of 3 done')).toBeInTheDocument();
    expect(screen.getByText('Drawing, 60s a step')).toBeInTheDocument();
    expect(screen.queryByLabelText('Drawing canvas')).toBeNull();
  });

  it('passes the chains on when the clock runs out', async () => {
    await renderSeated({
      ...writing,
      phase: 'passing',
      phaseEndsInMs: 3_000,
    });

    expect(turn().getByText('Time’s up!')).toBeInTheDocument();
    expect(turn().getByText('Your line goes to Maya.')).toBeInTheDocument();
    expect(turn().getByText('to step 2')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Passing the chains on. Next: draw the words you are given.',
      ),
    ).toBeInTheDocument();
    expect(scoreboard().getAllByText('Passing')).toHaveLength(3);
  });

  it('lets the host show the next entry, and a player give a heart', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(revealing());

    expect(turn().getByText('Reveal · chain 1 of 3')).toBeInTheDocument();
    expect(turn().getByText('Ryan’s chain')).toBeInTheDocument();
    expect(turn().getByText('2 of 3 shown')).toBeInTheDocument();
    expect(screen.getByText('A cat riding a bicycle')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Maya’s drawing' })).toBeVisible();
    // Your own entry only shows its count.
    expect(screen.getByRole('img', { name: '1 heart' })).toBeInTheDocument();
    expect(
      screen.getByText('Next shows the last of Ryan’s chain.'),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Showing the chains')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Give a heart, 2 hearts so far' }),
    );
    expect(fake.sentArgs('dc:heart')).toEqual([['r1', 0, 2]]);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(fake.sentArgs('dc:reveal:next')).toEqual([['r1', 2]]);
  });

  it('takes a heart back, and tells a guest who is showing the chains', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(
      revealing({
        owner: MAYA,
        reveal: { ...revealing().reveal!, shown: 3, hearts: { 0: 2 } },
      }),
    );

    expect(screen.queryByRole('button', { name: /^Next/ })).toBeNull();
    expect(
      screen.getByText('Maya is showing the chains. Maya’s chain is next.'),
    ).toBeInTheDocument();
    const heart = screen.getByRole('button', {
      name: 'Give a heart, 2 hearts so far',
    });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    await user.click(heart);
    expect(fake.sentArgs('dc:heart')).toEqual([['r1', 0, null]]);
  });

  it('keeps the album of every chain, with the crowd favourite', async () => {
    const user = userEvent.setup();
    const mayasChain: DoodleChainEntry[] = [
      {
        chain: 1,
        step: 1,
        kind: 'prompt',
        author: MAYA,
        content: { type: 'suggestion', suggestion: 0 },
        hearts: 0,
      },
      {
        chain: 1,
        step: 2,
        kind: 'drawing',
        author: LEO,
        content: { type: 'empty', reason: 'time' },
        hearts: 0,
      },
    ];
    await renderSeated(
      doodleChainState({
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 2 },
            { playerId: ME, username: 'Ryan', points: 1 },
            { playerId: 'p3', username: 'Leo', points: 0 },
          ],
          chains: [
            { owner: RYAN, entries: ryansChain },
            { owner: MAYA, entries: mayasChain },
          ],
          favourites: [{ chain: 0, step: 2 }],
        },
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'That’s every chain.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 chains, 4 entries. Maya’s drawing is the crowd favourite, with 2 hearts.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Crowd favourite')).toHaveLength(2);
    expect(scoreboard().getByText('2nd')).toBeInTheDocument();
    // Leo was given no hearts, so he has no place.
    expect(scoreboard().getByText('No hearts')).toBeInTheDocument();
    expect(scoreboard().queryByText('3rd')).toBeNull();
    expect(screen.getByRole('img', { name: '1 heart' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Maya’s chain' }));
    expect(screen.getByText('A cat riding a bicycle')).toBeInTheDocument();
    expect(screen.getByText('ran out of time')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Play again' }),
    ).toBeInTheDocument();
  });

  it('gives nobody a place when nobody gave a heart', async () => {
    await renderSeated(
      doodleChainState({
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 0 },
            { playerId: ME, username: 'Ryan', points: 0 },
            { playerId: 'p3', username: 'Leo', points: 0 },
          ],
          chains: [{ owner: RYAN, entries: ryansChain }],
          favourites: [],
        },
      }),
    );

    expect(screen.getByText(/Nobody gave a heart this time\.$/)).toBeVisible();
    expect(scoreboard().getAllByText('No hearts')).toHaveLength(3);
    expect(scoreboard().queryByText(/^1st$|Crowd favourite/)).toBeNull();
  });
});
