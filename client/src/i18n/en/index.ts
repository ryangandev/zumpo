import { chat } from './chat';
import { createRoom } from './create-room';
import { dailyWord } from './daily-word';
import { drawAndGuess } from './draw-and-guess';
import { games } from './games';
import { home, howToPlay } from './home';
import { hush } from './hush';
import { liarsDice } from './liars-dice';
import { lobby } from './lobby';
import { make24 } from './make-24';
import { minesweeper } from './minesweeper';
import { notices } from './notices';
import { pairs } from './pairs';
import { room } from './room';
import { shell } from './shell';
import { solo } from './solo';
import { snap } from './snap';
import { trios } from './trios';
import { ui } from './ui';

/**
 * The English catalog, one module per area of the app. Its shape is the
 * contract every other language fills: a message with a value in it is a
 * function, so each language orders its own sentence.
 */
export const en = {
  shell,
  home,
  howToPlay,
  games,
  lobby,
  createRoom,
  room,
  chat,
  notices,
  solo,
  ui,
  drawAndGuess,
  minesweeper,
  make24,
  pairs,
  trios,
  snap,
  liarsDice,
  hush,
  dailyWord,
};

export type Messages = typeof en;
export type { GameText } from './games';
