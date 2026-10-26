import { useState } from 'react';
import type { WordCategory } from '../../../shared/wire-types';
import {
  inCategoryOrder,
  WORD_CATEGORIES,
} from '../../../shared/draw-and-guess';
import { Button, ChipField, Dialog, DialogClose, PickerField } from '../ui';
import { useMessages } from '../i18n';

/**
 * DL04, DL12, MO22, D13, D16: the word categories a room's games draw from,
 * as a field saying what is picked ("All 15"), which opens them as chips in
 * a dialog. Save hands the picked set on, unless it is the set already
 * there; Cancel and Escape forget it. At least one stays picked: the last
 * chip on cannot be turned off, and Choose all stays in place, disabled, once
 * every one is on.
 */
export function CategoriesField({
  categories,
  onChange,
  className,
}: {
  categories: readonly WordCategory[];
  onChange: (categories: WordCategory[]) => void;
  className?: string;
}) {
  const m = useMessages();
  const t = m.drawAndGuess.categories;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<readonly WordCategory[]>(categories);

  const toggle = (category: WordCategory) =>
    setPicked((current) =>
      current.includes(category)
        ? current.length > 1
          ? current.filter((one) => one !== category)
          : current
        : inCategoryOrder([...current, category]),
    );
  const all = picked.length === WORD_CATEGORIES.length;

  return (
    <>
      <PickerField
        className={className}
        label={t.label}
        value={t.value(categories)}
        open={open}
        onOpen={() => {
          setPicked(categories);
          setOpen(true);
        }}
      />
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={t.title}
        description={t.description}
        actions={
          <>
            <Button
              onClick={() => {
                setOpen(false);
                const next = inCategoryOrder(picked);
                const same =
                  next.length === categories.length &&
                  next.every(
                    (category, index) => category === categories[index],
                  );
                if (!same) onChange(next);
              }}
            >
              {t.save}
            </Button>
            <DialogClose
              render={<Button variant="secondary">{t.cancel}</Button>}
            />
          </>
        }
      >
        <ChipField
          label={t.count(picked.length)}
          options={WORD_CATEGORIES.map((category) => ({
            value: category,
            label: m.drawAndGuess.category(category),
          }))}
          value={picked}
          onToggle={toggle}
          locked={picked.length === 1 ? picked : []}
          action={{
            label: t.chooseAll,
            onClick: () => setPicked(WORD_CATEGORIES),
            disabled: all,
          }}
          helper={t.keepOne}
        />
      </Dialog>
    </>
  );
}
