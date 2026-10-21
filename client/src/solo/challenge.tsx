import { Button, Card } from '../ui';
import { useMessages } from '../i18n';
import { SwapLabel } from '../shell/swap-label';
import { useCopy } from '../shell/use-copy';
import styles from './challenge.module.css';

/**
 * The whole address of a challenge: the same game, for somebody else. The
 * parameters deal it: a seed, and for Pairs the board.
 */
export const challengeLink = (path: string, deal: Record<string, string>) =>
  `${window.location.origin}${path}?${new URLSearchParams(deal)}`;

/** Challenge a friend, among a finished game's actions (T05, PR04). */
export function ChallengeButton({ link }: { link: string }) {
  const m = useMessages();
  const { copied, copy } = useCopy(link);
  return (
    <Button variant="secondary" icon={copied ? 'check' : 'link'} onClick={copy}>
      <SwapLabel
        second={copied}
        labels={[m.solo.challengeFriend, m.solo.linkCopied]}
      />
    </Button>
  );
}

/** The card beside a finished game with the same link (T05, PR04). */
export function ChallengeCard({
  description,
  link,
}: {
  /** "They get these same ten hands and try to beat 2:41." */
  description: string;
  link: string;
}) {
  const m = useMessages();
  const { copied, copy } = useCopy(link);
  return (
    <Card kind="panel" title={m.solo.challengeFriend} description={description}>
      <Button
        className={styles.copy}
        variant="secondary"
        icon={copied ? 'check' : 'link'}
        onClick={copy}
      >
        <SwapLabel
          second={copied}
          labels={[m.solo.copyChallengeLink, m.solo.linkCopied]}
        />
      </Button>
    </Card>
  );
}
