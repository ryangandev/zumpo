import { createContext, useContext } from 'react';
import type {
  AnyRoomState,
  ChatMessage,
  PlayerInfo,
} from '../../../shared/wire-types';
import type { CanvasStream } from '../net/canvas-stream';
import type { DrawingStore } from '../net/drawing-store';
import type { ZumpoSocket } from '../net/socket';

/** Everything a game's room view needs from the room around it. */
export interface Room<State extends AnyRoomState = AnyRoomState> {
  state: State;
  /** When the snapshot arrived; its clocks count from here. */
  receivedAt: number;
  /** The connection is down; the server holds the seat meanwhile. */
  reconnecting: boolean;
  reconnectGraceMs: number;
  playerId: string;
  /**
   * The viewer at the table or, while `spectating`, their name with no score:
   * a spectator is in no `playerList`, so nothing in a game treats them as
   * playing.
   */
  me: PlayerInfo;
  /** In the spectator seats: sees what any player may, and plays no part. */
  spectating: boolean;
  isHost: boolean;
  /**
   * The viewer is the host now and was not when the last game started, as
   * this page saw it: the crown came to them during that game.
   */
  becameHost: boolean;
  chat: readonly ChatMessage[];
  canvas: CanvasStream;
  /** Finished drawings sent apart from the snapshots, by id. */
  drawings: DrawingStore;
  socket: ZumpoSocket;
  sendChat: (text: string) => void;
  /** Asks the server to start a game; `starting` until it answers. */
  startGame: () => void;
  starting: boolean;
  /** The room's invite link, with a locked room's key. */
  inviteLink: string;
  /** The invite dialog, with the link to copy by hand. */
  openInvite: () => void;
  /** Between games: gives up the seat to watch, or takes a free one. */
  watch: () => void;
  sit: () => void;
  /** A move between the table and the spectator seats is on its way. */
  moving: boolean;
  /** Why the last start or move did not happen, worded; null once it is moot. */
  refusal: string | null;
  /** The Leave room button: goes at once between games, asks mid-game. */
  leave: () => void;
}

export const RoomContext = createContext<Room | null>(null);

export function useRoomContext<State extends AnyRoomState>(): Room<State> {
  const room = useContext(RoomContext);
  if (!room) throw new Error('useRoomContext needs a seated room above it');
  return room as Room<State>;
}
