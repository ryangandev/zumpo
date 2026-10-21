import { expect, test } from './fixtures';

test('Chinese and English players share a room and render notices in their own languages', async ({
  player,
}) => {
  const host = await player('阿青', { locale: 'zh' });
  const guest = await player('Bob', { locale: 'en' });
  await host.goto('/games/pairs/new');
  await expect(host.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await host.getByRole('button', { name: '更多选项', exact: true }).click();
  await host.getByRole('textbox', { name: '房间名称' }).fill('双语房间');
  await host.getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(host).toHaveURL(/\/games\/pairs\/rooms\//);
  const roomUrl = host.url();
  await guest.goto(roomUrl);
  await expect(
    host.getByText('Bob 加入了房间。', { exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByText('Bob has joined the room.', { exact: true }),
  ).toBeVisible();
  await expect(
    host.getByRole('button', { name: '开始游戏', exact: true }),
  ).toBeVisible();
  await host.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(host.getByText(/^游戏开始！共 \d+ 对/)).toBeVisible();
  await expect(
    guest.getByText(/^Game has started! \d+ pairs to find/),
  ).toBeVisible();

  // Already received history is rendered again, and a reload retains the choice.
  await host.getByRole('radio', { name: 'English', exact: true }).click();
  await expect(
    host.getByText('Bob has joined the room.', { exact: true }),
  ).toBeVisible();
  await expect(host.getByText('Bob 加入了房间。', { exact: true })).toHaveCount(
    0,
  );
  await host.reload();
  await expect(host.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    host.getByRole('radio', { name: 'English', exact: true }),
  ).toBeChecked();
  await expect(
    host.getByText('Bob has joined the room.', { exact: true }),
  ).toBeVisible();
  await expect(
    guest.getByText('阿青 reconnected.', { exact: true }),
  ).toBeVisible();
});

test('a Chinese phone visitor can change language with the keyboard and create a room', async ({
  player,
}) => {
  const phone = await player('小雨', { phone: true, locale: 'zh' });
  await phone.goto('/');
  await expect(phone.getByRole('heading', { level: 1 })).toContainText(
    '玩一会儿',
  );
  await phone.getByRole('radio', { name: '中文', exact: true }).focus();
  await phone
    .getByRole('radio', { name: '中文', exact: true })
    .press('ArrowRight');
  await expect(phone.locator('html')).toHaveAttribute('lang', 'en');
  await phone
    .getByRole('radio', { name: 'English', exact: true })
    .press('ArrowLeft');
  await expect(phone.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await phone.goto('/games/minesweeper');
  await phone.getByRole('link', { name: '创建房间', exact: true }).click();
  await phone.getByRole('button', { name: '更多选项', exact: true }).click();
  await phone.getByRole('textbox', { name: '房间名称' }).fill('手机扫雷');
  await phone.getByRole('button', { name: '创建房间', exact: true }).click();
  await expect(phone).toHaveURL(/\/games\/minesweeper\/rooms\//);
  await expect(
    phone.getByRole('button', { name: '离开房间', exact: true }),
  ).toBeVisible();
  await expect(phone.getByRole('tab', { name: /^棋盘/ })).toBeVisible();
  await phone.getByRole('tab', { name: '聊天', exact: true }).click();
  await expect(
    phone.getByText('小雨 创建了房间。', { exact: true }),
  ).toBeVisible();
  await expect(
    phone.getByRole('textbox', { name: '消息', exact: true }),
  ).toBeVisible();
});
