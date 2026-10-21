import type { ReactNode } from 'react';
import { Button, Card } from '../ui';
import { useMessages } from '../i18n';
import { useCopy } from '../shell/use-copy';
import styles from './challenge.module.css';

/**
 * The whole address of a challenge: the same game, for somebody else. The
 * parameters deal it: a seed, and for Pairs the board.
 */
export const challengeLink = (path: string, deal: Record<string, string>) =>
  `${window.location.origin}${path}?${new URLSearchParams(deal)}`;

/**
 * Challenge a friend, the one way to it beside a finished game (T05, PR04,
 * DW06, CB08): what they get, and a button that copies it.
 */
export function ChallengeCard({
  description,
  text,
  children,
}: {
  /** "They get these same ten hands and try to beat 2:41." */
  description: string;
  /** What is copied: the link, or a result to paste with the link in it. */
  text: string;
  /** What the friend will have to beat, such as the marks of each guess. */
  children?: ReactNode;
}) {
  const m = useMessages();
  const { copied, copy } = useCopy(text);
  return (
    <Card kind="panel" title={m.solo.challengeFriend} description={description}>
      {children}
      <Button
        className={styles.copy}
        variant="secondary"
        icon={copied ? 'check' : 'link'}
        onClick={copy}
      >
        {copied ? m.solo.linkCopied : m.solo.copyChallengeLink}
      </Button>
    </Card>
  );
}
