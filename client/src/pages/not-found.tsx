import { ButtonLink, Card } from '../ui';
import { useMessages } from '../i18n';
import { Page } from '../shell/page';
import { Stage } from '../shell/stage';
import { usePageTitle } from '../shell/use-page-title';

/** P10: any path the app does not know. */
export default function NotFoundPage() {
  const m = useMessages().shell.notFound;
  usePageTitle(m.title);
  return (
    <Page>
      <Stage>
        <Card
          title={m.title}
          description={m.description}
          actions={<ButtonLink to="/">{m.backHome}</ButtonLink>}
        />
      </Stage>
    </Page>
  );
}
