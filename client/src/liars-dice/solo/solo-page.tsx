import { useEffect, useState, type FormEvent } from 'react';
import {
  DICE_PER_PLAYER,
  type DicePerPlayer,
} from '../../../../shared/liars-dice';
import {
  BidPicker,
  Button,
  ButtonLink,
  Card,
  SelectField,
  StatList,
  TurnBar,
  type TurnBarProps,
} from '../../ui';
import { gameInfo } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { useSession } from '../../net/session';
import { listNames, ordinal } from '../../room/players';
import { FormPage } from '../../shell/form-page';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useBidChoice } from '../bid-choice';
import { Table, type TableSeat } from '../table';
import { bidLine, naming, revealBar, type Naming } from '../words';
import {
  BOT_NAMES,
  BOT_TURN_MS,
  bid,
  call,
  currentBid,
  diceOnTable,
  isBotTurn,
  MAX_BOTS,
  MIN_BOTS,
  newGame,
  nextRound,
  placeOf,
  playBot,
  YOU,
  youWon,
  type SoloGame,
  type SoloPicks,
} from './game';
import { soloRandom } from './random';
import {
  readPicks,
  readRecord,
  recordGame,
  writePicks,
  type LiarsDiceRecord,
} from './record';
import styles from './solo-page.module.css';

const BOT_COUNTS = Array.from(
  { length: MAX_BOTS - MIN_BOTS + 1 },
  (_, index) => MIN_BOTS + index,
);

/** "5 of 10 games won", or nothing before the first game. */
function recordLine(record: LiarsDiceRecord, m: Messages): string | null {
  if (record.games === 0) return null;
  return m.liarsDice.solo.record(record.wins, record.games, record.run);
}

/**
 * LD01-LD06, LD13: Liar's Dice on your own, against bots. It all runs here:
 * nothing reaches the server.
 */
export function LiarsDiceSolo() {
  // Each game is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState<{
    picks: SoloPicks;
    game: number;
  } | null>(null);
  if (playing === null) {
    return (
      <TablePicker
        onStart={(picks) => {
          writePicks(picks);
          setPlaying({ picks, game: 0 });
        }}
      />
    );
  }
  return (
    <SoloTable
      key={playing.game}
      picks={playing.picks}
      onPlayAgain={() => setPlaying({ ...playing, game: playing.game + 1 })}
      onChangeTable={() => setPlaying(null)}
    />
  );
}

/** LD01: how many bots, and how many dice each. */
function TablePicker({ onStart }: { onStart: (picks: SoloPicks) => void }) {
  const game = gameInfo('liars-dice');
  const m = useMessages();
  const text = m.games.of[game.type];
  const [picks, setPicks] = useState(readPicks);
  const description =
    recordLine(readRecord(), m) ?? m.liarsDice.solo.description;
  return (
    <FormPage
      heading={{
        eyebrow: m.solo.onYourOwn,
        title: text.name,
        subtitle: text.solo?.summary,
      }}
      phone={{ eyebrow: text.name, subtitle: description }}
      title={m.liarsDice.solo.pickTable}
      description={description}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onStart(picks);
      }}
      actions={
        <>
          <Button type="submit">{m.liarsDice.solo.start}</Button>
          <ButtonLink to="/" variant="secondary" icon="back">
            {m.shell.backToGames}
          </ButtonLink>
        </>
      }
    >
      <SelectField
        label={m.liarsDice.solo.bots}
        helper={m.liarsDice.solo.botsHelper(BOT_NAMES)}
        options={BOT_COUNTS.map((count) => ({
          value: count,
          label: m.liarsDice.solo.botCount(count),
        }))}
        value={picks.bots}
        onValueChange={(bots: number) => setPicks({ ...picks, bots })}
        name="bots"
      />
      <SelectField
        label={m.liarsDice.solo.diceEach}
        helper={
          picks.dicePerPlayer === 3
            ? m.liarsDice.solo.quick
            : m.liarsDice.solo.classic
        }
        options={DICE_PER_PLAYER.map((count) => ({
          value: count,
          label: m.liarsDice.solo.diceCount(count),
        }))}
        value={picks.dicePerPlayer}
        onValueChange={(dicePerPlayer: DicePerPlayer) =>
          setPicks({ ...picks, dicePerPlayer })
        }
        name="dicePerPlayer"
      />
    </FormPage>
  );
}

/** Everybody at the table, as the table draws them. */
const seatsOf = (game: SoloGame, yourName: string): TableSeat[] =>
  game.seats.map((seat) => ({
    id: seat.id,
    name: seat.id === YOU ? yourName : seat.id,
    diceLeft: seat.diceLeft,
    // Your own dice always; the bots' only when a call opens the cups.
    dice: seat.id === YOU || game.reveal ? seat.dice : null,
    outInRound: seat.outInRound,
  }));

const whoIn = (m: Messages): Naming => naming(YOU, (id) => id, m);

/** LD02-LD06: one game, from the first roll to your last die or theirs. */
function SoloTable({
  picks,
  onPlayAgain,
  onChangeTable,
}: {
  picks: SoloPicks;
  onPlayAgain: () => void;
  onChangeTable: () => void;
}) {
  const m = useMessages();
  const { name } = useSession();
  const [game, setGame] = useState(() => newGame(picks, soloRandom));
  const [record, setRecord] = useState<LiarsDiceRecord | null>(null);
  const over = game.phase === 'over';

  /** Moves the game on, counting it on this device once it is over. */
  const advance = (next: SoloGame) => {
    setGame(next);
    if (next.phase === 'over' && next !== game) {
      setRecord(recordGame(youWon(next)));
    }
  };

  // A bot takes about a second over its turn, so every bid can be read.
  useEffect(() => {
    if (!isBotTurn(game)) return;
    const timer = setTimeout(() => {
      const next = playBot(game, soloRandom);
      setGame(next);
      if (next.phase === 'over') setRecord(recordGame(youWon(next)));
    }, BOT_TURN_MS);
    return () => clearTimeout(timer);
  }, [game]);

  const you = game.seats.find((seat) => seat.id === YOU)!;
  const { place, of } = placeOf(game);
  const stillIn = game.seats
    .filter((seat) => seat.diceLeft > 0)
    .map((seat) => seat.id);
  const shown = record ?? readRecord();

  return (
    <SoloLayout
      gameType="liars-dice"
      phase={
        over
          ? youWon(game)
            ? { tone: 'lime', label: m.liarsDice.solo.youWon }
            : { tone: 'peach', label: m.liarsDice.out }
          : { tone: 'blue', label: m.liarsDice.round(game.round) }
      }
      stage={
        <>
          {over ? (
            <SoloResult
              title={
                youWon(game)
                  ? m.liarsDice.solo.wonIn(game.round)
                  : m.liarsDice.solo.outIn(ordinal(place, m), of)
              }
              body={
                youWon(game)
                  ? m.liarsDice.solo.lastAtTable(you.diceLeft)
                  : m.liarsDice.solo.stillIn(
                      listNames(stillIn, m),
                      stillIn.length,
                      game.round,
                    )
              }
              stats={[
                {
                  label: m.liarsDice.solo.place,
                  value: m.liarsDice.solo.placeOf(ordinal(place, m), of),
                },
                { label: m.liarsDice.solo.rounds, value: String(game.round) },
                {
                  label: m.liarsDice.solo.gamesWon,
                  value: m.liarsDice.solo.gamesWonCount(
                    shown.wins,
                    shown.games,
                  ),
                },
              ]}
              actions={
                <>
                  <Button onClick={onPlayAgain}>{m.room.playAgain}</Button>
                  <Button variant="secondary" onClick={onChangeTable}>
                    {m.liarsDice.solo.changeTable}
                  </Button>
                </>
              }
            />
          ) : (
            <TurnBar {...turnBar(game, m)} />
          )}
          <Table
            seats={seatsOf(game, name)}
            youId={YOU}
            dicePerPlayer={game.dicePerPlayer}
            turnId={game.turnId}
            nextId={null}
            bids={game.bids}
            reveal={game.reveal}
            who={whoIn(m)}
            countLabel={over ? m.liarsDice.lastCall : m.liarsDice.count}
            beside={
              game.phase === 'reveal' ? (
                <div className={styles.next}>
                  <Button onClick={() => advance(nextRound(game, soloRandom))}>
                    {m.liarsDice.solo.nextRound}
                  </Button>
                </div>
              ) : game.phase === 'bidding' && game.turnId === YOU ? (
                <YourMove game={game} onMove={advance} />
              ) : undefined
            }
          />
        </>
      }
      side={
        <>
          {!over && (
            <Card kind="panel" title={m.liarsDice.solo.thisGame}>
              <StatList
                className={styles.stats}
                stats={[
                  { label: m.liarsDice.solo.round, value: String(game.round) },
                  {
                    label: m.liarsDice.solo.diceOnTable,
                    value: String(diceOnTable(game)),
                  },
                  {
                    label: m.liarsDice.solo.yourDice,
                    value: String(you.diceLeft),
                  },
                ]}
              />
            </Card>
          )}
          <Card kind="panel" title={m.liarsDice.solo.onDevice}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.liarsDice.solo.gamesWon,
                  value:
                    shown.games === 0
                      ? m.liarsDice.solo.notYet
                      : m.liarsDice.solo.gamesWonCount(shown.wins, shown.games),
                  tone: shown.games === 0 ? 'muted' : undefined,
                },
                {
                  label: m.liarsDice.solo.currentRun,
                  value:
                    shown.games === 0
                      ? m.liarsDice.solo.notYet
                      : m.liarsDice.solo.wins(shown.run),
                  tone:
                    shown.games === 0
                      ? 'muted'
                      : record && youWon(game)
                        ? 'green'
                        : undefined,
                },
              ]}
            />
          </Card>
        </>
      }
    />
  );
}

/** LD02: the bid picker on your turn. */
function YourMove({
  game,
  onMove,
}: {
  game: SoloGame;
  onMove: (next: SoloGame) => void;
}) {
  const m = useMessages();
  const latest = currentBid(game);
  const mine = game.seats.find((seat) => seat.id === YOU)?.dice ?? [];
  const picker = useBidChoice(latest, diceOnTable(game), mine, (raise) =>
    onMove(bid(game, YOU, raise)),
  );
  const onCall = latest ? () => onMove(call(game, YOU)) : undefined;
  if (!picker) {
    return (
      <div className={styles.next}>
        <Button variant="danger" onClick={onCall}>
          {m.liarsDice.callLiar}
        </Button>
      </div>
    );
  }
  return <BidPicker {...picker} onCall={onCall} />;
}

function turnBar(game: SoloGame, m: Messages): TurnBarProps {
  const who = whoIn(m);
  if (game.phase === 'reveal' && game.reveal) {
    return { ...revealBar(game.reveal, who, m), kind: 'status' };
  }
  const latest = currentBid(game);
  const bidMeta = latest ? bidLine(who(latest.playerId), latest, m) : undefined;
  if (game.turnId === YOU) {
    return {
      label: m.liarsDice.yourTurn,
      kind: 'status',
      main: latest ? m.liarsDice.raiseOrCall : m.liarsDice.openBidding,
      // What beats the bid in front of you, the raise rule in a line.
      meta: latest
        ? m.liarsDice.beat(latest)
        : m.liarsDice.onTable(diceOnTable(game)),
    };
  }
  const bot = game.turnId ?? '';
  return {
    label: m.liarsDice.turn(bot),
    kind: 'status',
    main: m.liarsDice.solo.thinking(bot),
    meta: bidMeta ?? m.liarsDice.openingRound,
  };
}
