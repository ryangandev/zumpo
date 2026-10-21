import { plural } from './plural';

export const lobby = {
  playTogether: 'Play together',
  title: (game: string) => `${game} rooms`,
  subtitle: 'Join a room or make one for your friends.',
  liveCount: (count: number) => `${plural(count, 'room')} · Updates live`,
  playingAs: (name: string) => `Playing as ${name}`,
  /** A room's host, and its setting when it has one. */
  hostedBy: (name: string, setting: string) =>
    setting ? `Hosted by ${name} · ${setting}` : `Hosted by ${name}`,
  watching: (count: number) => `${count} watching`,
  /** The game page's rules panel links to every rule on the rules page. */
  fullRules: 'Full rules',
  createRoom: 'Create a room',
  emptyTitle: 'A little quiet in here.',
  emptyDescription:
    'Be the first to make a room. Bring a friend and get playing.',
  createFirstRoom: 'Create the first room',
  loadingTitle: 'Finding your people…',
  loadingDescription: 'Connecting to the room list.',
};
