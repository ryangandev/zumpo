import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from '../../i18n';
import { BidPicker } from './bid-picker';
import { ChatInput } from './chat-input';
import { CodeMarks } from './code-marks';
import { Die } from './die';
import { DigitPad } from './digit-pad';
import { DrawingToolbar } from './drawing-toolbar';
import { Keyboard } from './keyboard';
import { Lives } from './lives';
import { MineCell } from './mine-cell';
import { PairsCard } from './pairs-card';
import { PlayerRow } from './player-row';
import { Scoreboard } from './scoreboard';
import { SnapCard } from './snap-card';
import { TriosCard } from './trios-card';
import { WordChoice } from './word-choice';

const noop = () => {};
const renderChinese = (ui: Parameters<typeof render>[0]) =>
  render(ui, { wrapper: LocaleProvider });

function SwitchLanguage() {
  const { setLocale } = useLocale();
  return <button onClick={() => setLocale('en')}>English</button>;
}

describe('public components in Chinese', () => {
  beforeEach(() => localStorage.setItem('zumpo:locale', 'zh'));
  afterEach(() => localStorage.removeItem('zumpo:locale'));

  it('translates chat defaults and sends player messages unchanged', async () => {
    const onSend = vi.fn<(text: string) => void>();
    renderChinese(<ChatInput onSend={onSend} />);
    const message = screen.getByRole('textbox', { name: '消息' });
    expect(message).toHaveAttribute('placeholder', '猜一猜，或打个招呼…');
    await userEvent.type(message, '  hello  ');
    await userEvent.click(screen.getByRole('button', { name: '发送' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith('hello');
    expect(message).toHaveValue('');
  });

  it('preserves caller-provided input copy', () => {
    renderChinese(
      <ChatInput onSend={noop} label="猜词" placeholder="输入答案" />,
    );
    expect(screen.getByRole('textbox', { name: '猜词' })).toHaveAttribute(
      'placeholder',
      '输入答案',
    );
  });

  it('switches keyboard labels and marks without changing the English letters', async () => {
    const onEnter = vi.fn<() => void>();
    renderChinese(
      <>
        <Keyboard
          marks={{ s: 'correct', t: 'present', e: 'absent' }}
          onLetter={noop}
          onEnter={onEnter}
          onDelete={noop}
        />
        <SwitchLanguage />
      </>,
    );
    const keyboard = screen.getByRole('group', { name: '键盘' });
    expect(
      within(keyboard).getByRole('button', { name: 'S，位置正确' }),
    ).toBeVisible();
    expect(
      within(keyboard).getByRole('button', { name: 'T，在单词中，但位置不对' }),
    ).toBeVisible();
    expect(
      within(keyboard).getByRole('button', { name: 'E，不在单词中' }),
    ).toBeVisible();
    expect(
      within(keyboard).getByRole('button', { name: '删除字母' }),
    ).toBeVisible();
    await userEvent.click(
      within(keyboard).getByRole('button', { name: '确认' }),
    );
    expect(onEnter).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(keyboard).toHaveAccessibleName('Keyboard');
    expect(
      within(keyboard).getByRole('button', { name: 'S, right place' }),
    ).toBeVisible();
    expect(
      within(keyboard).getByRole('button', { name: 'Enter' }),
    ).toBeVisible();
  });

  it('words the digit pad and a guess’s pegs, never its digits', () => {
    renderChinese(
      <>
        <DigitPad
          notes={{ 5: 'out', 4: 'in' }}
          onNoting={noop}
          onDigit={noop}
          onEnter={noop}
          onDelete={noop}
        />
        <CodeMarks mark={{ right: 2, moved: 1 }} />
      </>,
    );
    const pad = screen.getByRole('group', { name: '数字键盘' });
    expect(
      within(pad).getByRole('button', { name: '5，已记为不在答案中' }),
    ).toBeVisible();
    expect(
      within(pad).getByRole('button', { name: '4，已记为在答案中' }),
    ).toBeVisible();
    expect(within(pad).getByRole('button', { name: '7' })).toBeVisible();
    expect(within(pad).getByRole('button', { name: '删除数字' })).toBeVisible();
    expect(within(pad).getByRole('button', { name: '笔记' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(
      screen.getByRole('img', { name: '2 个位置正确，1 个位置不对' }),
    ).toBeVisible();
  });

  it('translates player markers, seat counts, lives and card descriptions', () => {
    renderChinese(
      <>
        <Scoreboard players={1} seats={8}>
          <PlayerRow
            name="活泼水獭"
            initials="活泼"
            tone="blue"
            status="等待中"
            host
            you
          />
        </Scoreboard>
        <Lives lives={2} />
        <MineCell state={{ kind: 'picked' }} row={0} column={1} />
        <PairsCard state={{ kind: 'matched', symbol: 0 }} row={1} column={0} />
        <TriosCard card={0} state="selected" />
        <SnapCard
          symbols={[9, 0, 1, 2, 3, 4]}
          label="中间的牌"
          state="taken"
          badgeLabel="被 小美 抢走"
          marks={{ 9: 'match' }}
        />
        <WordChoice word="turtle" onChoose={noop} />
      </>,
    );
    expect(screen.getByRole('heading', { name: '玩家' })).toBeVisible();
    expect(screen.getByLabelText('已有 1 人，共 8 个位置')).toBeVisible();
    expect(screen.getByRole('img', { name: '房主' })).toBeVisible();
    expect(screen.getByText('你')).toBeVisible();
    expect(screen.getByRole('img', { name: '2 条命' })).toBeVisible();
    expect(
      screen.getByRole('gridcell', { name: '第 1 行，第 2 列：你的选择' }),
    ).toBeVisible();
    expect(
      screen.getByRole('gridcell', {
        name: '第 2 行，第 1 列：珊瑚色圆形，已配对',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('img', { name: '1 个珊瑚色实心圆形，已选中' }),
    ).toBeVisible();
    expect(
      screen.getByRole('group', { name: '中间的牌，被 小美 抢走' }),
    ).toBeVisible();
    expect(screen.getByRole('img', { name: '爱心，两张牌都有' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'turtle6 个字母' }),
    ).toBeVisible();
  });

  it('translates drawing and dice controls while preserving their values', async () => {
    const onCountChange = vi.fn<(count: number) => void>();
    renderChinese(
      <>
        <DrawingToolbar
          colour="ink"
          size={4}
          onColourChange={noop}
          onSizeChange={noop}
          onUndo={noop}
          onClear={noop}
        />
        <BidPicker
          count={2}
          face={3}
          onCountChange={onCountChange}
          onFaceChange={noop}
          canFewer
          canMore
          bidLabel="叫 2 颗 3 点"
          onBid={noop}
          onCall={noop}
        />
        <Die face="hidden" />
        <Die face={1} state="wild" />
      </>,
    );
    expect(screen.getByRole('toolbar', { name: '绘图工具' })).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: '颜色' })).toBeVisible();
    expect(screen.getByRole('radio', { name: '墨黑' })).toBeVisible();
    expect(screen.getByRole('radio', { name: '4 像素' })).toBeVisible();
    expect(screen.getByRole('button', { name: '撤销' })).toBeVisible();
    expect(screen.getByRole('button', { name: '清空' })).toBeVisible();
    expect(screen.getByRole('group', { name: '你的叫点' })).toBeVisible();
    expect(
      screen.getByRole('radio', { name: '3 点', checked: true }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '喊“吹牛”' })).toBeVisible();
    expect(screen.getByRole('img', { name: '未揭开的骰子' })).toBeVisible();
    expect(screen.getByRole('img', { name: '1 点，百搭' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '增加' }));
    expect(onCountChange).toHaveBeenCalledExactlyOnceWith(3);
  });
});
