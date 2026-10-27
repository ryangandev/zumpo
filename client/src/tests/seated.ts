import { act } from '@testing-library/react';
import type { AnyRoomState, Result } from '../../../shared/wire-types';
import type { AudioEngine } from '../audio/engine';
import { roomPath } from '../games/catalog';
import { FakeSocket } from './fake-socket';
import { renderApp } from './render-app';

/**
 * The app, seated in the room `state` describes; `picked` when the viewer
 * still has the name picked for them.
 */
export async function renderSeated(
  state: AnyRoomState,
  { picked = false, engine }: { picked?: boolean; engine?: AudioEngine } = {},
) {
  const fake = new FakeSocket();
  fake.answer('room:sync', (): Result => ({ ok: true }));
  const view = await renderApp(roomPath(state.gameType, state.roomId), {
    fake,
    picked,
    engine,
  });
  act(() => fake.serverEmits('room:state', state));
  /** The server sends a newer snapshot. */
  const update = (next: AnyRoomState) =>
    act(() => fake.serverEmits('room:state', next));
  return { ...view, update };
}
