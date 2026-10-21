/** The frame of every page: header, footer, the name menu, and the ways out. */
export const shell = {
  nav: {
    games: 'Games',
    /** The main navigation's accessible name. */
    main: 'Main',
    /** The wordmark link's accessible name. */
    home: 'Zumpo home',
  },
  footer: {
    wide: 'Good company. One more round.',
    narrow: 'A little play. Good company.',
  },
  language: {
    /** The footer switch's accessible name. */
    label: 'Language',
  },
  name: {
    yourName: 'Your name',
    /** The viewer's avatar button, which opens the name menu. */
    viewer: (name: string) => `${name}: your name`,
    changeName: 'Change name',
    helper: 'Everyone in your rooms sees it.',
    save: 'Save',
    roll: 'Roll a name',
    empty: 'Enter a name with at least one visible character.',
  },
  connection: {
    replacedTitle: 'Zumpo is open in another tab.',
    replacedDescription:
      'You’re playing there now. Use this tab instead, and the other one will wait.',
    useThisTab: 'Use this tab',
    failedTitle: 'We couldn’t get connected.',
    failedDescription: 'The game server didn’t respond. Please try again.',
    tryAgain: 'Try again',
  },
  backToGames: 'Back to games',
  notFound: {
    title: 'A little lost?',
    description:
      'We couldn’t find this page. There are still good games waiting for you.',
    backHome: 'Back home',
  },
  crashed: {
    title: 'Something went wrong',
    description:
      'This page stopped working. Reloading usually puts it right, and a room keeps your seat.',
    reload: 'Reload',
  },
};
