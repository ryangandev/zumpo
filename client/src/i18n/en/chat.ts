import { andList } from './plural';

/** The room chat's own words; what the server announces is in notices.ts. */
export const chat = {
  /** The viewer's own lines are marked. */
  you: (name: string) => `${name} (you)`,
  /** Joins one after another, said once: "Ana, Ben and Cam have joined". */
  joined: (names: readonly string[]) =>
    `${andList(names)} have joined the room.`,
};
