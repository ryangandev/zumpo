import type { ChatMessage } from '../../../shared/wire-types.js';
import type { chat } from '../i18n/en/chat.js';
import type { notices } from '../i18n/en/notices.js';
import { noticeText } from './notice-text';

type ChatCatalog = { chat: typeof chat; notices: typeof notices };

/** One line as the chat shows it, worded for this viewer. */
export interface ChatLine {
  /** The first message it stands for, which keys it. */
  key: number;
  /** The last message it stands for: anything newer arrived after it. */
  id: number;
  kind: ChatMessage['kind'];
  /** Who said it, for a player's line; "(you)" for the viewer's own. */
  name?: string;
  text: string;
  /** The viewer's own line. */
  mine: boolean;
}

/**
 * The room's chat as lines to show. A run of joins with nothing between them
 * is one line ("Ana, Ben and Cam have joined the room."), so a room filling
 * up does not fill the chat.
 */
export function chatLines(
  messages: readonly ChatMessage[],
  viewerId: string,
  m: ChatCatalog,
): ChatLine[] {
  const lines: ChatLine[] = [];
  let joined: string[] = [];

  for (const message of messages) {
    if (message.kind === 'player') {
      joined = [];
      const mine = message.playerId === viewerId;
      lines.push({
        key: message.id,
        id: message.id,
        kind: 'player',
        name: mine ? m.chat.you(message.username) : message.username,
        text: message.text,
        mine,
      });
      continue;
    }

    const { notice } = message;
    const last = lines.at(-1);
    if (notice.type === 'room:joined' && joined.length > 0 && last) {
      joined.push(notice.name);
      last.id = message.id;
      last.text = m.chat.joined(joined);
      continue;
    }
    joined = notice.type === 'room:joined' ? [notice.name] : [];
    lines.push({
      key: message.id,
      id: message.id,
      kind: message.kind,
      text: noticeText(notice, m),
      mine: false,
    });
  }
  return lines;
}

/**
 * Whether a line is news worth a mark on a phone's Chat tab: somebody else
 * talking, or a moment that matters. Quiet lines (joins, scores, a new turn)
 * would keep the mark lit all game and mean nothing.
 */
export function isNews(line: ChatLine): boolean {
  if (line.kind === 'player') return !line.mine;
  return line.kind === 'success' || line.kind === 'alert';
}
