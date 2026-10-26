import type {
  AnyRoomState,
  CodeBreakerSettings,
  DailyWordSettings,
  DoodleChainSettings,
  DrawAndGuessSettings,
  GameSettings,
  GameType,
  LiarsDiceSettings,
  Make24Settings,
  MinesweeperSettings,
  PairsSettings,
  TriosSettings,
} from '../../../shared/wire-types';
import {
  DICE_PER_PLAYER,
  type DicePerPlayer,
} from '../../../shared/liars-dice';
import { GAME_LENGTHS as TRIOS_LENGTHS } from '../../../shared/trios';
import { DIFFICULTIES } from '../../../shared/minesweeper';
import {
  DEFAULT_DRAWING_SECONDS,
  DRAWING_SECONDS,
} from '../../../shared/doodle-chain';
import { BOARDS as PAIRS_BOARDS } from '../../../shared/pairs';
import { WORD_CATEGORIES } from '../../../shared/draw-and-guess';
import { SelectField } from '../ui';
import { CategoriesField } from '../draw-and-guess/categories-field';
import { useMessages } from '../i18n';

/** The choices the server takes; each game's validation has the same. */
const ROUNDS = [1, 2, 3, 4] as const;
const HANDS = [5, 10] as const;
const WORDS = [3, 5] as const;
const CODES = [1, 3] as const;

/** What a new room of `gameType` is played with unless its host says. */
export function defaultSettings(gameType: GameType): GameSettings {
  switch (gameType) {
    case 'draw-and-guess':
      return { rounds: 2, categories: [...WORD_CATEGORIES] };
    case 'minesweeper':
      return { difficulty: 'Small' };
    case 'make-24':
      return { hands: 5 };
    case 'pairs':
      return { board: 'Small' };
    case 'trios':
      return { trios: TRIOS_LENGTHS[0] };
    case 'liars-dice':
      return { dicePerPlayer: 3 };
    case 'daily-word':
      return { rounds: 3 };
    case 'code-breaker':
      return { rounds: 3 };
    case 'doodle-chain':
      return { drawingSeconds: DEFAULT_DRAWING_SECONDS };
    case 'snap':
    case 'hush':
    case 'gomoku':
      return {};
  }
}

/**
 * What a room's next game will be played with, read off its snapshot, which
 * carries each setting under its own name; null for a game with nothing to
 * choose.
 */
export function settingsOf(room: AnyRoomState): GameSettings | null {
  switch (room.gameType) {
    case 'draw-and-guess':
      return { rounds: room.rounds, categories: room.categories };
    case 'daily-word':
    case 'code-breaker':
      return { rounds: room.rounds };
    case 'minesweeper':
      return { difficulty: room.difficulty };
    case 'make-24':
      return { hands: room.hands };
    case 'pairs':
      return { board: room.board };
    case 'trios':
      return { trios: room.trios };
    case 'liars-dice':
      return { dicePerPlayer: room.dicePerPlayer };
    case 'doodle-chain':
      return { drawingSeconds: room.drawingSeconds };
    case 'snap':
    case 'hush':
    case 'gomoku':
      return null;
  }
}

/**
 * DL04-DL06 and the rest: the setting a game lets a room choose, as a select
 * of its presets; Draw & Guess adds its word categories beside its rounds.
 * A new room's form asks it under the setting's own name with its helper;
 * between games the starter is asked it as the next game's (`label`), with no
 * helper. Nothing for a game with nothing to set.
 */
export function SettingField({
  gameType,
  settings,
  onChange,
  label,
}: {
  gameType: GameType;
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  /** In place of the setting's own name and its helper. */
  label?: string;
}) {
  const m = useMessages();
  const t = m.createRoom;
  const helper = (text: string) => (label === undefined ? text : undefined);
  switch (gameType) {
    case 'draw-and-guess': {
      // Two settings: the rounds, and the categories their game draws from.
      const current = settings as DrawAndGuessSettings;
      return (
        <>
          <SelectField
            label={label ?? t.rounds}
            options={ROUNDS.map((count) => ({
              value: count,
              label: t.roundCount(count),
            }))}
            value={current.rounds}
            onValueChange={(next) => onChange({ ...current, rounds: next })}
            name="rounds"
          />
          <CategoriesField
            categories={current.categories}
            onChange={(categories) => onChange({ ...current, categories })}
          />
        </>
      );
    }
    case 'make-24': {
      const { hands } = settings as Make24Settings;
      return (
        <SelectField
          label={label ?? t.hands}
          helper={helper(t.handsHelper)}
          options={HANDS.map((count) => ({
            value: count,
            label: t.handCount(count),
          }))}
          value={hands}
          onValueChange={(next) => onChange({ hands: next })}
          name="hands"
        />
      );
    }
    case 'liars-dice': {
      const { dicePerPlayer } = settings as LiarsDiceSettings;
      return (
        <SelectField
          label={label ?? t.diceEach}
          helper={helper(t.diceDetail(dicePerPlayer as DicePerPlayer))}
          options={DICE_PER_PLAYER.map((count) => ({
            value: count,
            label: t.diceCount(count),
            detail: t.diceDetail(count),
          }))}
          value={dicePerPlayer}
          onValueChange={(next) => onChange({ dicePerPlayer: next })}
          name="dicePerPlayer"
        />
      );
    }
    case 'pairs': {
      const { board } = settings as PairsSettings;
      return (
        <SelectField
          label={label ?? t.board}
          helper={helper(t.pairsDetail(board))}
          options={PAIRS_BOARDS.map((choice) => ({
            value: choice,
            label: t.boardName(choice),
            detail: t.pairsDetail(choice),
          }))}
          value={board}
          onValueChange={(next) => onChange({ board: next })}
          name="board"
        />
      );
    }
    case 'trios': {
      const { trios } = settings as TriosSettings;
      return (
        <SelectField
          label={label ?? t.trios}
          options={TRIOS_LENGTHS.map((count) => ({
            value: count,
            label: t.trioCount(count),
          }))}
          value={trios}
          onValueChange={(next) => onChange({ trios: next })}
          name="trios"
        />
      );
    }
    case 'daily-word': {
      const { rounds } = settings as DailyWordSettings;
      return (
        <SelectField
          label={label ?? t.words}
          helper={helper(t.wordsHelper)}
          options={WORDS.map((count) => ({
            value: count,
            label: t.wordCount(count),
          }))}
          value={rounds}
          onValueChange={(next) => onChange({ rounds: next })}
          name="words"
        />
      );
    }
    case 'code-breaker': {
      const { rounds } = settings as CodeBreakerSettings;
      return (
        <SelectField
          label={label ?? t.codes}
          helper={helper(t.codesHelper)}
          options={CODES.map((count) => ({
            value: count,
            label: t.codeCount(count),
          }))}
          value={rounds}
          onValueChange={(next) => onChange({ rounds: next })}
          name="codes"
        />
      );
    }
    case 'doodle-chain': {
      const { drawingSeconds } = settings as DoodleChainSettings;
      return (
        <SelectField
          label={label ?? t.drawingTime}
          helper={helper(t.drawingTimeHelper)}
          options={DRAWING_SECONDS.map((count) => ({
            value: count,
            label: t.secondCount(count),
          }))}
          value={drawingSeconds}
          onValueChange={(next) => onChange({ drawingSeconds: next })}
          name="drawingSeconds"
        />
      );
    }
    case 'minesweeper': {
      const { difficulty } = settings as MinesweeperSettings;
      return (
        <SelectField
          label={label ?? t.board}
          helper={helper(t.minesweeperDetail(difficulty))}
          options={DIFFICULTIES.map((choice) => ({
            value: choice,
            label: t.boardName(choice),
            detail: t.minesweeperDetail(choice),
          }))}
          value={difficulty}
          onValueChange={(next) => onChange({ difficulty: next })}
          name="board"
        />
      );
    }
    case 'snap':
    case 'hush':
    case 'gomoku':
      return null;
  }
}
