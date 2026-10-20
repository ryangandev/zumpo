import { itemAt } from '../../../shared/list';
import {
  brokenFeature,
  cardFeatures,
  type CardFeatures,
} from '../../../shared/trios';
import type { Messages } from '../i18n';

/**
 * Why three cards are not a trio, by the first feature that breaks it:
 * "Two are striped and one is solid." Null when they are one.
 */
export function whyNotATrio(
  cards: readonly number[],
  m: Messages,
): string | null {
  const feature = brokenFeature(
    itemAt(cards, 0),
    itemAt(cards, 1),
    itemAt(cards, 2),
  );
  if (feature === null) return null;
  const features = cards.map(cardFeatures);
  const valueOf = (f: CardFeatures) => f[feature];
  // Exactly two share the feature's value; the odd one out is the other.
  const odd = features.find(
    (f) => features.filter((g) => valueOf(g) === valueOf(f)).length === 1,
  )!;
  const pair = features.find((f) => f !== odd)!;
  return m.trios.reason(feature, pair, odd);
}
