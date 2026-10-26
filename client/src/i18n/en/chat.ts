import { andList } from './plural';

/** The room chat's own words; what the server announces is in notices.ts. */
export const chat = {
  /** The viewer's own lines are named You, as the Players panel tags them. */
  you: 'You',
  /**
   * After the viewer's own Draw & Guess guess that is a letter or two off
   * the word, which only they see.
   */
  close: 'So close!',
  /** Joins one after another, said once: "Ana, Ben and Cam have joined". */
  joined: (names: readonly string[]) =>
    `${andList(names)} have joined the room.`,
};
