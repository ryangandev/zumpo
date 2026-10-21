import { plural } from './plural';

export const lobby = {
  playTogether: 'Play together',
  title: (game: string) => `${game} rooms`,
  subtitle: 'Join a room or make one for your friends.',
  liveCount: (count: number) => `${plural(count, 'room')} · Updates live`,
  /** A room's host, and its setting when it has one. */
  hostedBy: (name: string, setting: string) =>
    setting ? `Hosted by ${name} · ${setting}` : `Hosted by ${name}`,
  watching: (count: number) => `${count} watching`,
  /** The game page's rules panel. */
  howToPlay: 'How to play',
  createRoom: 'Create a room',
  emptyTitle: 'No rooms yet.',
  emptyDescription:
    'Be the first to make a room. Bring a friend and get playing.',
  loadingTitle: 'Finding your people…',
  loadingDescription: 'Connecting to the room list.',
};
