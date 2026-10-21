import { useMemo, useState } from 'react';
import { Chat, ChatMessage, type ChatProps, type GlyphName } from '../ui';
import { useMessages } from '../i18n';
import { chatLines, isNews, type ChatLine } from './chat-lines';
import { useRoomContext } from './room-context';
import styles from './room-chat.module.css';

/** The room's chat as lines, worded in the viewer's language. */
function useChatLines(): ChatLine[] {
  const room = useRoomContext();
  const m = useMessages();
  return useMemo(
    () => chatLines(room.chat, room.playerId, m),
    [room.chat, room.playerId, m],
  );
}

/**
 * The room's chat: what players typed, as they typed it, and what the server
 * announced, worded in the viewer's language.
 */
export function RoomChat({
  input,
  alertIcon,
}: {
  input: ChatProps['input'];
  /** The game's own Alert icon in the chat, as Chat message allows. */
  alertIcon?: GlyphName;
}) {
  const lines = useChatLines();
  return (
    <Chat input={input}>
      {lines.map((line) => (
        <ChatMessage
          key={line.key}
          kind={line.kind}
          alertIcon={alertIcon}
          name={line.name}
        >
          {line.text}
        </ChatMessage>
      ))}
    </Chat>
  );
}

/** How many of the newest lines show under a phone's board. */
const RECENT = 3;

/**
 * On a phone's Board tab, the newest few lines of the chat under the game,
 * read-only, so the guesses can be watched without leaving the canvas. The
 * viewer's own line flashes as it arrives, so a guess always gets an answer.
 * It is three lines tall whatever they say, so nothing under it moves, and an
 * older line that no longer fits fades out at the top.
 */
export function RecentChat({ alertIcon }: { alertIcon?: GlyphName }) {
  const m = useMessages();
  const lines = useChatLines();
  // Lines already there when it opened are not news, whatever they say.
  const [openedAfter] = useState(() => lines.at(-1)?.id ?? -1);
  return (
    <ul
      className={styles.recent}
      role="log"
      aria-live="polite"
      aria-label={m.ui.chat.title}
    >
      {lines.slice(-RECENT).map((line) => (
        <ChatMessage
          key={line.key}
          kind={line.kind}
          alertIcon={alertIcon}
          name={line.name}
          flash={line.mine && line.id > openedAfter}
          truncate
        >
          {line.text}
        </ChatMessage>
      ))}
    </ul>
  );
}

/**
 * How many lines of news arrived while the chat was out of sight. Whatever
 * was there when the room opened is not news, and seeing the chat clears it.
 */
export function useUnreadChat(reading: boolean): number {
  const lines = useChatLines();
  const latest = lines.at(-1)?.id;
  const [seen, setSeen] = useState(latest);
  if (
    latest !== undefined &&
    latest !== seen &&
    (reading || seen === undefined)
  ) {
    setSeen(latest);
  }
  if (reading || seen === undefined) return 0;
  return lines.filter((line) => line.id > seen && isNews(line)).length;
}
