import { itemAt } from '../../../shared/list';
import type { Locale } from '../i18n/locale';

/*
 * The name a visitor starts with, so nothing stands between them and a game:
 * a friendly adjective and an animal, like Sleepy Otter, in the visitor's own
 * language. Every pair fits the server's 18 characters, and gives the avatar
 * two initials: the English words' first letters, the Chinese name's first
 * two characters.
 */

const ADJECTIVES = [
  'Brave',
  'Breezy',
  'Bubbly',
  'Bouncy',
  'Calm',
  'Cheery',
  'Clever',
  'Comfy',
  'Cosmic',
  'Curious',
  'Dapper',
  'Dizzy',
  'Dreamy',
  'Fancy',
  'Fizzy',
  'Fluffy',
  'Gentle',
  'Giddy',
  'Golden',
  'Happy',
  'Jolly',
  'Lucky',
  'Mellow',
  'Merry',
  'Mighty',
  'Nimble',
  'Peppy',
  'Plucky',
  'Quiet',
  'Quirky',
  'Rosy',
  'Silly',
  'Sleepy',
  'Snappy',
  'Sparkly',
  'Speedy',
  'Sunny',
  'Swift',
  'Tiny',
  'Witty',
  'Zesty',
  'Zippy',
] as const;

const ANIMALS = [
  'Badger',
  'Beaver',
  'Bunny',
  'Capybara',
  'Crab',
  'Duck',
  'Ferret',
  'Finch',
  'Fox',
  'Frog',
  'Gecko',
  'Goose',
  'Hedgehog',
  'Heron',
  'Koala',
  'Lemur',
  'Llama',
  'Lynx',
  'Marmot',
  'Mole',
  'Moose',
  'Newt',
  'Octopus',
  'Otter',
  'Owl',
  'Panda',
  'Parrot',
  'Penguin',
  'Pigeon',
  'Puffin',
  'Quokka',
  'Raccoon',
  'Robin',
  'Seal',
  'Sloth',
  'Squid',
  'Tapir',
  'Toad',
  'Turtle',
  'Walrus',
  'Wombat',
  'Yak',
] as const;

const ADJECTIVES_ZH = [
  '勇敢',
  '清爽',
  '活泼',
  '蹦跳',
  '淡定',
  '开朗',
  '聪明',
  '舒服',
  '宇宙',
  '好奇',
  '潇洒',
  '晕乎',
  '梦幻',
  '花哨',
  '冒泡',
  '蓬松',
  '温柔',
  '傻乐',
  '金色',
  '快乐',
  '欢乐',
  '幸运',
  '松弛',
  '愉快',
  '威武',
  '灵巧',
  '元气',
  '机灵',
  '安静',
  '古怪',
  '粉嫩',
  '傻气',
  '瞌睡',
  '利落',
  '闪亮',
  '飞快',
  '阳光',
  '敏捷',
  '迷你',
  '机智',
  '带劲',
  '轻快',
] as const;

const ANIMALS_ZH = [
  '狗獾',
  '河狸',
  '兔子',
  '水豚',
  '螃蟹',
  '鸭子',
  '雪貂',
  '燕雀',
  '狐狸',
  '青蛙',
  '壁虎',
  '大鹅',
  '刺猬',
  '苍鹭',
  '考拉',
  '狐猴',
  '羊驼',
  '猞猁',
  '旱獭',
  '鼹鼠',
  '驼鹿',
  '蝾螈',
  '章鱼',
  '水獭',
  '夜枭',
  '熊猫',
  '鹦鹉',
  '企鹅',
  '鸽子',
  '海鹦',
  '袋鼠',
  '浣熊',
  '画眉',
  '海豹',
  '树懒',
  '鱿鱼',
  '小貘',
  '蟾蜍',
  '乌龟',
  '海象',
  '袋熊',
  '牦牛',
] as const;

/** Each language's word lists, and how its two words are put together. */
export const NAME_WORDS: Readonly<
  Record<
    Locale,
    {
      adjectives: readonly string[];
      animals: readonly string[];
      join: (adjective: string, animal: string) => string;
    }
  >
> = {
  en: {
    adjectives: ADJECTIVES,
    animals: ANIMALS,
    join: (adjective, animal) => `${adjective} ${animal}`,
  },
  zh: {
    adjectives: ADJECTIVES_ZH,
    animals: ANIMALS_ZH,
    join: (adjective, animal) => `${adjective}${animal}`,
  },
};

const pick = <T>(list: readonly T[], random: () => number): T =>
  itemAt(list, Math.floor(random() * list.length) % list.length);

/**
 * A random name in `locale`, never `unlike`, so rolling again always shows a
 * new one. `random` is there for tests.
 */
export function randomName(
  locale: Locale,
  unlike?: string,
  random: () => number = Math.random,
): string {
  const words = NAME_WORDS[locale];
  for (;;) {
    const name = words.join(
      pick(words.adjectives, random),
      pick(words.animals, random),
    );
    if (name !== unlike) return name;
  }
}
