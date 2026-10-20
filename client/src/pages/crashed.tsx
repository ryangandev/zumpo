import { useEffect } from 'react';
import { useRouteError } from 'react-router';
import { Button, Card } from '../ui';
import { useMessages } from '../i18n';
import { Page } from '../shell/page';
import { Stage } from '../shell/stage';

/**
 * What a page that threw shows in its place: a way back in rather than a blank
 * screen. Most often a deploy replaced the code this page was loading, which a
 * reload fetches afresh.
 */
export default function CrashedPage() {
  const m = useMessages().shell.crashed;
  const error = useRouteError();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Page>
      <Stage>
        <Card
          title={m.title}
          description={m.description}
          actions={
            <Button onClick={() => window.location.reload()}>{m.reload}</Button>
          }
        />
      </Stage>
    </Page>
  );
}
