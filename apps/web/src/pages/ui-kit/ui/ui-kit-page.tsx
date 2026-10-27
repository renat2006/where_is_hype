import { LocateFixed, LocateOff, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

import { useTheme } from '@/shared/lib/theme';
import { Avatars } from '@/shared/ui/avatars';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import {
  ChipGroup,
  getEveningHourOptions,
  PLACE_TYPE_CHIP_OPTIONS,
  PRICE_CHIP_OPTIONS,
} from '@/shared/ui/chip-group';
import { EmptyState } from '@/shared/ui/empty-state';
import { ErrorNote } from '@/shared/ui/error-note';
import { OfflineBanner } from '@/shared/ui/offline-banner';
import { Segmented } from '@/shared/ui/segmented';
import { Sheet, type SheetSnap } from '@/shared/ui/sheet';
import { PlaceRowSkeleton, Skeleton } from '@/shared/ui/skeleton';
import { Switch } from '@/shared/ui/switch';
import { TextField, type TextFieldSuggestion } from '@/shared/ui/text-field';
import { Toast, ToastViewport, useToast } from '@/shared/ui/toast';

const DEMO_SUGGESTIONS: readonly TextFieldSuggestion[] = [
  {
    id: 'zhuravli',
    title: 'Журавли',
    subtitle: 'Бар · Покровка, 17 · Китай-город',
  },
  {
    id: 'zhuk-i-pchela',
    title: 'Жук и Пчела',
    subtitle: 'Кофейня · Мясницкая, 24 · Чистые пруды',
  },
];

export function UiKitPage() {
  const { mode, resolvedTheme, setMode } = useTheme();
  const { showToast } = useToast();

  const [selectedHour, setSelectedHour] = useState<string>('19:00');
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['cafe', 'restaurant']);
  const [selectedPrice, setSelectedPrice] = useState<string>('1500');
  const [nearMetro, setNearMetro] = useState(true);

  const [linkEmpty, setLinkEmpty] = useState('');
  const [linkFilled, setLinkFilled] = useState('vt.tiktok.com/ZS8kQ2pLm');
  const [linkError, setLinkError] = useState('instagram.com/p/private');

  const [searchQuery, setSearchQuery] = useState('Жу');
  const [searchSingle, setSearchSingle] = useState('Ж');
  const [searchLoading, setSearchLoading] = useState('Жураввв');

  const [activeSheetSnap, setActiveSheetSnap] = useState<SheetSnap>('peek');

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-col gap-8 px-4 pt-4 pb-24">
      <header className="flex flex-col gap-3 border-b-[1.5px] border-ink pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="m-0 font-display text-2xl font-normal text-ink">UI-кит</h1>
          <span className="font-mono text-xs text-ink-muted">тема: {resolvedTheme}</span>
        </div>
        <Segmented value={mode} onChange={setMode} fullWidth />
      </header>

      <section className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3 border-b-[1.5px] border-ink pb-2">
          <span className="font-mono text-xs text-ink-muted">01</span>
          <h2 className="m-0 font-display text-xl font-normal text-ink">Кнопки</h2>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex items-baseline justify-between">
            <b className="text-sm font-semibold">Главная · primary</b>
            <span className="font-mono text-xs text-ink-muted">shadow-raised</span>
          </div>
          <div className="flex flex-wrap items-start gap-2.5">
            <Button variant="primary">Да, сохранить</Button>
            <Button variant="primary" visualState="pressed">
              Нажата
            </Button>
            <Button variant="primary" visualState="focus">
              Фокус
            </Button>
            <Button variant="primary" disabled>
              Неактивна
            </Button>
            <Button variant="primary" loading loadingLabel="Сохраняем">
              Сохраняем
            </Button>
            <Button variant="primary" errorText="Не сохранилось">
              Повторить
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex items-baseline justify-between">
            <b className="text-sm font-semibold">Вторичная · secondary</b>
            <span className="font-mono text-xs text-ink-muted">border-ink</span>
          </div>
          <div className="flex flex-wrap items-start gap-2.5">
            <Button variant="secondary">Маршрут</Button>
            <Button variant="secondary" visualState="pressed">
              Нажата
            </Button>
            <Button variant="secondary" visualState="focus">
              Фокус
            </Button>
            <Button variant="secondary" disabled>
              Неактивна
            </Button>
            <Button variant="secondary" loading loadingLabel="Открываем">
              Открываем
            </Button>
            <Button variant="secondary" errorText="Карты не открылись">
              Маршрут
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex items-baseline justify-between">
            <b className="text-sm font-semibold">Текстовая · text</b>
            <span className="font-mono text-xs text-ink-muted">underline</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="text">Сбросить</Button>
            <Button variant="text" visualState="pressed">
              Нажата
            </Button>
            <Button variant="text" visualState="focus">
              Фокус
            </Button>
            <Button variant="text" disabled>
              Неактивна
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 pb-2">
          <div className="flex items-baseline justify-between">
            <b className="text-sm font-semibold">Поверх карты · map</b>
            <span className="font-mono text-xs text-ink-muted">glass + blur</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="map" aria-label="Где я">
              <LocateFixed size={22} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="map" visualState="pressed" aria-label="Где я (нажата)">
              <LocateFixed size={22} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="map" visualState="focus" aria-label="Где я (фокус)">
              <LocateFixed size={22} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="map" disabled aria-label="Где я (неактивна)">
              <LocateFixed size={22} strokeWidth={2} aria-hidden="true" />
            </Button>
            <Button variant="map" loading loadingLabel="Ищем тебя" aria-label="Ищем тебя" />
            <Button variant="map" aria-label="Геолокация выключена" errorText="нет доступа">
              <LocateOff size={22} strokeWidth={2} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3 border-b-[1.5px] border-ink pb-2">
          <span className="font-mono text-xs text-ink-muted">02</span>
          <h2 className="m-0 font-display text-xl font-normal text-ink">Чипсы и фильтры</h2>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <b className="text-sm font-semibold">Чипс-фильтр · состояния</b>
          <div className="flex flex-wrap items-center gap-2">
            <Chip>Кофейня</Chip>
            <Chip visualState="pressed">Нажата</Chip>
            <Chip selected showCheck visualState="focus">
              Кофейня
            </Chip>
            <Chip disabled>Кофейня · 0</Chip>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <b className="text-sm font-semibold">Голос друга · vote</b>
          <div className="flex flex-wrap items-start gap-2">
            <Chip
              variant="vote"
              count={2}
              icon={<ThumbsUp size={18} strokeWidth={2} aria-hidden="true" />}
            >
              Мне подходит
            </Chip>
            <Chip variant="vote" visualState="pressed" count={2}>
              Мне подходит
            </Chip>
            <Chip variant="vote" selected showCheck visualState="focus" count={3}>
              Подходит
            </Chip>
            <Chip variant="vote" disabled>
              Голосование закрыто
            </Chip>
            <Chip variant="vote" loading>
              Мне подходит
            </Chip>
            <Chip variant="vote" count={2} errorText="Голос не ушёл. Ещё раз?">
              Мне подходит
            </Chip>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <b className="text-sm font-semibold">Выбор часа · одиночный</b>
          <ChipGroup
            ariaLabel="Выбор часа"
            options={getEveningHourOptions(17)}
            value={selectedHour}
            onChange={setSelectedHour}
          />
          <span className="font-mono text-xs text-ink-muted">
            только сегодня · шаг 1 час · прошедшие часы скрыты
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <b className="text-sm font-semibold">Выбор типа · множественный</b>
          <ChipGroup
            multiple
            ariaLabel="Выбор типа места"
            options={PLACE_TYPE_CHIP_OPTIONS}
            value={selectedTypes}
            onChange={setSelectedTypes}
          />
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <b className="text-sm font-semibold">Выбор чека · одиночный</b>
          <ChipGroup
            ariaLabel="Выбор чека"
            options={PRICE_CHIP_OPTIONS}
            value={selectedPrice}
            onChange={setSelectedPrice}
          />
          <span className="font-mono text-xs text-ink-muted">средний чек на человека</span>
        </div>

        <div className="flex flex-col gap-3 pb-2">
          <b className="text-sm font-semibold">Рядом с метро · switch</b>
          <Switch checked={nearMetro} onChange={setNearMetro} label="До 1 км от метро" />
          <div className="flex items-center justify-between border-t-[1.5px] border-line pt-2">
            <span className="text-sm">Найдено</span>
            <span className="font-mono text-lg font-semibold">
              {nearMetro ? '5 из 7' : '7 из 7'}
            </span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3 border-b-[1.5px] border-ink pb-2">
          <span className="font-mono text-xs text-ink-muted">03</span>
          <h2 className="m-0 font-display text-xl font-normal text-ink">Поля ввода</h2>
        </div>

        <div className="flex flex-col gap-4 border-b border-line pb-4">
          <b className="text-sm font-semibold">Поле ссылки · input-link</b>
          <TextField
            variant="link"
            label="Ссылка на ролик"
            value={linkEmpty}
            onValueChange={setLinkEmpty}
            hint="обычное · Instagram, TikTok, ВК, t.me, YouTube"
          />
          <TextField
            variant="link"
            label="Ссылка на ролик (заполнено)"
            value={linkFilled}
            onValueChange={setLinkFilled}
            onClear={() => {
              setLinkFilled('');
            }}
            visualState="focus"
            hint="фокус · заполнено"
          />
          <TextField
            variant="link"
            label="Ссылка на ролик (ошибка)"
            value={linkError}
            onValueChange={setLinkError}
            error="Ролик закрыт. Напиши название места, найдём сами."
          />
        </div>

        <div className="flex flex-col gap-4 pb-2">
          <b className="text-sm font-semibold">Поиск по названию · input-search</b>
          <TextField
            variant="search"
            value={searchQuery}
            onValueChange={setSearchQuery}
            visualState="focus"
            suggestions={DEMO_SUGGESTIONS}
            showReportMissing
            onReportMissing={() => {
              showToast({ message: 'Заявка отправлена' });
            }}
          />
          <TextField
            variant="search"
            aria-label="Название места (1 символ)"
            value={searchSingle}
            onValueChange={setSearchSingle}
          />
          <TextField
            variant="search"
            aria-label="Название места (загрузка)"
            value={searchLoading}
            onValueChange={setSearchLoading}
            loading
            hint="загрузка — точки справа, список не прыгает"
          />
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3 border-b-[1.5px] border-ink pb-2">
          <span className="font-mono text-xs text-ink-muted">04</span>
          <h2 className="m-0 font-display text-xl font-normal text-ink">Шторка и друзья</h2>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex items-center justify-between">
            <b className="text-sm font-semibold">Шторка · peek / half / full</b>
            <span className="font-mono text-xs text-ink-muted">{activeSheetSnap}</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['peek', 'half', 'full'] as const).map((snapItem) => (
              <div key={snapItem} className="flex flex-col gap-1">
                <div className="relative h-[220px] overflow-hidden rounded-md bg-line">
                  <Sheet
                    snap={snapItem}
                    ariaLabel={`Шторка ${snapItem}`}
                    header={
                      <div className="flex items-baseline justify-between">
                        <b className="text-xs font-semibold">Мои места</b>
                        <span className="font-mono text-xs text-ink-muted">7</span>
                      </div>
                    }
                  >
                    {snapItem !== 'peek' ? (
                      <div className="flex flex-col gap-2 px-3 py-1">
                        <div className="h-2 w-[80%] rounded-sm bg-line" />
                        <div className="h-2 w-[65%] rounded-sm bg-line" />
                        {snapItem === 'full' ? (
                          <div className="h-2 w-[75%] rounded-sm bg-line" />
                        ) : null}
                      </div>
                    ) : null}
                  </Sheet>
                </div>
                <span className="font-mono text-xs text-ink-muted">
                  {snapItem === 'peek'
                    ? 'peek · 96px'
                    : snapItem === 'half'
                      ? 'half · 50%'
                      : 'full · −24px'}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            {(['peek', 'half', 'full'] as const).map((snapOption) => (
              <Chip
                key={snapOption}
                mono
                selected={activeSheetSnap === snapOption}
                onClick={() => {
                  setActiveSheetSnap(snapOption);
                }}
              >
                {snapOption}
              </Chip>
            ))}
          </div>

          <div className="relative h-[220px] overflow-hidden rounded-md bg-line">
            <Sheet
              snap={activeSheetSnap}
              onSnapChange={setActiveSheetSnap}
              ariaLabel="Демонстрация шторки"
              header={
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Мои места</span>
                  <span className="text-xs text-ink-muted">
                    <span className="font-mono">7</span> мест · был в{' '}
                    <span className="font-mono">2</span>
                  </span>
                </div>
              }
            >
              <div className="flex flex-col gap-2 px-4 py-2">
                <div className="h-2.5 w-[80%] rounded-sm bg-line" />
                <div className="h-2.5 w-[65%] rounded-sm bg-line" />
                <div className="h-2.5 w-[75%] rounded-sm bg-line" />
              </div>
            </Sheet>
          </div>
        </div>

        <div className="flex flex-col gap-3 pb-2">
          <b className="text-sm font-semibold">Аватары друзей · стопкой</b>
          <Avatars items={['АК', 'МЛ', 'Д', 'ОП', 'СВ']} maxVisible={3} showLabel />
          <span className="font-mono text-xs text-ink-muted">
            цвет = хэш имени по 3 цветам наклеек (без томата)
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex items-baseline gap-3 border-b-[1.5px] border-ink pb-2">
          <span className="font-mono text-xs text-ink-muted">05</span>
          <h2 className="m-0 font-display text-xl font-normal text-ink">Обратная связь</h2>
        </div>

        <div className="flex flex-col gap-3 border-b border-line pb-4">
          <div className="flex items-center justify-between">
            <b className="text-sm font-semibold">Тосты · 5 с и подтверждение</b>
            <Button
              variant="text"
              onClick={() => {
                showToast({
                  message: 'Место удалено',
                  onUndo: () => undefined,
                });
              }}
            >
              Вызвать тост
            </Button>
          </div>
          <Toast
            message="Место удалено"
            secondsLeft={5}
            onUndo={() => {
              showToast({ message: 'Удаление отменено' });
            }}
          />
          <Toast message="Ссылка скопирована" secondsLeft={5} showCountdown={false} />
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs text-ink-muted">error-note</span>
          <ErrorNote
            title="Не узнали место"
            description="Напиши название, найдём сами."
            actionLabel="Искать по названию"
          />
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs text-ink-muted">offline-banner</span>
          <OfflineBanner variant="offline" />
          <OfflineBanner variant="slow" />
        </div>

        <div className="flex flex-col gap-3 border-y border-line py-4">
          <span className="font-mono text-xs text-ink-muted">skeleton · медленная сеть</span>
          <Skeleton height={120} className="w-full rounded-md" />
          <PlaceRowSkeleton />
          <PlaceRowSkeleton />
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-mono text-xs text-ink-muted">empty-state</span>
          <EmptyState
            title="Пока пусто"
            description="Кинь ссылку на ролик, и место появится здесь."
            actionLabel="Вставить ссылку"
          />
        </div>
      </section>

      <ToastViewport />
    </main>
  );
}
