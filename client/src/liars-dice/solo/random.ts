import { itemAt } from '../../../../shared/list';

/** The dice and the bots' choices on your own: the browser's secure generator, from 0 up to 1. */
export function soloRandom(): number {
  return itemAt(crypto.getRandomValues(new Uint32Array(1)), 0) / 2 ** 32;
}
