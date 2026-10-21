import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnyRoomState,
  CanvasStroke,
  ChatMessage,
  Coordinate,
  ErrorType,
  Result,
} from '../../../shared/wire-types';
import { CanvasStream } from './canvas-stream';
import { DrawingStore } from './drawing-store';
import { useConnectedSession, type ConnectionStatus } from './session';
import { REQUEST_TIMEOUT_MS } from './socket';

/** The newest snapshot, and when it arrived, which its clocks count from. */
export interface Snapshot {
  state: AnyRoomState;
  receivedAt: number;
}

/**
 * What a room page shows.
 *
 * - connecting: the first connection or the first answer is on its way.
 * - failed: the server never answered, or another tab has the player now.
 * - password: the room is private; `rejected` once a password was wrong.
 * - unavailable: the room is full, playing, or would not take this player.
 * - not-found: the room does not exist, or no longer does.
 * - expired: this player had a seat, and it was released while they were away.
 * - closed: the server shut down, for a deploy or a restart, and the room with it.
 * - seated: in the room; `reconnecting` while the connection is down.
 */
export type RoomStage =
  | { kind: 'connecting' }
  | { kind: 'failed' }
  | { kind: 'password'; rejected: boolean; pending: boolean }
  | { kind: 'unavailable' }
  | { kind: 'not-found' }
  | { kind: 'expired' }
  | { kind: 'closed' }
  | { kind: 'seated'; snapshot: Snapshot; reconnecting: boolean };

/** The server keeps this many messages; so does the client. */
const CHAT_LIMIT = 100;

const UNAVAILABLE: readonly ErrorType[] = ['roomNotOpen', 'gameAlreadyStarted'];

/**
 * Room ids are UUIDs, so a mistyped or cut-off link is refused as an invalid
 * request: from the player's side, a room that does not exist.
 */
const NOT_FOUND: readonly ErrorType[] = ['roomNotExist', 'invalidRequest'];

export interface RoomConnection {
  stage: RoomStage;
  chat: readonly ChatMessage[];
  canvas: CanvasStream;
  drawings: DrawingStore;
  submitPassword: (password: string) => void;
  /** Gives up the seat. The page navigates away itself. */
  leave: () => void;
}

/**
 * A room page's connection to its room: it takes a seat (asking for the
 * password if it must), keeps the latest snapshot and the chat, and takes the
 * seat back after a dropped connection. `invite` is the key an invite link
 * carried, which a locked room takes in place of its password.
 */
export function useRoom(roomId: string, invite = ''): RoomConnection {
  const session = useConnectedSession();
  const { socket, status, connection, name } = session;

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<RoomStage | null>(null);
  const [chat, setChat] = useState<readonly ChatMessage[]>([]);
  const [canvas] = useState(() => new CanvasStream());
  const [drawings] = useState(() => new DrawingStore());
  /** Whether this page has held a seat, which turns "not a member" into "expired". */
  const seated = useRef(false);
  const left = useRef(false);
  /** Set once the server said it is shutting down: the room is gone for good. */
  const closed = useRef(false);
  /**
   * The name to join with, read when joining rather than a dependency of it:
   * a rename reaches a seat through `player:rename`, and must not run the
   * join effect again, which would sync the room and its drawing afresh.
   */
  const nameRef = useRef(name);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const request = useCallback(
    async (
      send: () => Promise<Result>,
    ): Promise<Result | { ok: false; error: { type: 'timeout' } }> => {
      try {
        return await send();
      } catch {
        return { ok: false, error: { type: 'timeout' } };
      }
    },
    [],
  );

  const sync = useCallback(
    () =>
      request(() =>
        socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck('room:sync', roomId),
      ),
    [request, socket, roomId],
  );

  const join = useCallback(
    (password: string) =>
      request(() =>
        socket
          .timeout(REQUEST_TIMEOUT_MS)
          .emitWithAck('room:join', roomId, nameRef.current, password, null),
      ),
    [request, socket, roomId],
  );

  // A failed join or sync decides what the page says instead of the room.
  const settle = useCallback(
    async (
      answer: Awaited<ReturnType<typeof request>>,
      password: string,
      isCurrent: () => boolean,
    ) => {
      if (!isCurrent()) return;
      if (answer.ok) {
        // Seated: the snapshot follows, and a sync brings the chat and drawing.
        const synced = await sync();
        if (!isCurrent()) return;
        if (!synced.ok) setProblem({ kind: 'failed' });
        return;
      }
      const type = answer.error.type;
      if (type === 'incorrectPassword') {
        setProblem({
          kind: 'password',
          rejected: password !== '',
          pending: false,
        });
      } else if (NOT_FOUND.includes(type as ErrorType)) {
        setProblem({ kind: 'not-found' });
      } else if (UNAVAILABLE.includes(type as ErrorType)) {
        setProblem({ kind: 'unavailable' });
      } else {
        setProblem({ kind: 'failed' });
      }
    },
    [sync],
  );

  useEffect(() => {
    if (connection === null || left.current || closed.current) return;
    let current = true;
    const isCurrent = () => current;

    const onState = (state: AnyRoomState) => {
      if (state.roomId !== roomId) return;
      seated.current = true;
      setProblem(null);
      setSnapshot({ state, receivedAt: performance.now() });
    };
    const onHistory = (id: string, messages: ChatMessage[]) => {
      if (id === roomId) setChat(messages.slice(-CHAT_LIMIT));
    };
    const onMessage = (id: string, message: ChatMessage) => {
      if (id !== roomId) return;
      setChat((messages) =>
        messages.some((known) => known.id === message.id)
          ? messages
          : [...messages, message].slice(-CHAT_LIMIT),
      );
    };
    const onCanvasSync = (id: string, strokes: CanvasStroke[]) => {
      if (id === roomId) canvas.sync(strokes);
    };
    const onCanvasStart = (
      id: string,
      point: Coordinate,
      color: string,
      size: number,
    ) => {
      if (id === roomId) canvas.start(point, color, size);
    };
    const onCanvasMove = (id: string, point: Coordinate) => {
      if (id === roomId) canvas.move(point);
    };
    const onCanvasEnd = (id: string) => {
      if (id === roomId) canvas.end();
    };
    const onCanvasUndo = (id: string) => {
      if (id === roomId) canvas.undo();
    };
    const onCanvasClear = (id: string) => {
      if (id === roomId) canvas.clear();
    };
    const onDrawing = (
      id: string,
      drawing: string,
      strokes: CanvasStroke[],
    ) => {
      if (id === roomId) drawings.add(drawing, strokes);
    };
    // Rooms live in the server's memory, so they end with it. The page says so
    // now, rather than reconnecting to a server that has never heard of it.
    const onClosing = () => {
      closed.current = true;
      setProblem({ kind: 'closed' });
    };

    socket.on('room:state', onState);
    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    socket.on('dg:canvas:sync', onCanvasSync);
    socket.on('dg:canvas:start', onCanvasStart);
    socket.on('dg:canvas:move', onCanvasMove);
    socket.on('dg:canvas:end', onCanvasEnd);
    socket.on('dg:canvas:undo', onCanvasUndo);
    socket.on('dg:canvas:clear', onCanvasClear);
    // A Doodle Chain player's own drawing comes back after a reload.
    socket.on('dc:canvas:sync', onCanvasSync);
    socket.on('dc:drawing', onDrawing);
    socket.on('server:closing', onClosing);

    void (async () => {
      const synced = await sync();
      if (!current) return;
      if (synced.ok) return;
      if (!('type' in synced.error) || synced.error.type !== 'notRoomMember') {
        await settle(synced, '', isCurrent);
        return;
      }
      if (seated.current) {
        // We had a seat, and the server let it go while we were away.
        setProblem({ kind: 'expired' });
        return;
      }
      // Not seated yet: arriving from the list or a link. Try with the
      // link's key, or with nothing; a private room answers by asking for
      // its password, as for a key from a room that no longer takes it.
      await settle(await join(invite), '', isCurrent);
    })();

    return () => {
      current = false;
      socket.off('room:state', onState);
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
      socket.off('dg:canvas:sync', onCanvasSync);
      socket.off('dg:canvas:start', onCanvasStart);
      socket.off('dg:canvas:move', onCanvasMove);
      socket.off('dg:canvas:end', onCanvasEnd);
      socket.off('dg:canvas:undo', onCanvasUndo);
      socket.off('dg:canvas:clear', onCanvasClear);
      socket.off('dc:canvas:sync', onCanvasSync);
      socket.off('dc:drawing', onDrawing);
      socket.off('server:closing', onClosing);
    };
  }, [
    connection,
    socket,
    roomId,
    invite,
    canvas,
    drawings,
    sync,
    join,
    settle,
  ]);

  const submitPassword = useCallback(
    (password: string) => {
      setProblem({ kind: 'password', rejected: false, pending: true });
      void (async () => {
        await settle(await join(password), password, () => true);
      })();
    },
    [join, settle],
  );

  const leave = useCallback(() => {
    if (left.current) return;
    left.current = true;
    if (seated.current && socket.connected) socket.emit('room:leave', roomId);
  }, [socket, roomId]);

  return {
    stage: stageOf(status, snapshot, problem),
    chat,
    canvas,
    drawings,
    submitPassword,
    leave,
  };
}

function stageOf(
  status: ConnectionStatus,
  snapshot: Snapshot | null,
  problem: RoomStage | null,
): RoomStage {
  if (problem) return problem;
  if (status === 'failed') {
    return snapshot ? { kind: 'expired' } : { kind: 'failed' };
  }
  // The seat is fine; it is in use in another tab, until this one is chosen.
  if (status === 'replaced') return { kind: 'failed' };
  if (snapshot) {
    return { kind: 'seated', snapshot, reconnecting: status !== 'online' };
  }
  return { kind: 'connecting' };
}
