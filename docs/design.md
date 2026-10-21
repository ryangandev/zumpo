# Design

The Zumpo brand, the Figma file that is the design's source of truth, and how the design gets into this repository.

## Brand and direction

The product is named **Zumpo**: short, abstract, easy to say and share.
The visual direction is **Paper Pop**: cream paper surfaces, ink text, and soft coral, lime, blue and peach accents, set in Nunito Sans Black for display and DM Sans for everything else.
Two other explored directions, Club Circuit and Pocket Studio, are kept in the Figma file's Archive section for reference and are not in use.

Exact colours, type sizes and spacing are tokens in the Figma file, exported to `design/figma/tokens/`.
They are not copied here, so there is one place to change them.

## The Figma file

[Zumpo · Paper Pop flows](https://www.figma.com/design/pd5Hgp7zbT2cMqQNan35uY?node-id=9-14702), file key `pd5Hgp7zbT2cMqQNan35uY`, one page.

| Section                              | Id          | Contents                                                                              |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------------------- |
| 00 / Review guide & flow map         | `9:14700`   | Review order, the real rules, which UX is new                                         |
| 01 / Platform & shared flows         | `9:431`     | P01-P21 without P04, desktop                                                          |
| 02 / Draw & Guess / complete flow    | `9:866`     | DL01-DL11 game page, D01-D15 room, desktop                                            |
| 03 / Minesweeper / complete flow     | `9:2526`    | ML01-ML10 game page, M01-M16 room, MS01-MS05 solo                                     |
| 04 / Mobile / 390px flow adaptations | `9:10060`   | MO01-MO19 without MO03, the main flows at 390 px                                      |
| 05 / Make 24 / complete flow         | `40:60741`  | T01-T05 solo, T06-T10 room, T11-T12 phone                                             |
| 06 / Pairs / complete flow           | `40:60743`  | PR01-PR04 and PR11 solo, PR05-PR08 room, PR09-PR10 phone                              |
| 07 / Trios / complete flow           | `43:61070`  | TS01-TS04 solo, TS05-TS10 room, TS11-TS12 phone                                       |
| 08 / Liar's Dice / complete flow     | `43:61071`  | LD01-LD06 and LD16 solo, LD07-LD12 room, LD13-LD15 phone                              |
| 09 / Hush / complete flow            | `43:61072`  | HU01-HU09 room, HU10-HU11 phone                                                       |
| 10 / Daily Word / complete flow      | `43:61073`  | DW01-DW06 solo, DW07-DW11 room, DW12-DW16 phone                                       |
| 11 / Snap / complete flow            | `162:86002` | SN01-SN04 solo, SN05-SN09 and SN13 room, SN10 create, SN11-SN12 phone, SN14 game page |
| 12 / Doodle Chain / complete flow    | `162:65089` | DC01-DC14 desktop, DC15-DC20 phone                                                    |
| 13 / Code Breaker / complete flow    | `162:65717` | CB01-CB14 desktop, CB15-CB21 phone                                                    |
| 14 / Gomoku / complete flow          | `162:67746` | GM01-GM21, game page, solo, room and phone                                            |
| 15 / Phone in play                   | `163:63239` | PH01-PH06, the one phone layout every game plays in                                   |
| Shared pieces                        | `9:198`     | Component families, all named `Zumpo/…`                                               |
| Archive                              | `9:197`     | Club Circuit and Pocket Studio, with their components                                 |

Screens are 1440 px wide on desktop and 390 px on mobile, and each is named `<code> / <title>`.
Review notes sit as loose text above each screen, outside the product UI.
Three early Paper Pop concepts (`3:53`, `3:54`, `3:55`) sit above the flows for comparison; where they disagree with the flows, the flows win.

## What the screens are, and are not

- Each screen illustrates one state; scores and boards are examples, not one continuous match.
- The game rules in [games/](games/) are the contract.
  A screen that contradicts them is a design bug, not a rule change; for example, Minesweeper rooms have simultaneous irreversible picks, no flags and no separate lock button; flags exist only on your own.
- The shared canvas keeps the 798 × 598 bitmap's ratio; the Large Minesweeper board on mobile pans horizontally.
- Some screens are UX the old app never had: the final results panel, the leave confirmation, the invite sheet, mobile tabs and the rules dialog; Ryan approved them with the rest of the file.
- Mobile covers the main flows, not a mobile version of every desktop state.
  Make 24, Pairs, Trios, Liar's Dice, Hush, Daily Word, Snap, Doodle Chain and Code Breaker keep their phone screens in their own sections, and Minesweeper solo's (MS05) in 03.
- Every visitor has a name from the first page on, so every screen shows the viewer's avatar, solo screens included.
- Prototype links are partial; this is a design, not a clickable spec of every control.

Decisions from the design review rounds (their reports are in git history):

- One page lists every game: the home page (P01, MO01) is also the games page, so there is no separate games hub and the hero has no buttons to it; Ryan chose this on 2026-10-05.
  Each game is a `Zumpo/Game card`, a tile four across on a desktop and a row on a phone, whose icon is the game's signature piece.
  Games are sorted by kind, not by player count, because most games play both on your own and in a room and every game has rooms.
  The kinds whose every game can be played on your own come first (Puzzles, Spot & remember, Strategy), then Party, each kind and its games in alphabetical order; Ryan chose this on 2026-10-21, because most first visits are one person who wants to play now.
  How a game can be played stays on its card as paper tags: Solo, where it has a game on your own, then the player count ("2–8 players"); Ryan asked on 2026-10-08 for the two to be separate tags.
  Solo is a link straight to the game on your own, and turns Ink under the pointer, since a tag drawn like a pill reads as something to press.
  Daily Word and Code Breaker put today's state in Solo's place once today's puzzle is started, from the records on the device: "Guess 2 of 10" while it is under way, "Done today" once it is over; their game page says the same, with the streak, and its Play solo becomes Continue or See today's result (P01).
  The page ends with the games: no notice under them on how solo and rooms start, since each game's page says how to play it; Ryan removed it on 2026-10-08.
  A row of `Zumpo/Filter chip`s above the games shows one kind; on a phone each kind also has a heading, because the list is long.
  Past about sixteen games, a desktop should give each kind its own shelf too.
  The hero's right side holds real game pieces, as the first Paper Pop concept drew paper objects there.
- You pick the game on the home page, then how to play it on the game's page; Ryan chose this on 2026-10-08, as multi-game sites such as Papergames and Board Game Arena do.
  A game card says what the game is and how many can play, and the whole card is a link to the game's page, drawn with an arrow and no buttons.
  Under the pointer the card lifts 4 px onto the Paper lift shadow and its arrow leads 3 px on, easing out over 180 ms (`State=Hover`); Ryan found an ink border that came at once too hard for the cards, so it was redesigned in Claude Design among four (lift, sticker, tilt, brighten) on 2026-10-08.
  With reduced motion only the shadow comes.
  The page (DL01-DL03, ML01-ML03, MO04) opens with one `Zumpo/Game intro`: the game's artwork, kind, name and tagline, and its ways in, Play solo first where the game has it, because one click starts it with nobody to wait for, then Create a room.
  The open rooms to join are listed under it, and the How to play panel beside it says how to play in the buttons' order, on your own first where the game has it, then in a room, each as `Zumpo/How to play` with its goal, steps and score, whole on its own; Full rules, the same `Full rules` button as in the room's dialog, opens the whole of them in the panel, so each game's rules are on its own page and in the dialog over its room, and nowhere else; Ryan removed the page of every game's rules (P14) and its header link on 2026-10-21.
  A phone shows the panel too, after the rooms.
  The header and the wordmark are the ways home, so the page has no Back to games, and the avatar is the name, so no Playing as either.
  An empty room list says so, with no button of its own: Create a room is in the intro.
  A room row says who hosts it only when the room has a name of its own; a default name ("Maya's room") already does.
  Its action column is 168 px on a desktop, as wide as Playing beside Watch, so the player counts of a list line up.
  A game without a solo mode never shows an empty entry: its only way in is Create a room, or a room to join.
- Play solo starts the game: a board, a run or a table is dealt at once, with the settings last played on this device or the defaults, so a first game is one click.
  There are no start screens (#105).
  The settings are on the finished game instead, as Change board, Change level or Change table beside Play again, a Dialog over the board that Play closes into the next game (MS01, PR01, LD01, GM02).
- Every game on your own ends the same way (#86): the board stays as it ended, the turn bar over it says how it ended, and the side column, or the column under the board on a phone, starts with the result, a `Zumpo/Card` Panel with the outcome, a line of detail, a few stats and the actions.
  The side column's other cards follow: the best on this device, and Challenge a friend where the game has it, whose one button is Copy challenge link (#107); the progress during play is not repeated there.
  `Zumpo/Game artwork` is the paper panel both draw, one per game and size, so the artwork is drawn once.
- A new room's page (DL04-DL06, DL10, DL11, ML04-ML06, ML10, MO05, and one per game) asks only what the game needs, so it fits the first screen down to 1280 × 720: its card is titled after the game ("New Draw & Guess room"), and the game's own setting is in view with its default.
  More options, a Quiet button, opens the room's name (the host's by default), its seats (all of them by default) and a password, so Create room is one click away; Ryan asked for this on 2026-10-21.
  Hush keeps its seats in view, because they set how long its game is.
  A blank name opens More options to say so, and a room being made hides the button with the other actions (DL06, ML06).
  A helper says only what the options do not ("60 seconds a hand."), never the options again; a page heading over the card would say the game's name twice, so a wide screen has none, and a phone puts the card's title and description on the page.
- A game screen states the turn in one `Zumpo/Turn bar` above the canvas or board: what is happening, whose turn, and the server's countdown.
- In Draw & Guess the guess is the chat input; it is locked for the drawer and for anyone who has scored this turn, as the server already enforces.
- Brush colours are `color/brush/*` tokens, and the drawer's controls are one `Zumpo/Drawing toolbar`.
- Minesweeper shows each round's outcome as `Zumpo/Pick result` rows: who picked how risky a cell, and what it paid.
  On a phone the row is its Phone layout, two lines with the name above the outcome tag and its detail, so a long tag such as Auto-picked never squeezes the name (MO13, MO19); Make 24's hand results are the same rows.
- Daily Word's reveal lists every board as a `Zumpo/Race board` with its letters, best first; on a phone each is the Row layout, the name beside the board, one under another (DW15, DW16), since two Small boards do not fit across.
  A revealed board, Daily Word's or Code Breaker's, draws only the rows played, so a word found in 3 is three rows, not six with three empty.
- No disabled primary buttons: a request in flight is a status line, and an action you cannot take is not shown.
  The one exception is a phone's Gomoku Place stone, under the board throughout a game and live once a faint stone is down (PH04), because a button that came and went would move the board under the thumb.
  Elsewhere in play a button that cannot be pressed yet keeps its room out of sight, as Hush's Ready and Play do, so nothing around it moves.
- Dialogs (leave, invite) sit over the screen they come from, behind a scrim.
- Example data follows one story with four players (Maya, Ryan, Leo, Sam), each with a fixed avatar colour, and every score is computed with the real formula.
- Text on a tinted surface (peach, blue, lime) is ink; muted text is only for cream, paper and sand, where it passes WCAG AA.
- Keyboard focus is a 2 px ink ring 2 px outside the control, distinct from hover's border.
- A line of metadata has at most one middle dot.
- An icon beside text is centred on the text's first line, never top-aligned: a leading icon sits in a slot one line-height tall (`height: 1lh` in code), so a wrapped message keeps it level with line one.
  Trailing indicators, like the check on a selected option, centre on the whole row.

### The room bar

Ryan approved the room bar on 2026-10-04, after a proposal round in Figma.
A seated room has one `Zumpo/Room bar` in place of the header and the room heading: the wordmark, the game, the room and phase tags, How to play, Leave room and the viewer.
On a phone it is one row 48 px tall: no wordmark, the game over one line saying the room and its phase ("Maya's room · Round 2 of 3"), and the two actions as their icons, so it never wraps and never moves the game under it.
Every room screen uses it (P07, P11, P12, P15, P16, D01-D15, M01-M16, MO07-MO16), and it is 160 px shorter than the old pair on a desktop and 80 px on a phone.

- A room has no links out but the wordmark: How to play opens over the room (P15), so a game is never lost to a rules check.
  It says how to play, not how the room is set: the goal, then `Zumpo/How to play`'s steps with the score last, and Full rules opens the game's whole rules under them (P21).
- A waiting card ends with the game in half a minute, `Zumpo/How to play` with its heading and goal, under a line (D01-D03, M01-M03, DC03, DC04, P19, P20), so a friend who came from an invite link knows the game before it starts.
- Leave room between games leaves at once; nothing is at stake and the click says what it means.
- Every other way out asks first, mid-game and between games: Leave room mid-game, the wordmark and the browser's back button.
  Changing your name is not a way out: it happens in place, so it never asks.
  Mid-game the dialog names the points that go (P11), or says the game ends for everyone, or that somebody wins it (the Gomoku opponent, or Liar's Dice's last player with dice); between games only the seat (P16).
  Which of these it is comes from the rule the server acts on (`departureFrom` in `shared/room.ts`), so a Doodle Chain that plays on with two says so.
  A host is also told who takes the crown, the same player the server picks (`heirOf` in `shared/room.ts`); a host alone is told only that the room closes.
- While reconnecting the bar has no Leave room; the notice under it says what is happening (P07).
- On your own the bar says On your own in place of the room, and Leave goes to the game's page, where the game starts again with other settings.
  It asks first only where leaving throws away minutes of play: a Liar's Dice game under way, and a Trios run once a trio is found (LD16).
  While it asks, the game's time stands still and the board is put away, as under How to play, so staying costs nothing.
  A Pairs board, a Snap run and the puzzles leave at once: each is a minute or two to play again, and a question on every way out would cost more than it saves.
- The room screens' hidden notice layers are gone; the visible notices, such as D10's pending one, stay.
- Before a room's first game the scoreboard's rows show no score and no status, Player row's Show score and Show status off: every score is 0 and everybody is waiting, so a row says only who is here, and Away for a player who dropped.
  Gomoku draws no seats then either (GM08), since with no colours yet they would only list the same two players again.
- On a phone, where the scoreboard is on its own tab, the waiting card says who else is at the table, their small avatars over "Maya and Leo are here." (MO20), so "Everyone's here?" is answered where it is asked.

### Names

Ryan approved dropping the name step on 2026-10-05: it stood between every visitor and every game, and asked again in every new tab.
Nobody is asked for a name any more.

- A first visit picks a random name, an adjective and an animal such as Sleepy Otter, and this browser remembers it.
- `Zumpo/Name menu` is the one place to change it: State=Edit is the field, Save and Roll a name, which fills in another random name (P13, MO02); State=Error is an empty name (P03).
- It opens from the viewer's avatar on every page and in every room.
- Nothing announces the picked name on a first visit: Ryan removed the hint that opened by itself on the home page on 2026-10-21, because it covered the hero and was gone at the first click; the waiting room says it when it matters (P19).
- A rename reaches every seat at once and the room's chat says so, as Brave Noodle becoming Leo does in P20; nothing is lost, so it never asks first.
- While the name is still the picked one, a room's waiting card says so beside a Change name button (P19), because a friend who came from an invite link should be recognisable.

[taste-skill](https://github.com/Leonxlnx/taste-skill)'s `design-taste-frontend` and `redesign-existing-projects` skills are useful review checklists, not authorities: they target landing pages, and where a rule contradicts the brand direction above (its cream-palette and single-accent rules, for example), the brand wins.

## Figma export

The Figma MCP and REST API allowances on the Starter plan are too low to read 247 screens, so a local, read-only plugin in [tools/figma-export/](../tools/figma-export/README.md) snapshots the file instead.
It writes tokens, each Shared pieces family in full detail, one compact JSON per screen, every vector drawing as SVG, an audit of hardcoded values, and PNG previews.
`FORMAT.md` inside each export documents the format.

`npm run design:import` unpacks the newest export into `design/figma/` and regenerates the code tokens from it.
With the bridge running, `npm run design:export` runs the same exporter through it and imports the result in one step.
The JSON and SVG there are committed, so every agent and every worktree can read the design without Figma access, and a diff between two exports shows exactly what a review round changed.
`design/figma/previews/` is ignored: PNGs are regenerated on every export and would bloat history.
Everything in `design/figma/` is generated; change the design in Figma and export again rather than editing it.

## In code

Each Shared pieces family is one component in [`client/src/ui/`](../client/src/ui/index.ts), named as in Figma without the `Zumpo/` prefix; [architecture.md](architecture.md#client) explains how the layer is built.
Variables, text styles and effect styles reach code only through the generated `--zumpo-*` tokens, so a value code needs and Figma lacks is a gap to fix in Figma first, as the menu, dialog and cell shadows were.
Every padding, gap and radius in Figma's components and screens is bound to a `space/*` or `radius/*` variable, and the export's `audit.json` lists any frame or component that types one in instead (`unboundSpacing`, `unboundRadii`).
An instance's overrides are not audited, and binding a component's size resets that size on its instances, so check the export's diff for lost overrides after binding.

To review the design system, run `npm run dev -w client` (it needs no server) and open [`/design`](http://localhost:3001/design).
Every specimen is captioned with its Figma variant, uses that variant's sample copy, and shows its size beside Figma's, in red when they differ by more than half a pixel.
It compares only in a window wider than 640 px: narrower, the mine cell, the header, the name menu and the cup take their phone sizes, which Figma draws only inside its 390 px screens, so the page says nothing is compared.
A hidden browser pane reports a width of 0, so give it a desktop size before reading `[data-mismatch]`.
Each family's Figma preview sits under it at the same scale.

`Zumpo/Card` is every focused surface: the one card of a create-room, password or error page (Kind=Focused), a dialog over a room (Dialog), and a panel in a page's column, such as a game page's empty or loading room list (Panel).
Its Title and Description are text properties, and each screen puts its own fields, status and actions into its Content slot, so a change to the surface reaches all 28 screens that use it.
In code the same three are `Card`, `Card kind="panel"` and `Dialog`, which shares the card's styles.

`RoomBar` is `Zumpo/Room bar`, with `layout="phone"` for its Phone variant; `RoomLayout` renders it in the page's header slot, so it stays the page's banner, and `SeatedRoom` guards the navigation its wordmark and the viewer menu start.

Figma draws every screen at 1440 px and at 390 px, and nothing between.
Code has two breakpoints, both in [`use-media-query.ts`](../client/src/shell/use-media-query.ts): under 1024 px (`ONE_COLUMN`) a room, or a game on your own, is one column, the scoreboard and the chat under the stage and the room bar in its Phone layout, because beside the 344 px side column a narrower window leaves a board less than it needs; at 640 px (`PHONE`) the pages take their phone layouts.
Between the widths Figma draws, a rigid piece, such as a board of fixed-size cards, the keyboard or the row of dice faces, sits in [`Fit`](../client/src/shell/fit.tsx), which scales it down to the width it is given when it would be wider, every proportion kept; at Figma's widths it is Figma's size.
Where scaling would hurt, something else gives: a Minesweeper board wider than its panel pans sideways, the drawing toolbar takes two lines under the 898 px Desktop stage, the word choices share the sheet's width and wrap, and a tag's words end in an ellipsis.
Beside the side column, a board played with its keys on its own page (Daily Word's and Code Breaker's, a Minesweeper board, a Gomoku table) is scaled the same way to the window's height by `useFitHeight` in [`fit-height.ts`](../client/src/shell/fit-height.ts), so the last row, Enter and the bottom of the board are in view without scrolling down to 1280 × 720, down to half size at most; on one column the page scrolls as it is (#89).
It only ever shrinks during a game, so the board does not jump when its controls go at the end.
[The widths spec](../e2e/widths.spec.ts) plays every game and checks, at seven widths from 1280 to 320 px, that nothing reaches out of what holds it.

On a phone a game in play is one screen tall, as section 15 draws it: no footer, the Phone room bar, a turn bar of fixed height whose main line is scaled down rather than wrapped, the board, and at the foot what the player touches.
The board sits in [`PlayBoard`](../client/src/shell/play-board.tsx), which scales it to the height the rest leaves it, or, below a least scale, keeps that scale and scrolls, keeping the row in play in view.
So the keypad, the keyboard, the picker or the button that acts now is on screen from the first move and never moves during a game.
A row that comes and goes, such as Trios's last trio or Make 24's signs, keeps its room out of sight while it is not there.
A window 500 px tall or less and wider than a phone, such as a phone turned sideways, keeps the one-column layout and scrolls, but caps the board and the canvas at the window's height.
There the turn bar takes its compact Phone row, and Gomoku sets its board beside the turn, so the whole board is in sight.
Wider and taller, a Draw & Guess sheet is no taller than the window leaves below its top, so the sheet and the chat's input are in sight together.
[The phone spec](../e2e/phone-play.spec.ts) plays every game at 360 by 640 and 390 by 844 and checks that the input is on screen, the page does not scroll, and the input stays where it was through a game.

Figma gives each sample player an avatar tone by hand; code picks one from a hash of the player's name, so a player keeps one colour in the header, the scoreboard and the results, on every screen.

### Comparing with Figma

`npm run design:compare` builds the app, serves it on port 3320 (`SCREENS_PORT`), and plays [the screens spec](../e2e/screens/screens.spec.ts) with the players and example data of the Figma story, capturing each screen in the state Figma draws, at Figma's width and frame height.
It takes about three minutes, because it runs the real phase lengths so every countdown reads as in Figma.
It writes `design/compare/index.html`, which is ignored by git: every screen's Figma preview beside its capture, flagged when the two sizes differ.
A size that differs because the game holds other content than Figma's example, such as a longer chat, is listed with the reason in [report.ts](../e2e/screens/report.ts) and marked apart; any other difference is layout, to fix or to note below.
So is a screen no state of the app shows.
It needs the previews from the last `npm run design:import`.

### On purpose

Code differs from Figma on purpose in a few places:

- The countdown is up to 7 px wider: DM Sans has no tabular figures, so each digit has a fixed cell and the clock keeps its width as it ticks.
- The chat input's text is 16 px on touch screens, where Figma's 12 px would make iOS zoom the page on focus.
- The chat's send button and the brush swatches keep Figma's drawn size, but take a tap from an invisible area 44 px tall around them, the size a thumb needs; on a phone the swatches sit 8 px apart, so there the area grows only up and down.
  So do the room tabs, the filter chips, the footer's languages and the viewer's avatar.
- Hover and focus never change a control's size; Figma's hover variants are wider only because strokes count in its auto layout.
- The chat hugs its messages and scrolls past 358 px of them, so a full chat ends level with the canvas; Figma's empty chats (D01, M01) keep the 354 px of the component's sample messages, which code does not reserve.
- The newest chat lines under a phone's Draw & Guess board (MO08 to MO10) stand in a strip 99 px tall, not Figma's 91 px: the extra 8 px are headroom where a line pushed up fades out, which Figma cannot draw, so a long line is never cut mid-glyph.
  The viewer's own line flashes the sand fill as it lands, which a still screen does not show.
- Figma rounds auto-width text boxes up to whole pixels, so a hugging component can be up to a pixel narrower in code.
- The drawer's word-choice clock is Running, as the Countdown's own rule says of a phase you act in; D04 and MO07 keep the Status turn bar's default Waiting tone.
- The header marks the page you are on; Figma draws Games as current on every screen.
- Dialogs are centred in the window, so they sit a few pixels from where each Figma screen places them.
  The invite link's box grows to the whole link: two lines at P12's width, three on a phone, which Figma does not draw.
- Invite friends opens P12 only where the link cannot be sent at once.
  Under a mouse it copies the link and says "Link copied" with the check icon for a moment, as P12's Copy says "Copied"; under a finger it opens the system share sheet, and a sheet closed without sharing opens nothing.
  Figma draws neither moment.
- A Button whose label changes for a moment, Copy to Copied and Invite friends to Link copied, keeps the width of the wider label, so nothing beside it moves; P12 draws only Copied, at that width.
- A game that ends while the room is open bursts into confetti in the brand accents and the sun brush's gold, at Ryan's request; Figma draws the results still, and a game found finished on arrival or after a refresh is not celebrated.
  It stays off when the system asks for reduced motion, and a Hush game the team lost is not celebrated.
  On your own the same confetti marks a new best on this device in Pairs, Trios and Snap, and a Liar's Dice win against the bots; a first finish is a new best too, so it is celebrated, and only a finish short of the best is not.
- Pairs, Snap and Liar's Dice move a little, as the descriptions of `Zumpo/Pairs card`, `Zumpo/Snap card` and `Zumpo/Cup` say and Figma cannot draw: a card turned over flips open, the middle card you win slides into yours, and dice shake as a round starts.
  Each takes 0.4 s or less, inside the moment a flash already stays up, and none moves when the system asks for reduced motion.
- Where Daily Word has no line under the board, on a phone and in a room while guessing, as Figma draws them, the "Not in the word list" note is said over the board instead, across the row under the one being fixed; Figma draws it only on your own (DW03).
- The footer carries a language switch, English and 中文 in the footer's small text, which the Figma file does not draw: the design is English, and the switch is the one control that lets a reader choose otherwise ([languages](architecture.md#languages)).
  Chinese text sets in the system's own sans, because the Paper Pop fonts have no Chinese glyphs.
- Spectator seats are not in Figma yet, beyond the lobby row's Watch, so their pieces are made of existing families: the spectators are a second Scoreboard titled Watching under the players, a spectator waiting for a game gets the guest's Waiting panel with their own heading, and Take a seat is a secondary Button among a panel's actions.
  Watch instead is a Quiet Button after Invite friends, offered only to a guest: for the host it would hand the crown on for good.
  Mid-game a spectator sees the board as a player who may not act, with a Notice under it saying they can take a seat once the game ends.
  In the side column beside a desktop room the Watching Scoreboard is folded to its heading line, with the spectators' names and the count after the title and a chevron that opens it, so the chat under it keeps its height; in one column, under 1024 px, and in a phone's Players tab it stays open.
- Draw & Guess's round results are not in Figma either: a paper panel like Minesweeper's round results, with a Player row for each player, their points this round as the score and their total as the status.
  It lies over the top of the sheet on a desktop, under the turn bar where it is in sight without scrolling, and over the sheet's foot on a phone, on the Menu lift shadow.
  The drawer does not see it while choosing the next word: the word choices take the sheet, and the panel over them would hide them; the guessers keep it until a word is chosen.
- A Gomoku seat's thick edge on its turn is drawn inside its hairline, so the seat keeps its size from turn to turn.
- PH04 and PH06 predate two phone pieces code has: Gomoku's seats side by side drop the avatar and put the stone before the name, and Liar's Dice's own cup is one row unless it holds five dice.
- Doodle Chain's row under an entry keeps one height through Done and Keep editing: both of its states share one place, and it is as tall as the taller.
  On a phone the Chain composer's done row is the Notice beside a Keep editing that shows only its pencil, not the Phone variant's Notice over a full-width Keep editing, which made the row 84 px taller than Done's and moved the drawing above it.
- The others' boards in a Daily Word room stand 12 px apart, not DW07's 16 px: three at 16 px are 2 px wider than the panel holds beside the Desktop keyboard, which Figma lets overflow.
- A Code Breaker or Daily Word room's phone turn bar says how to read the marks while you still guess or watch as a spectator, even after somebody else has solved it; CB18 and DW13 show Maya's name there instead.
- Before a Hush game's first level the line beside Ready says the rule, two lines on a desktop, where HU01 and HU11 draw later levels' one line about the chat.
- The line under a Code Breaker board on your own is as tall as a note, as Daily Word's is in DW01 to DW03, so the digit pad does not move when a guess is turned back; CB02 to CB04 draw it as tall as its one line of text, 27 px shorter.
- A Code Breaker round's results boards stand 8 px apart, not CB12's 16 px: four at 16 px are 16 px wider than the panel holds, which Figma lets overflow.
- A Player row's status ends in an ellipsis when it is longer than the row has room for, as its name does; in CB21's phone ranking "2nd place · 3 codes cracked" runs under the score in Figma.
  In a game's final standings it wraps to a second line instead, since there the detail is what the row is for.
- Before a Gomoku room's first game, the stage opens with the room's shared Waiting panel above the empty board, not GM08's Game 1 turn bar with Start game: the panel is where every room keeps the invite link, Take a seat or Watch instead, and the picked name, and the empty board stays under it as GM08 draws it.
- A Draw & Guess sheet on a desktop keeps its 798 × 598 proportions in the height the window leaves below its top, never narrower than half its column, and stands centred in it, so the whole sheet and the chat's input are in sight at 1280 × 720 and 1440 × 900; D01 to D06 draw it the column's full width, taller than such a window.
- A short screen wider than a phone, 500 px tall or less, as a phone turned on its side is, takes the Turn bar's Phone row, which Figma draws only at phone widths, and a game in play sits 12 px from the header.
  There Gomoku's board stands beside the turn: the Turn bar tops the side column, the seats are compact two to a row, and the actions sit at its foot, so the whole board is in sight; Figma has no landscape Gomoku.
- A phone's Board tab says who went away or left, "Ana is away." or "Ana left the room.", in an info Notice over the top of the board for five seconds, as it says "You're the host now." in a success one; neither is in Figma, whose phone frames have no room events on the board.
- Make 24's keys line under the tools (T02, T04, T06) shows only where there is a mouse and keyboard to play with, so a tablet's desktop layout leaves it out.
- Games on your own start at once and end beside the board (#105, #86, #107), which the Figma file does not draw yet: the bridge was down when the change was made, so its scripts wait to be run.
  T01, TS01 and SN01 are start screens no state shows; MS01, PR01, LD01 and GM02 are start pages that code shows as the Change dialog over a finished game.
  The end screens (MS04, T05, PR04, TS04, SN04, LD05, LD06, GM05, GM06, DW04 to DW06, CB06 to CB08) keep the board, with the result as the side column's first card and one Copy challenge link.
  Trios and Snap show their start screens' example, "What makes a trio" and "What makes a match", in the side column while you play (TS02, SN02).
- A board scaled to the window's height (#89) is smaller than Figma's in a window shorter than its frame: Figma draws each screen at one height.

## Editing the Figma file

The file is native Figma throughout: real auto layout, component instances and variables, with no flattened images.
Keep it that way.
A change starts from Shared pieces, variants and tokens, so it reaches every screen, and the Archive and the original concepts stay untouched.

Agents edit it through the [Figma bridge](../tools/figma-bridge/README.md), which runs Plugin API scripts in Figma desktop.
Codex used the Scripter community plugin in Figma's web app instead, driven through a browser, which needs no desktop app or local server.

When editing through the Plugin API:

- There is no `figma.createAutoLayout`; set `layoutMode` and its sibling properties on a frame.
- Do not move children of a nested instance; give the main component responsive auto layout instead.
- `swapComponent` on a variant can keep the old properties; call `setProperties` explicitly afterwards, as with `Zumpo/Mobile tabs` and its `View` property.
- A script that fails halfway can leave orphaned nodes; remove only nodes you can prove the script created.
  Write scripts to be idempotent, so a failed one can simply be run again.
- The file loads pages dynamically: use `getMainComponentAsync`, not `mainComponent`.
- An override on an instance's inner layers is keyed to those layers, so swapping the instance to another variant drops it; a Player row's muted status icon is set on every glyph's own layers for that reason.
- `findAll` throws on a slot's unreadable sublayers; walk the tree yourself and skip a node whose children cannot be read.
- An instance's inner auto layout frame ignores `minHeight` and will not take a fixed height; make room with its spacing and padding overrides, as TS12's turn bar does for two lines.
- Cloning a variant inside its set drops the clone's `componentPropertyReferences`; rebind them, and only on the clone's own text, never on a nested instance's.
- `findOne` by name also matches layers inside nested instances; filter by `id` (instance sublayers start with `I`) when you mean the component's own layer.
- `resize()` fixes a frame's sizing modes; set them back to `AUTO` afterwards where the frame should hug.
- `layoutSizingHorizontal = 'FILL'` works only after the node is in an auto layout parent.
- Vector paths take no `A` (arc) command; use cubic curves, and reset `x` and `y` to 0 before setting `vectorPaths` again.
- A node moved into an instance's slot keeps its old id, and the API then cannot read anything inside it, so the exporter fails; clone it into the slot and remove the original instead.
  The exporter writes a slot's content under the instance's `slots`.
- Figma desktop suspends the plugin while the screen is locked; a script queued then waits until it is unlocked.
- After any edit, check text and component bounds, roles, real scoring, countdowns, hidden information, canvas ratio, mobile usability and prototype links, then export again.

## Earlier artifacts

The Figma file was built in a Codex session whose handoff, artifact inventory and scripts are in git at commit `dc7c012` (`docs/ZUMPO-CLOUD-HANDOFF.md`, `docs/ZUMPO-ARTIFACT-INVENTORY.json`).
The full local bundle, including the first 83 PNG exports and the build scripts, is on Ryan's machine under `~/.codex/visualizations/2026/10/02/01a0fb53-c0ab-7af1-becf-90bbea4a4123/`.
Those scripts are evidence, not a migration: they hardcode node ids from an earlier state and must not be re-run.
