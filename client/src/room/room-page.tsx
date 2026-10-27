import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Navigate,
  useBlocker,
  useLocation,
  useNavigate,
  type Location,
} from 'react-router';
import type {
  AnyRoomState,
  ErrorType,
  GameSettings,
  GameType,
  Result,
} from '../../../shared/wire-types';
import { mayStart, starterOf } from '../../../shared/room';
import { Button, ButtonLink, Card, TextField } from '../ui';
import { gameInfo, gamePath, roomPath } from '../games/catalog';
import { useMessages, type Messages } from '../i18n';
import { DrawAndGuessRoom } from '../draw-and-guess/room';
import { MinesweeperRoom } from '../minesweeper/room';
import { Make24Room } from '../make-24/room';
import { PairsRoom } from '../pairs/room';
import { TriosRoom } from '../trios/room';
import { SnapRoom } from '../snap/room';
import { LiarsDiceRoom } from '../liars-dice/room';
import { HushRoom } from '../hush/room';
import { CodeBreakerRoom } from '../code-breaker/room';
import { DoodleChainRoom } from '../doodle-chain/room';
import { GomokuRoom } from '../gomoku/room';
import { useSession } from '../net/session';
import { REQUEST_TIMEOUT_MS } from '../net/socket';
import { useLobby } from '../net/use-lobby';
import { useRoom, type RoomConnection, type Snapshot } from '../net/use-room';
import { ConnectionLost } from '../shell/connection-lost';
import { FormPage } from '../shell/form-page';
import { Page } from '../shell/page';
import { Stage } from '../shell/stage';
import { StatusLine } from '../shell/status-line';
import { usePageTitle } from '../shell/use-page-title';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { LobbyHeading, lobbyHeading } from '../pages/lobby-heading';
import { Confetti } from './confetti';
import { InviteDialog, LeaveDialog, leaveCost } from './dialogs';
import { roomNameOf } from './players';
import { RoomContext, type Room } from './room-context';
import { useConnectionLostSound } from './sounds';

// Daily Word brings its word lists, so it loads only when played.
const DailyWordRoom = lazy(() => import('../daily-word/room'));

/**
 * /games/:game/rooms/:roomId: takes a seat, asking for a password if the room
 * has one, and shows the room; or says why it cannot.
 */
export default function RoomPage({
  gameType,
  roomId,
}: {
  gameType: GameType;
  roomId: string;
}) {
  const m = useMessages();
  // An invite link to a locked room carries its key: #key=…, read once, since
  // the room drops it from the address once seated.
  const { hash } = useLocation();
  const [invite] = useState(
    () => new URLSearchParams(hash.slice(1)).get('key') ?? '',
  );
  const connection = useRoom(roomId, invite);
  const { stage } = connection;
  useConnectionLostSound(stage);
  // The room's own name once seated, the game's until then.
  usePageTitle(
    ...(stage.kind === 'seated' ? [roomNameOf(stage.snapshot.state, m)] : []),
    m.games.of[gameType].name,
  );

  switch (stage.kind) {
    case 'connecting':
      return (
        <Page>
          <Stage>
            <Card
              title={m.room.connectingTitle}
              description={m.room.connectingDescription}
            >
              <StatusLine>{m.room.connecting}</StatusLine>
            </Card>
          </Stage>
        </Page>
      );
    case 'failed':
      return (
        <Page>
          <Stage>
            <ConnectionLost />
          </Stage>
        </Page>
      );
    case 'password':
      return (
        <PasswordPage
          gameType={gameType}
          roomId={roomId}
          rejected={stage.rejected}
          pending={stage.pending}
          onSubmit={connection.submitPassword}
        />
      );
    case 'unavailable':
      return (
        <Page>
          <LobbyHeading game={gameInfo(gameType)} subtitle={m.lobby.subtitle} />
          <Stage>
            <Card
              title={m.room.unavailableTitle}
              description={m.room.unavailableDescription}
              actions={
                <ButtonLink to={gamePath(gameType)}>
                  {m.room.backToRooms}
                </ButtonLink>
              }
            />
          </Stage>
        </Page>
      );
    case 'not-found':
      return (
        <Page>
          <Stage>
            <Card
              title={m.room.notFoundTitle}
              description={m.room.notFoundDescription}
              actions={
                <ButtonLink to={gamePath(gameType)}>
                  {m.room.backToRooms}
                </ButtonLink>
              }
            />
          </Stage>
        </Page>
      );
    case 'expired':
      return <ExpiredPage gameType={gameType} />;
    case 'closed':
      return (
        <Page>
          <Stage>
            <Card
              title={m.room.closedTitle}
              description={m.room.closedDescription}
              actions={
                <ButtonLink to={gamePath(gameType)}>
                  {m.room.backToRooms}
                </ButtonLink>
              }
            />
          </Stage>
        </Page>
      );
    case 'seated':
      // A link with the wrong game in it still reaches the room.
      if (stage.snapshot.state.gameType !== gameType) {
        return (
          <Navigate
            to={roomPath(stage.snapshot.state.gameType, roomId)}
            replace
          />
        );
      }
      return (
        <SeatedRoom
          snapshot={stage.snapshot}
          reconnecting={stage.reconnecting}
          connection={connection}
        />
      );
  }
}

/**
 * The room's invite link: its address, and for a locked room the key that
 * lets a friend in without the password.
 */
function inviteLink(state: {
  gameType: GameType;
  roomId: string;
  inviteKey: string;
}) {
  const address = `${window.location.origin}${roomPath(state.gameType, state.roomId)}`;
  return state.inviteKey ? `${address}#key=${state.inviteKey}` : address;
}

/** P08: the seat was released while this player was away. */
function ExpiredPage({ gameType }: { gameType: GameType }) {
  const m = useMessages();
  return (
    <Page>
      <Stage>
        <Card
          title={m.room.expiredTitle}
          description={m.room.expiredDescription}
          actions={
            <>
              <ButtonLink to={gamePath(gameType)}>
                {m.room.backToRooms}
              </ButtonLink>
              <ButtonLink to="/" variant="secondary" icon="back">
                {m.shell.backToGames}
              </ButtonLink>
            </>
          }
        />
      </Stage>
    </Page>
  );
}

/** DL07, DL08, MO06: a private room's password. */
function PasswordPage({
  gameType,
  roomId,
  rejected,
  pending,
  onSubmit,
}: {
  gameType: GameType;
  roomId: string;
  rejected: boolean;
  pending: boolean;
  onSubmit: (password: string) => void;
}) {
  const m = useMessages();
  const [password, setPassword] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const phone = useMediaQuery(PHONE);
  // The buttons stand aside while the request is in flight; a refusal hands
  // focus back to the field, the wrong guess selected, ready to retype.
  useEffect(() => {
    if (!rejected || pending) return;
    field.current?.focus();
    field.current?.select();
  }, [rejected, pending]);
  // The lobby knows the room's name; a link alone does not.
  const rooms = useLobby(gameType);
  const room = rooms?.find((candidate) => candidate.roomId === roomId);
  const roomName = room && roomNameOf(room, m);
  const description = m.room.passwordDescription(roomName);

  return (
    <FormPage
      heading={lobbyHeading(gameInfo(gameType), m.lobby.subtitle, m)}
      phone={{ eyebrow: m.room.comeIn, subtitle: description }}
      title={m.room.passwordTitle}
      description={description}
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) onSubmit(password);
      }}
      actions={
        pending ? undefined : (
          <>
            <Button type="submit">{m.room.join}</Button>
            <ButtonLink to={gamePath(gameType)} variant="secondary" icon="back">
              {m.room.backToRooms}
            </ButtonLink>
          </>
        )
      }
    >
      <TextField
        label={m.room.password}
        helper={phone ? m.room.passwordPhoneHelper : m.room.passwordHelper}
        error={rejected ? m.room.passwordRejected : undefined}
        ref={field}
        type="password"
        value={password}
        onValueChange={(next: string) => setPassword(next)}
        autoComplete="off"
        autoFocus
        name="password"
      />
      {pending && <StatusLine>{m.room.joining}</StatusLine>}
    </FormPage>
  );
}

/** Marks a navigation as the room's own Leave room button. */
const LEAVE_ROOM = 'leave-room';

const isLeaveRoom = (location: Location | undefined) =>
  (location?.state as { via?: string } | null)?.via === LEAVE_ROOM;

/**
 * In the room. Any way out of the page passes through here and gives the seat
 * up before the page goes. Leave room between games goes at once; anything
 * else asks first: Leave room mid-game (P11), and the wordmark or the
 * browser's back button at any time (P11, P16). A new name is not a way out.
 */
function SeatedRoom({
  snapshot,
  reconnecting,
  connection,
}: {
  snapshot: Snapshot;
  reconnecting: boolean;
  connection: RoomConnection;
}) {
  const m = useMessages();
  const { socket, playerId, reconnectGraceMs } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { state, receivedAt, connection: epoch } = snapshot;
  const [inviting, setInviting] = useState(false);

  // Seated, the invite key has done its work: the address goes back to the
  // room's own, which a reload or a bookmark finds the seat by.
  const hasHash = location.hash !== '';
  useEffect(() => {
    if (hasHash) {
      void navigate(
        { pathname: location.pathname, search: location.search },
        { replace: true },
      );
    }
  }, [hasHash, navigate, location.pathname, location.search]);
  const [starting, setStarting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  // A game that ends while the room is open is celebrated; a finished game
  // found on arrival or after a refresh is not. Each one gets its own burst.
  // A Hush team can lose together, and a loss is not celebrated.
  const [wasPlaying, setWasPlaying] = useState(state.isGameStarted);
  const [celebrations, setCelebrations] = useState(0);
  // Who was host when the last game started, so a game cut short can say
  // whether the crown has just come to the viewer.
  const [startedBy, setStartedBy] = useState(state.owner.playerId);
  if (state.isGameStarted !== wasPlaying) {
    setWasPlaying(state.isGameStarted);
    if (state.isGameStarted) setStartedBy(state.owner.playerId);
    // A game starting or ending moves on from whatever was refused before.
    setRefusal(null);
    if (
      !state.isGameStarted &&
      state.lastGame &&
      !state.lastGame.endedEarly &&
      !(state.gameType === 'hush' && !state.lastGame.won)
    ) {
      setCelebrations((count) => count + 1);
    }
  }

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname,
  );
  const blocked = blocker.state === 'blocked';
  const spectator = state.spectators[playerId];
  // Only Leave room between games, or while watching, is sure to mean it;
  // anything else may be a slip, so it asks.
  const sure =
    blocked &&
    (!state.isGameStarted || Boolean(spectator)) &&
    isLeaveRoom(blocker.location);
  const { leave } = connection;

  useEffect(() => {
    if (sure) {
      leave();
      blocker.proceed?.();
    }
  }, [sure, leave, blocker]);

  // The button comes back either way, and a refusal or no answer says why
  // nothing happened rather than leaving the host to wonder.
  const startGame = useCallback(async () => {
    setStarting(true);
    setRefusal(null);
    try {
      const answer = await socket
        .timeout(REQUEST_TIMEOUT_MS)
        .emitWithAck('game:start', state.roomId);
      if (!answer.ok) setRefusal(refusalOf(m, 'start', answer.error.type));
    } catch {
      setRefusal(m.room.refused.noAnswer);
    }
    setStarting(false);
  }, [socket, state.roomId, m]);

  // Ready and the next game's settings: the snapshot that follows shows
  // them, and a refusal says why not.
  const ask = useCallback(
    async (
      request: 'room:ready' | 'room:settings',
      send: () => Promise<Result>,
    ) => {
      setRefusal(null);
      try {
        const answer = await send();
        if (!answer.ok) setRefusal(refusalOf(m, request, answer.error.type));
      } catch {
        setRefusal(m.room.refused.noAnswer);
      }
    },
    [m],
  );
  const [readied, setReadied] = useState(0);
  const setReady = useCallback(
    (ready: boolean) => {
      if (ready) setReadied((count) => count + 1);
      void ask('room:ready', () =>
        socket
          .timeout(REQUEST_TIMEOUT_MS)
          .emitWithAck('room:ready', state.roomId, ready),
      );
    },
    [ask, socket, state.roomId],
  );
  const changeSettings = useCallback(
    (settings: GameSettings) =>
      void ask('room:settings', () =>
        socket
          .timeout(REQUEST_TIMEOUT_MS)
          .emitWithAck('room:settings', state.roomId, settings),
      ),
    [ask, socket, state.roomId],
  );

  // Moves between the table and the spectator seats; the snapshot that
  // follows shows where the viewer sits now, and a refusal says why not.
  const move = useCallback(
    async (event: 'room:watch' | 'room:sit') => {
      setMoving(true);
      setRefusal(null);
      try {
        const answer = await socket
          .timeout(REQUEST_TIMEOUT_MS)
          .emitWithAck(event, state.roomId);
        if (!answer.ok) setRefusal(refusalOf(m, event, answer.error.type));
      } catch {
        setRefusal(m.room.refused.noAnswer);
      }
      setMoving(false);
    },
    [socket, state.roomId, m],
  );

  const starter = starterOf(state);
  const seat = state.playerList[playerId];
  const me = useMemo(
    () =>
      seat ??
      (spectator
        ? { username: spectator.username, points: 0, isConnected: true }
        : undefined),
    [seat, spectator],
  );

  const room = useMemo<Room | null>(
    () =>
      me
        ? {
            state,
            receivedAt,
            epoch,
            reconnecting,
            reconnectGraceMs,
            playerId,
            me,
            spectating: !seat,
            isHost: state.owner.playerId === playerId,
            canStart: mayStart(state, playerId),
            starterName: memberName(state, starter),
            becameHost:
              state.owner.playerId === playerId && startedBy !== playerId,
            chat: connection.chat,
            chatEpoch: connection.chatEpoch,
            canvas: connection.canvas,
            drawings: connection.drawings,
            socket,
            sendChat: (text) => socket.emit('chat:send', state.roomId, text),
            inviteLink: inviteLink(state),
            openInvite: () => setInviting(true),
            leave: () =>
              navigate(gamePath(state.gameType), {
                state: { via: LEAVE_ROOM },
              }),
            startGame,
            starting,
            setReady,
            readied,
            changeSettings,
            watch: () => void move('room:watch'),
            sit: () => void move('room:sit'),
            moving,
            refusal,
          }
        : null,
    [
      state,
      receivedAt,
      epoch,
      reconnecting,
      reconnectGraceMs,
      playerId,
      me,
      seat,
      startedBy,
      connection.chat,
      connection.chatEpoch,
      connection.canvas,
      connection.drawings,
      socket,
      navigate,
      starter,
      startGame,
      starting,
      setReady,
      readied,
      changeSettings,
      move,
      moving,
      refusal,
    ],
  );

  // A snapshot without us in it means the seat is gone.
  if (!room) return <ExpiredPage gameType={state.gameType} />;

  return (
    <RoomContext.Provider value={room}>
      {state.gameType === 'draw-and-guess' ? (
        <DrawAndGuessRoom />
      ) : state.gameType === 'minesweeper' ? (
        <MinesweeperRoom />
      ) : state.gameType === 'make-24' ? (
        <Make24Room />
      ) : state.gameType === 'liars-dice' ? (
        <LiarsDiceRoom />
      ) : state.gameType === 'pairs' ? (
        <PairsRoom />
      ) : state.gameType === 'trios' ? (
        <TriosRoom />
      ) : state.gameType === 'snap' ? (
        <SnapRoom />
      ) : state.gameType === 'hush' ? (
        <HushRoom />
      ) : state.gameType === 'code-breaker' ? (
        <CodeBreakerRoom />
      ) : state.gameType === 'doodle-chain' ? (
        <DoodleChainRoom />
      ) : state.gameType === 'gomoku' ? (
        <GomokuRoom />
      ) : (
        <Suspense>
          <DailyWordRoom />
        </Suspense>
      )}
      {celebrations > 0 && <Confetti key={celebrations} />}
      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        roomName={roomNameOf(state, m)}
        link={inviteLink(state)}
      />
      <LeaveDialog
        open={blocked && !sure}
        roomName={roomNameOf(state, m)}
        cost={leaveCost(state, playerId, m)}
        onStay={() => blocker.reset?.()}
        onLeave={() => {
          leave();
          blocker.proceed?.();
        }}
      />
    </RoomContext.Provider>
  );
}

/** A member's name, at the table or watching; '' for nobody. */
const memberName = (state: AnyRoomState, playerId: string): string =>
  (state.playerList[playerId] ?? state.spectators[playerId])?.username ?? '';

/**
 * Why a start, a move between seats, a Ready or a setting was refused, in
 * the viewer's words.
 */
function refusalOf(
  m: Messages,
  request: 'start' | 'room:watch' | 'room:sit' | 'room:ready' | 'room:settings',
  type: ErrorType,
): string {
  const refused = m.room.refused;
  switch (type) {
    case 'notRoomOwner':
      return request === 'room:settings' ? refused.notStarter : refused[type];
    case 'notEnoughPlayers':
    case 'gameAlreadyStarted':
      return refused[type];
    // The one way a move is refused for a room that is still open: the
    // seats it asked for are taken.
    case 'roomNotOpen':
      if (request === 'room:sit') return refused.seatsTaken;
      if (request === 'room:watch') return refused.spectatorSeatsTaken;
      return refused.failed;
    default:
      return refused.failed;
  }
}
