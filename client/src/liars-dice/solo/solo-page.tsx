import { useEffect, useState } from 'react';
import {
  DICE_PER_PLAYER,
  type DicePerPlayer,
} from '../../../../shared/liars-dice';
import {
  BidPicker,
  Button,
  Card,
  FilterChipField,
  StatList,
  TurnBar,
  type TurnBarProps,
} from '../../ui';
import { useMessages, type Messages } from '../../i18n';
import { useSession } from '../../net/session';
import { listNames, ordinal } from '../../room/players';
import { ChangeSettings } from '../../solo/change-settings';
import { SoloLayout } from '../../solo/solo-layout';
import { useSoloTime } from '../../solo/solo-time';
import { SoloResult } from '../../solo/solo-result';
import { useBidChoice } from '../bid-choice';
import { Table, type TableSeat } from '../table';
import { bidLine, naming, revealBar, type Naming } from '../words';
import {
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

/**
 * The turn bar width under which its hints take a line of their own
 * (TurnBar's hintRowBelow): none, since every hint fits beside its main line
 * at every desktop width, from 561 px, in either language.
 */
const HINT_ROW_BELOW = 0;

const BOT_COUNTS = Array.from(
  { length: MAX_BOTS - MIN_BOTS + 1 },
  (_, index) => MIN_BOTS + index,
);

/** "You have won 5 of 10 games here.", or nothing before the first game. */
function recordLine(record: LiarsDiceRecord, m: Messages): string | null {
  if (record.games === 0) return null;
  return m.liarsDice.solo.record(record.wins, record.games, record.run);
}

/**
 * LD02-LD06, LD13: Liar's Dice on your own, against bots, straight away at
 * the table picked last here. It all runs here: nothing reaches the server.
 */
export function LiarsDiceSolo() {
  // Each game is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState(() => ({
    picks: readPicks(),
    game: 0,
  }));
  return (
    <SoloTable
      key={playing.game}
      picks={playing.picks}
      onPlayAgain={() => setPlaying({ ...playing, game: playing.game + 1 })}
      onChangeTable={(picks) => {
        writePicks(picks);
        setPlaying({ picks, game: playing.game + 1 });
      }}
    />
  );
}

/** LD01, behind Change table: how many bots, and how many dice each. */
function ChangeTable({
  picks,
  onPlay,
}: {
  picks: SoloPicks;
  onPlay: (picks: SoloPicks) => void;
}) {
  const m = useMessages();
  return (
    <ChangeSettings
      label={m.liarsDice.solo.changeTable}
      title={m.liarsDice.solo.pickTable}
      description={recordLine(readRecord(), m) ?? m.liarsDice.solo.description}
      settings={picks}
      onPlay={onPlay}
    >
      {(picked, pick) => (
        <>
          <FilterChipField
            label={m.liarsDice.solo.bots}
            options={BOT_COUNTS.map((count) => ({
              value: count,
              label: String(count),
              name: m.liarsDice.solo.botCount(count),
            }))}
            value={picked.bots}
            onValueChange={(bots: number) => pick({ ...picked, bots })}
          />
          <FilterChipField
            label={m.liarsDice.solo.diceEach}
            helper={
              picked.dicePerPlayer === 3
                ? m.liarsDice.solo.quick
                : m.liarsDice.solo.classic
            }
            options={DICE_PER_PLAYER.map((count) => ({
              value: count,
              label: m.liarsDice.solo.diceCount(count),
            }))}
            value={picked.dicePerPlayer}
            onValueChange={(dicePerPlayer: DicePerPlayer) =>
              pick({ ...picked, dicePerPlayer })
            }
          />
        </>
      )}
    </ChangeSettings>
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
  onChangeTable: (picks: SoloPicks) => void;
}) {
  const m = useMessages();
  const { name } = useSession();
  const [game, setGame] = useState(() => newGame(picks, soloRandom));
  const [record, setRecord] = useState<LiarsDiceRecord | null>(null);
  const over = game.phase === 'over';
  // The bots wait while How to play is open.
  const clock = useSoloTime();

  /** Moves the game on, counting it on this device once it is over. */
  const advance = (next: SoloGame) => {
    setGame(next);
    if (next.phase === 'over' && next !== game) {
      setRecord(recordGame(youWon(next)));
    }
  };

  // A bot takes about a second over its turn, so every bid can be read.
  useEffect(() => {
    if (!isBotTurn(game) || clock.paused) return;
    const timer = setTimeout(() => {
      const next = playBot(game, soloRandom);
      setGame(next);
      if (next.phase === 'over') setRecord(recordGame(youWon(next)));
    }, BOT_TURN_MS);
    return () => clearTimeout(timer);
  }, [game, clock.paused]);

  const you = game.seats.find((seat) => seat.id === YOU)!;
  const { place, of } = placeOf(game);
  const stillIn = game.seats
    .filter((seat) => seat.diceLeft > 0)
    .map((seat) => seat.id);
  const shown = record ?? readRecord();

  return (
    <SoloLayout
      gameType="liars-dice"
      time={over ? undefined : clock}
      // The first roll alone is nothing to lose; a bid on it is.
      leaveWarning={
        over || (game.round === 1 && game.bids.length === 0)
          ? null
          : m.liarsDice.solo.leaveWarning
      }
      phase={
        over
          ? youWon(game)
            ? { tone: 'lime', label: m.liarsDice.solo.youWon }
            : { tone: 'peach', label: m.liarsDice.out }
          : { tone: 'blue', label: m.liarsDice.round(game.round) }
      }
      stage={
        <>
          <TurnBar {...turnBar(game, m)} hintRowBelow={HINT_ROW_BELOW} />
          <Table
            seats={seatsOf(game, name)}
            round={game.round}
            youId={YOU}
            dicePerPlayer={game.dicePerPlayer}
            turnId={game.turnId}
            nextId={null}
            bids={game.bids}
            reveal={game.reveal}
            who={whoIn(m)}
            countLabel={over ? m.liarsDice.lastCall : m.liarsDice.count}
            inPlay={!over}
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
      result={
        over && (
          <SoloResult
            celebrate={youWon(game)}
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
            actions={
              <>
                <Button onClick={onPlayAgain}>{m.room.playAgain}</Button>
                <ChangeTable picks={picks} onPlay={onChangeTable} />
              </>
            }
          />
        )
      }
      side={
        <>
          {!over && (
            <Card kind="panel" title={m.liarsDice.solo.thisGame}>
              <StatList
                className={styles.stats}
                stats={[
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
  if (game.phase !== 'bidding' && game.reveal) {
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
