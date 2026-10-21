import type { ChatMessage, RoomNotice } from '../../../shared/wire-types.js';
import type { notices } from '../i18n/en/notices.js';

type NoticeCatalog = { notices: typeof notices };

/** The event union narrows each catalog call, so a new event must be translated. */
export function noticeText(notice: RoomNotice, m: NoticeCatalog): string {
  switch (notice.type) {
    case 'room:created':
      return m.notices['room:created'](notice);
    case 'room:joined':
      return m.notices['room:joined'](notice);
    case 'room:watching':
      return m.notices['room:watching'](notice);
    case 'room:seated':
      return m.notices['room:seated'](notice);
    case 'room:renamed':
      return m.notices['room:renamed'](notice);
    case 'room:owner-left':
      return m.notices['room:owner-left'](notice);
    case 'room:left':
      return m.notices['room:left'](notice);
    case 'room:disconnected':
      return m.notices['room:disconnected'](notice);
    case 'room:reconnected':
      return m.notices['room:reconnected'](notice);
    case 'game:ended':
      return m.notices['game:ended'](notice);
    case 'game:interrupted':
      return m.notices['game:interrupted'](notice);
    case 'game:over':
      return m.notices['game:over'](notice);
    case 'dg:started':
      return m.notices['dg:started'](notice);
    case 'dg:drawer-left':
      return m.notices['dg:drawer-left'](notice);
    case 'dg:drawer-lost':
      return m.notices['dg:drawer-lost'](notice);
    case 'dg:drawer-timeout':
      return m.notices['dg:drawer-timeout'](notice);
    case 'dg:drawer-returned':
      return m.notices['dg:drawer-returned'](notice);
    case 'dg:all-guessed':
      return m.notices['dg:all-guessed'](notice);
    case 'dg:guessed':
      return m.notices['dg:guessed'](notice);
    case 'ms:started':
      return m.notices['ms:started'](notice);
    case 'ms:mine':
      return m.notices['ms:mine'](notice);
    case 'make24:started':
      return m.notices['make24:started'](notice);
    case 'make24:solved':
      return m.notices['make24:solved'](notice);
    case 'pairs:started':
      return m.notices['pairs:started'](notice);
    case 'pairs:found':
      return m.notices['pairs:found'](notice);
    case 'trios:started':
      return m.notices['trios:started'](notice);
    case 'trios:found':
      return m.notices['trios:found'](notice);
    case 'snap:started':
      return m.notices['snap:started'](notice);
    case 'snap:took':
      return m.notices['snap:took'](notice);
    case 'ld:started':
      return m.notices['ld:started'](notice);
    case 'ld:auto-bid':
      return m.notices['ld:auto-bid'](notice);
    case 'ld:auto-call':
      return m.notices['ld:auto-call'](notice);
    case 'ld:called':
      return m.notices['ld:called'](notice);
    case 'ld:out':
      return m.notices['ld:out'](notice);
    case 'ld:reroll':
      return m.notices['ld:reroll'](notice);
    case 'hush:started':
      return m.notices['hush:started'](notice);
    case 'hush:mistake':
      return m.notices['hush:mistake'](notice);
    case 'hush:cleared':
      return m.notices['hush:cleared'](notice);
    case 'hush:won':
      return m.notices['hush:won'](notice);
    case 'hush:lost':
      return m.notices['hush:lost'](notice);
    case 'hush:discarded':
      return m.notices['hush:discarded'](notice);
    case 'dw:started':
      return m.notices['dw:started'](notice);
    case 'dw:solved':
      return m.notices['dw:solved'](notice);
    case 'dw:revealed':
      return m.notices['dw:revealed'](notice);
  }
}

/** A typed chat line, including the original text of messages players sent. */
export function chatText(message: ChatMessage, m: NoticeCatalog): string {
  return message.kind === 'player'
    ? message.text
    : noticeText(message.notice, m);
}
