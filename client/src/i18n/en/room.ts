export const room = {
  connectingTitle: 'Getting the room ready…',
  connectingDescription: 'Connecting to Zumpo. This normally takes a moment.',
  connecting: 'Connecting…',
  unavailableTitle: 'That room moved on.',
  unavailableDescription:
    'Every seat and every spectator seat is taken, or it closed before you joined. Choose another room.',
  notFoundTitle: 'This room has packed up.',
  notFoundDescription:
    'The room no longer exists. Find another room or start your own.',
  closedTitle: 'Zumpo just restarted.',
  closedDescription:
    'Rooms close when Zumpo restarts for an update, so this one has ended. Find another room or start your own.',
  expiredTitle: 'Let’s find you a fresh start.',
  expiredDescription:
    'We couldn’t reconnect. Your seat may have been released. You can return to the room list.',
  backToRooms: 'Back to rooms',
  passwordDescription: (name?: string) =>
    `Enter the password for ${name ?? 'this room'}.`,
  comeIn: 'Come on in',
  passwordTitle: 'This room has a secret.',
  join: 'Join room',
  password: 'Room password',
  passwordHelper: 'Ask the host for the room password.',
  passwordPhoneHelper: 'Ask the host for the password.',
  passwordRejected: 'That password didn’t work. Try again.',
  joining: 'Joining the room…',
  reconnecting: 'Reconnecting…',
  reconnectingNotice: (name: string, seconds: number) =>
    `Reconnecting to ${name}… Your seat and score are kept for ${seconds} seconds.`,
  board: 'Board',
  players: (count: number) => `Players · ${count}`,
  chat: 'Chat',
  /** The browser tab's title while it is in the background and it is your go. */
  turnTitle: '(!) Your turn · Zumpo',
  leaveTitle: (name: string) => `Leave ${name}?`,
  leaveInGame: (score: string) =>
    `The game carries on without you, and your seat and your ${score} go with you. You can join again while a seat is open.`,
  leaveBetweenGames:
    'Your seat goes with you. You can join again while a seat is open.',
  leaveSpectating:
    'You’re only watching, so nothing is lost. You can come back while a spectator seat is open.',
  leave: 'Leave room',
  stay: 'Stay',
  watching: 'Watching',
  spectator: 'Watching',
  watch: 'Watch instead',
  sit: 'Take a seat',
  moving: 'Moving…',
  /** Why a start or a move between seats did not happen. */
  refused: {
    notEnoughPlayers: 'The game needs more players before it can start.',
    notRoomOwner: 'Only the host can start the game.',
    gameAlreadyStarted: 'The game has already started.',
    seatsTaken: 'Every seat at the table is taken.',
    spectatorSeatsTaken: 'Every spectator seat is taken.',
    noAnswer: 'Zumpo didn’t answer. Try again.',
    failed: 'That didn’t work. Try again.',
  },
  spectatingTitle: 'You’re watching.',
  spectatingSeatFree: 'Take a seat to play in the next game, or keep watching.',
  spectatingSeatsFull:
    'Every seat is taken. You can take one once somebody gives theirs up.',
  spectatingNotice:
    'You’re watching this game. You can take a seat once it ends.',
  rulesTitle: (game: string) => `How to play ${game}`,
  backToGame: 'Back to the game',
  invite: 'Invite friends',
  inviteDescription: (name: string) =>
    `Anyone with this link can join ${name} while a seat is open.`,
  copied: 'Copied',
  copy: 'Copy',
  done: 'Done',
  roomLink: 'Room link',
  pickedName: (name: string) =>
    `You’re ${name} for now. Pick a name your friends will know.`,
  waitingForHost: (name: string) => `Waiting for ${name} to start.`,
  guestSetup: (setup: string) => `${setup} Only the host can start the game.`,
  needsPlayers: (game: string, fewest: number) =>
    `${game} needs at least ${fewest} players. Share the room so a friend can join, and the game can start.`,
  everyoneHere: 'Everyone’s here?',
  starting: 'Starting the game…',
  start: 'Start game',
  everyoneLeft: 'Everyone else left.',
  endedEarly: (game: string) =>
    `${game} needs at least 2 players, so the game has ended. You are the host now: invite friends to start a new one.`,
  waitingForAgain: (name: string) =>
    `Waiting for ${name} to start another game.`,
  playAgain: 'Play again',
  gameOver: 'Game over.',
  wins: (name: string, score: string) => `${name} wins with ${score}.`,
  ties: (names: string, score: string) => `${names} tie with ${score}.`,
  finished: (detail: string, place: string) =>
    `${detail} You finished ${place}.`,
  standings: 'Standings',
  winner: 'Winner',
  place: (place: string) => `${place} place`,
  listNames: (names: readonly string[]): string => {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  },
  ordinal: (place: number): string => {
    const tens = place % 100;
    if (tens >= 11 && tens <= 13) return `${place}th`;
    const suffix = ['th', 'st', 'nd', 'rd'][place % 10] ?? 'th';
    return `${place}${suffix}`;
  },
};
