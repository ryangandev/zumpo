import type { Messages } from '../en';
import { chat } from './chat';
import { createRoom } from './create-room';
import { dailyWord } from './daily-word';
import { doodleChain } from './doodle-chain';
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

/** The Chinese catalog, file for file the shape of `en/`. */
export const zh: Messages = {
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
  doodleChain,
  dailyWord,
};
