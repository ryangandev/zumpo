import { useId, useRef, useState, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router';
import type { GameType, RoomCreateRequest } from '../../../shared/wire-types';
import { Button, ButtonLink, Notice, SelectField, TextField } from '../ui';
import { gameInfo, gamePath, roomPath } from '../games/catalog';
import { defaultSettings, SettingField } from '../games/setting-field';
import { useMessages } from '../i18n';
import { levelsFor } from '../../../shared/hush';
import { useConnectedSession } from '../net/session';
import { REQUEST_TIMEOUT_MS } from '../net/socket';
import { ConnectionLost } from '../shell/connection-lost';
import { FormPage } from '../shell/form-page';
import { Page } from '../shell/page';
import { PageHeading } from '../shell/page-heading';
import { Stage } from '../shell/stage';
import { StatusLine } from '../shell/status-line';
import styles from './create-room.module.css';

/** The server's limits. */
const ROOM_NAME_MAX_LENGTH = 40;
const PASSWORD_MAX_LENGTH = 20;

/**
 * DL04-DL06, DL10, DL11, ML04-ML06, ML10, MO05, T10, PR08, TS10, LD07, HU09,
 * DW11, SN10, DC02, CB14, GM07: a new room. The game's own setting is in view
 * and every other has a sensible default, so Create room is one click away;
 * More options holds the room's name, its seats and a password. Hush's seats
 * are its length, so they stay in view.
 */
export default function CreateRoomPage({ gameType }: { gameType: GameType }) {
  const game = gameInfo(gameType);
  const m = useMessages();
  const text = m.games.of[gameType];
  const { socket, lost, name } = useConnectedSession();
  const navigate = useNavigate();

  // The suggested name, kept as it is, names the room after whoever hosts
  // it, so it follows the crown when this player leaves.
  const [suggested] = useState(() =>
    m.createRoom.defaultName(name).slice(0, ROOM_NAME_MAX_LENGTH),
  );
  const [roomName, setRoomName] = useState(suggested);
  const [nameMissing, setNameMissing] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const [more, setMore] = useState(false);
  const moreId = useId();
  const [seats, setSeats] = useState(game.maxPlayers);
  const [settings, setSettings] = useState(() => defaultSettings(gameType));
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<'error' | 'full' | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const trimmed = roomName.trim();
    if (!trimmed) {
      // The name is under More options: open them to show what is wrong.
      flushSync(() => {
        setMore(true);
        setNameMissing(true);
      });
      nameField.current?.focus();
      return;
    }
    const request: RoomCreateRequest = {
      gameType,
      roomName: trimmed === suggested ? '' : trimmed,
      username: name,
      maxPlayers: seats,
      password,
      settings,
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

  const title = m.createRoom.title(text.name);
  if (lost) {
    return (
      <Page>
        <PageHeading title={title} subtitle={text.createDescription} />
        <Stage>
          <ConnectionLost />
        </Stage>
      </Page>
    );
  }

  // Hush has no settings of its own: its length is its seats, so they stay
  // in view. A room of exactly two, as Gomoku's, has no seats to pick.
  const hasSeats = game.minPlayers < game.maxPlayers;
  const seatsInView = gameType === 'hush';
  const seatsField = hasSeats && (
    <SelectField
      label={m.createRoom.seats}
      helper={
        seatsInView
          ? m.createRoom.hushSeatsHelper(
              game.maxPlayers,
              levelsFor(2),
              levelsFor(game.maxPlayers),
            )
          : undefined
      }
      options={seatCounts(game.minPlayers, game.maxPlayers).map((count) => ({
        value: count,
        label: m.createRoom.players(count),
      }))}
      value={seats}
      onValueChange={setSeats}
      name="seats"
    />
  );

  return (
    <FormPage
      phone={{ title, subtitle: text.createDescription }}
      title={title}
      description={text.createDescription}
      grows
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
      {seatsInView && seatsField}
      <SettingField
        gameType={gameType}
        settings={settings}
        onChange={setSettings}
      />
      {/* While the room is being made, nothing more is to be chosen. */}
      {!pending && (
        <Button
          variant="quiet"
          icon="chevron-down"
          className={styles.moreButton}
          aria-expanded={more}
          aria-controls={moreId}
          onClick={() => setMore(!more)}
        >
          {m.createRoom.moreOptions}
        </Button>
      )}
      <div id={moreId} className={styles.more} hidden={!more}>
        <TextField
          label={m.createRoom.roomName}
          ref={nameField}
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
        {!seatsInView && seatsField}
        <TextField
          label={m.createRoom.password}
          type="password"
          value={password}
          onValueChange={(next: string) => setPassword(next)}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          name="password"
        />
      </div>
      {pending && <StatusLine>{m.createRoom.creating}</StatusLine>}
    </FormPage>
  );
}

/** 2, 3, … up to `max`: every room needs two to start. */
const seatCounts = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, index) => index + min);
