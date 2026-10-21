import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type {
  GameType,
  MinesweeperDifficulty,
  PairsBoard,
  RoomCreateRequest,
} from '../../../shared/wire-types';
import {
  DICE_PER_PLAYER,
  type DicePerPlayer,
} from '../../../shared/liars-dice';
import { Button, ButtonLink, Notice, SelectField, TextField } from '../ui';
import { GAME_LENGTHS as TRIOS_LENGTHS } from '../../../shared/trios';
import { gameInfo, gamePath, roomPath } from '../games/catalog';
import { useMessages } from '../i18n';
import { DIFFICULTIES } from '../../../shared/minesweeper';
import { levelsFor } from '../../../shared/hush';
import {
  DEFAULT_DRAWING_SECONDS,
  DRAWING_SECONDS,
  type DrawingSeconds,
} from '../../../shared/doodle-chain';
import { BOARDS as PAIRS_BOARDS } from '../../../shared/pairs';
import { useConnectedSession } from '../net/session';
import { REQUEST_TIMEOUT_MS } from '../net/socket';
import { ConnectionLost } from '../shell/connection-lost';
import { FormPage } from '../shell/form-page';
import { Page } from '../shell/page';
import { Stage } from '../shell/stage';
import { StatusLine } from '../shell/status-line';
import { LobbyHeading, lobbyHeading } from './lobby-heading';

/** The server's limits. */
const ROOM_NAME_MAX_LENGTH = 40;
const PASSWORD_MAX_LENGTH = 20;
const ROUNDS = [1, 2, 3, 4] as const;
const HANDS = [5, 10] as const;
const WORDS = [3, 5] as const;

/**
 * DL04-DL06, DL10, DL11, ML04-ML06, ML10, MO05, T10, PR08, TS10, LD07, HU09,
 * DW11, DC02, GM07: a new room, with its settings.
 */
export default function CreateRoomPage({ gameType }: { gameType: GameType }) {
  const game = gameInfo(gameType);
  const m = useMessages();
  const text = m.games.of[gameType];
  const { socket, lost, name } = useConnectedSession();
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState(() =>
    m.createRoom.defaultName(name).slice(0, ROOM_NAME_MAX_LENGTH),
  );
  const [nameMissing, setNameMissing] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const [seats, setSeats] = useState(game.maxPlayers);
  const [rounds, setRounds] = useState(2);
  const [difficulty, setDifficulty] = useState<MinesweeperDifficulty>('Small');
  const [hands, setHands] = useState(5);
  const [pairsBoard, setPairsBoard] = useState<PairsBoard>('Small');
  const [trios, setTrios] = useState<number>(TRIOS_LENGTHS[0]);
  const [dicePerPlayer, setDicePerPlayer] = useState<DicePerPlayer>(3);
  const [words, setWords] = useState(3);
  const [drawingSeconds, setDrawingSeconds] = useState<DrawingSeconds>(
    DEFAULT_DRAWING_SECONDS,
  );
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<'error' | 'full' | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const trimmed = roomName.trim();
    if (!trimmed) {
      setNameMissing(true);
      nameField.current?.focus();
      return;
    }
    const request: RoomCreateRequest = {
      gameType,
      roomName: trimmed,
      username: name,
      maxPlayers: seats,
      password,
      settings:
        gameType === 'draw-and-guess'
          ? { rounds }
          : gameType === 'minesweeper'
            ? { difficulty }
            : gameType === 'make-24'
              ? { hands }
              : gameType === 'pairs'
                ? { board: pairsBoard }
                : gameType === 'trios'
                  ? { trios }
                  : gameType === 'liars-dice'
                    ? { dicePerPlayer }
                    : gameType === 'daily-word'
                      ? { rounds: words }
                      : gameType === 'doodle-chain'
                        ? { drawingSeconds }
                        : {},
    };
    setPending(true);
    setFailed(null);
    try {
      const answer = await socket
        .timeout(REQUEST_TIMEOUT_MS)
        .emitWithAck('room:create', request);
      if (answer.ok) {
        navigate(roomPath(gameType, answer.roomId), { replace: true });
        return;
      }
      setFailed(answer.error.type === 'tooManyRooms' ? 'full' : 'error');
    } catch {
      setFailed('error');
    }
    setPending(false);
  };

  const subtitle = m.createRoom.subtitle;
  if (lost) {
    return (
      <Page>
        <LobbyHeading game={game} subtitle={subtitle} />
        <Stage>
          <ConnectionLost />
        </Stage>
      </Page>
    );
  }
  return (
    <FormPage
      heading={lobbyHeading(game, subtitle, m)}
      phone={{
        eyebrow: m.createRoom.eyebrow,
        title: (
          <>
            {m.createRoom.titleLines[0]} <br />
            {m.createRoom.titleLines[1]}
          </>
        ),
        subtitle: m.createRoom.settings(text.name),
      }}
      title={m.createRoom.title}
      description={text.createDescription}
      onSubmit={submit}
      actions={
        pending ? undefined : (
          <>
            <Button type="submit">{m.createRoom.create}</Button>
            <ButtonLink to={gamePath(gameType)} variant="secondary">
              {m.createRoom.cancel}
            </ButtonLink>
          </>
        )
      }
    >
      {failed && (
        <Notice tone="error">
          {failed === 'full' ? m.createRoom.full : m.createRoom.failed}
        </Notice>
      )}
      <TextField
        label={m.createRoom.roomName}
        ref={nameField}
        helper={m.createRoom.nameHelper(ROOM_NAME_MAX_LENGTH)}
        error={nameMissing ? m.createRoom.nameMissing : undefined}
        value={roomName}
        onValueChange={(next: string) => {
          setRoomName(next);
          if (nameMissing && next.trim()) setNameMissing(false);
        }}
        maxLength={ROOM_NAME_MAX_LENGTH}
        autoComplete="off"
        name="roomName"
      />
      {/* A room of exactly two, as Gomoku's, has no seats to pick. */}
      {game.minPlayers < game.maxPlayers && (
        <SelectField
          label={m.createRoom.seats}
          helper={
            gameType === 'hush'
              ? // Hush has no settings of its own; its length is its seats.
                m.createRoom.hushSeatsHelper(
                  game.maxPlayers,
                  levelsFor(2),
                  levelsFor(game.maxPlayers),
                )
              : m.createRoom.seatsHelper(game.minPlayers, game.maxPlayers)
          }
          options={seatCounts(game.minPlayers, game.maxPlayers).map(
            (count) => ({
              value: count,
              label: m.createRoom.players(count),
            }),
          )}
          value={seats}
          onValueChange={setSeats}
          name="seats"
        />
      )}
      {gameType === 'draw-and-guess' ? (
        <SelectField
          label={m.createRoom.rounds}
          helper={m.createRoom.roundsHelper}
          options={ROUNDS.map((count) => ({
            value: count,
            label: m.createRoom.roundCount(count),
          }))}
          value={rounds}
          onValueChange={setRounds}
          name="rounds"
        />
      ) : gameType === 'make-24' ? (
        <SelectField
          label={m.createRoom.hands}
          helper={m.createRoom.handsHelper}
          options={HANDS.map((count) => ({
            value: count,
            label: m.createRoom.handCount(count),
          }))}
          value={hands}
          onValueChange={setHands}
          name="hands"
        />
      ) : gameType === 'liars-dice' ? (
        <SelectField
          label={m.createRoom.diceEach}
          helper={m.createRoom.diceDetail(dicePerPlayer)}
          options={DICE_PER_PLAYER.map((count) => ({
            value: count,
            label: m.createRoom.diceCount(count),
            detail: m.createRoom.diceDetail(count),
          }))}
          value={dicePerPlayer}
          onValueChange={setDicePerPlayer}
          name="dicePerPlayer"
        />
      ) : gameType === 'pairs' ? (
        <SelectField
          label={m.createRoom.board}
          helper={m.createRoom.pairsDetail(pairsBoard)}
          options={PAIRS_BOARDS.map((board) => ({
            value: board,
            label: m.createRoom.boardName(board),
            detail: m.createRoom.pairsDetail(board),
          }))}
          value={pairsBoard}
          onValueChange={setPairsBoard}
          name="board"
        />
      ) : gameType === 'trios' ? (
        <SelectField
          label={m.createRoom.trios}
          helper={m.createRoom.triosHelper}
          options={TRIOS_LENGTHS.map((count) => ({
            value: count,
            label: m.createRoom.trioCount(count),
          }))}
          value={trios}
          onValueChange={setTrios}
          name="trios"
        />
      ) : gameType === 'daily-word' ? (
        <SelectField
          label={m.createRoom.words}
          helper={m.createRoom.wordsHelper}
          options={WORDS.map((count) => ({
            value: count,
            label: m.createRoom.wordCount(count),
          }))}
          value={words}
          onValueChange={setWords}
          name="words"
        />
      ) : gameType === 'doodle-chain' ? (
        <SelectField
          label={m.createRoom.drawingTime}
          helper={m.createRoom.drawingTimeHelper}
          options={DRAWING_SECONDS.map((count) => ({
            value: count,
            label: m.createRoom.secondCount(count),
          }))}
          value={drawingSeconds}
          onValueChange={setDrawingSeconds}
          name="drawingSeconds"
        />
      ) : gameType === 'minesweeper' ? (
        <SelectField
          label={m.createRoom.board}
          helper={m.createRoom.minesweeperDetail(difficulty)}
          options={DIFFICULTIES.map((board) => ({
            value: board,
            label: m.createRoom.boardName(board),
            detail: m.createRoom.minesweeperDetail(board),
          }))}
          value={difficulty}
          onValueChange={setDifficulty}
          name="board"
        />
      ) : null}
      <TextField
        label={m.createRoom.password}
        helper={m.createRoom.passwordHelper(PASSWORD_MAX_LENGTH)}
        type="password"
        value={password}
        onValueChange={(next: string) => setPassword(next)}
        maxLength={PASSWORD_MAX_LENGTH}
        autoComplete="new-password"
        name="password"
      />
      {pending && <StatusLine>{m.createRoom.creating}</StatusLine>}
    </FormPage>
  );
}

/** 2, 3, … up to `max`: every room needs two to start. */
const seatCounts = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, index) => index + min);
