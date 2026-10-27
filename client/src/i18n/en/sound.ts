/** The sound menu the speaker in the header and the room bar opens. */
export const sound = {
  /** The speaker's accessible name, which says the state. */
  trigger: {
    on: 'Sound on',
    off: 'Sound off',
  },
  /** The menu's accessible name. */
  menu: 'Sound',
  effects: {
    label: 'Sound effects',
    /** The toggle beside the slider, pressed while muted. */
    mute: 'Mute sound effects',
    /** The slider's accessible name. */
    volume: 'Sound effects volume',
  },
  /** The level the row shows, 0 to 100. */
  level: (percent: number) => `${percent}%`,
  /** The level the row shows while muted. */
  off: 'Off',
  /** What a screen reader says of the slider. */
  valueText: (percent: number, muted: boolean) =>
    muted ? `${percent}%, muted` : `${percent}%`,
};
