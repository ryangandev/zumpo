export const solo = {
  onYourOwn: 'On your own',
  leave: 'Leave',
  leaveTitle: 'Leave this game?',
  stay: 'Stay',
  play: 'Play',
  cancel: 'Cancel',
  linkCopied: 'Link copied',
  challenge: 'Challenge',
  challengeFriend: 'Challenge a friend',
  copyChallengeLink: 'Copy challenge link',
  today: 'Today',
  yesterday: 'Yesterday',
  date: (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
};
