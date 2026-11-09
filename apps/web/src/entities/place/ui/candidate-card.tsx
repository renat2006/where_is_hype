import type { Candidate, Location, Place, PlaceType } from '@where-is-hype/core';
import {
  detectPlatform,
  distanceM as calcDistanceM,
  formatDistance,
  placeTypeLabel,
  platformLabel,
} from '@where-is-hype/core';
import clsx from 'clsx';
import { type HTMLAttributes, useState } from 'react';

import type { MatchStatus, ResolvedCandidate } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { Sticker } from '@/shared/ui/sticker';

import { HoursStatus } from './hours-status';

type EvidenceSourceLabel = 'речь' | 'текст на экране' | 'подпись' | 'кадры';

function formatEvidenceSource(evidence: string | null | undefined): EvidenceSourceLabel | null {
  if (!evidence) {
    return null;
  }
  const normalized = evidence.trim().toLowerCase();
  switch (normalized) {
    case 'speech':
    case 'audio':
    case 'voice':
    case 'речь':
      return 'речь';
    case 'on_screen_text':
    case 'ocr':
    case 'screen_text':
    case 'текст на экране':
      return 'текст на экране';
    case 'caption':
    case 'description':
    case 'post_text':
    case 'подпись':
      return 'подпись';
    case 'visual':
    case 'frame':
    case 'frames':
    case 'video':
    case 'кадры':
      return 'кадры';
    default:
      return null;
  }
}

function resolveEvidenceQuote(
  candidate: ResolvedCandidate | Candidate | Place | null | undefined,
): string | null {
  if (!candidate || !('confidence' in candidate)) {
    return null;
  }
  const rawQuote =
    ('evidenceQuote' in candidate && typeof candidate.evidenceQuote === 'string'
      ? candidate.evidenceQuote
      : null) ??
    ('quote' in candidate && typeof candidate.quote === 'string' ? candidate.quote : null);
  const trimmed = rawQuote?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function resolveMatchStatus(
  candidate: ResolvedCandidate | Candidate | Place | null | undefined,
): MatchStatus {
  if (!candidate || !('confidence' in candidate)) {
    return 'exact';
  }
  const explicit =
    ('matchStatus' in candidate ? candidate.matchStatus : undefined) ??
    ('status' in candidate ? candidate.status : undefined);
  if (explicit) {
    return explicit;
  }
  if ('isChain' in candidate && candidate.isChain && !candidate.place) {
    return 'chain_ambiguous';
  }
  if (!candidate.place) {
    return 'not_found';
  }
  return candidate.confidence >= 0.85 ? 'exact' : 'ambiguous';
}

function resolveConfidenceBadge(
  candidate: ResolvedCandidate | Candidate | Place | null | undefined,
) {
  if (!candidate || !('confidence' in candidate)) {
    return null;
  }
  const status = resolveMatchStatus(candidate);
  const confidencePercent = Math.round(candidate.confidence * 100);

  if (status === 'chain_ambiguous') {
    return {
      level: 'chain' as const,
      label: 'Сеть без адреса · выберите филиал',
      confidencePercent,
    };
  }
  if (status === 'not_found') {
    return {
      level: 'not_found' as const,
      label: 'Не нашли в базе',
      confidencePercent,
    };
  }
  if (status === 'exact' && candidate.confidence >= 0.8) {
    return {
      level: 'high' as const,
      label: 'Высокая уверенность · точное совпадение',
      confidencePercent,
    };
  }
  if (candidate.confidence >= 0.6) {
    return {
      level: 'medium' as const,
      label: 'Средняя уверенность · проверьте адрес',
      confidencePercent,
    };
  }
  return {
    level: 'low' as const,
    label: 'Низкая уверенность · возможный вариант',
    confidencePercent,
  };
}

function findNearestBranch(branches: readonly Place[], origin?: Location | null): Place | null {
  if (branches.length === 0) {
    return null;
  }
  if (origin) {
    const sorted = [...branches].sort(
      (a, b) => calcDistanceM(a.location, origin) - calcDistanceM(b.location, origin),
    );
    return sorted[0] ?? null;
  }
  const sortedByMetro = [...branches].sort((a, b) => {
    const distA = a.metro.distanceM > 0 ? a.metro.distanceM : Number.MAX_SAFE_INTEGER;
    const distB = b.metro.distanceM > 0 ? b.metro.distanceM : Number.MAX_SAFE_INTEGER;
    return distA - distB;
  });
  return sortedByMetro[0] ?? null;
}

export interface CandidateCardProps extends HTMLAttributes<HTMLElement> {
  candidate?: ResolvedCandidate | Candidate | Place | undefined;
  place?: Place | undefined;
  index?: number | undefined;
  total?: number | undefined;
  isPrimary?: boolean | undefined;
  alreadySaved?: boolean | undefined;
  isSaved?: boolean | undefined;
  distanceM?: number | null | undefined;
  origin?: Location | null | undefined;
  at?: Date | undefined;
  sourceUrl?: string | null | undefined;
  loading?: boolean | undefined;
  saveLabel?: string | undefined;
  rejectLabel?: string | undefined;
  openLabel?: string | undefined;
  onSave?: ((place: Place) => void) | undefined;
  onReject?: ((place: Place) => void) | undefined;
  onOpen?: ((place: Place) => void) | undefined;
  onSearchByName?: ((initialQuery?: string) => void) | undefined;
}

function isCandidateObject(
  value: ResolvedCandidate | Candidate | Place | undefined,
): value is ResolvedCandidate | Candidate {
  return Boolean(value && typeof value === 'object' && 'confidence' in value);
}

function resolveCandidatePlace(
  candidate: ResolvedCandidate | Candidate | Place | undefined,
  place: Place | undefined,
): Place | null {
  if (place) {
    return place;
  }
  if (!candidate) {
    return null;
  }
  if (isCandidateObject(candidate)) {
    return candidate.place ?? null;
  }
  return candidate;
}

function resolveFallbackType(candidate: ResolvedCandidate | Candidate | undefined): PlaceType {
  if (!candidate || !('rawCategory' in candidate || 'category' in candidate)) {
    return 'cafe';
  }
  const raw =
    ('category' in candidate ? candidate.category : null) ??
    ('rawCategory' in candidate ? candidate.rawCategory : null) ??
    '';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'coffee') {
    return 'coffee';
  }
  if (normalized === 'bar') {
    return 'bar';
  }
  if (normalized === 'rest' || normalized === 'restaurant') {
    return 'rest';
  }
  return 'cafe';
}

function normalizeSourceHref(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function CandidateCard({
  candidate,
  place: placeProp,
  index,
  total,
  isPrimary = true,
  alreadySaved,
  isSaved,
  distanceM,
  origin,
  at,
  sourceUrl,
  loading = false,
  saveLabel,
  rejectLabel = 'Не то',
  openLabel = 'Открыть',
  onSave,
  onReject,
  onOpen,
  onSearchByName,
  className,
  ...rest
}: CandidateCardProps) {
  if (!candidate && !placeProp) {
    throw new Error('CandidateCard requires either `candidate` or `place` prop.');
  }

  const candidateObj = isCandidateObject(candidate) ? candidate : undefined;
  const place = resolveCandidatePlace(candidate, placeProp);
  const matchStatus = resolveMatchStatus(candidateObj);
  const confidenceBadge = resolveConfidenceBadge(candidateObj);
  const evidenceSource =
    candidateObj && 'evidence' in candidateObj ? formatEvidenceSource(candidateObj.evidence) : null;
  const evidenceQuote = resolveEvidenceQuote(candidateObj);
  const cleanSourceUrl = sourceUrl?.trim() ?? '';

  const branches =
    candidateObj &&
    'branchCandidates' in candidateObj &&
    Array.isArray(candidateObj.branchCandidates)
      ? candidateObj.branchCandidates
      : [];
  const nearestBranch = findNearestBranch(branches, origin);

  const [selectedBranchMode, setSelectedBranchMode] = useState<string>('nearest');

  const activeBranch: Place | null =
    selectedBranchMode === 'nearest'
      ? (nearestBranch ?? branches[0] ?? null)
      : (branches.find((b) => b.id === selectedBranchMode) ?? nearestBranch ?? branches[0] ?? null);

  if (!place && matchStatus === 'chain_ambiguous') {
    const rawExtractedName =
      candidateObj && 'extractedName' in candidateObj
        ? candidateObj.extractedName?.trim()
        : undefined;
    const chainName =
      (rawExtractedName && rawExtractedName.length > 0 ? rawExtractedName : null) ??
      activeBranch?.name ??
      'Сеть заведений';
    const stickerType = activeBranch?.type ?? resolveFallbackType(candidateObj);
    const branchHasAddress = Boolean(activeBranch?.address.trim());
    const branchHasMetro = Boolean(activeBranch?.metro.name.trim());
    const branchHasHours = activeBranch?.hours !== null && activeBranch?.hours !== undefined;
    const branchDistanceM = activeBranch
      ? origin
        ? calcDistanceM(activeBranch.location, origin)
        : branchHasMetro && activeBranch.metro.distanceM > 0
          ? activeBranch.metro.distanceM
          : null
      : null;

    return (
      <article
        data-candidate-id={activeBranch?.id ?? 'chain-ambiguous'}
        data-candidate-state="chain_ambiguous"
        className={clsx(
          'flex flex-col gap-3 rounded-md border-[1.5px] border-ink bg-surface p-4 text-ink',
          className,
        )}
        {...rest}
      >
        <div className="flex items-start gap-3">
          <Sticker
            type={stickerType}
            size="sm"
            placeId={activeBranch?.id ?? chainName}
            name={chainName}
            tilt={false}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-ui text-lg leading-6 font-bold text-ink">{chainName}</span>
            <span
              data-testid="candidate-confidence"
              className="inline-flex w-fit items-center gap-1.5 rounded-pill border border-dashed border-ink bg-status-unknown px-2.5 py-0.5 text-xs leading-4 font-medium text-ink"
            >
              {confidenceBadge?.label ?? 'Сеть без адреса · выберите филиал'}
            </span>
          </div>
          {index !== undefined && total !== undefined && (
            <span className="ml-auto font-mono text-xs text-ink-muted">
              {index}/{total}
            </span>
          )}
        </div>

        {(evidenceSource !== null || evidenceQuote !== null) && (
          <div
            data-testid="candidate-evidence"
            className="flex flex-col gap-1 rounded-sm border border-line bg-bg px-3 py-2 text-xs leading-4 text-ink-muted"
          >
            {evidenceSource !== null && (
              <span>
                Источник: <b className="font-semibold text-ink">{evidenceSource}</b>
              </span>
            )}
            {evidenceQuote !== null && (
              <blockquote className="m-0 text-ink italic">«{evidenceQuote}»</blockquote>
            )}
          </div>
        )}

        <p data-testid="chain-ambiguous-banner" className="m-0 text-xs leading-4 text-ink-muted">
          Сеть заведений — в ролике не указан точный адрес. Выберите ближайший филиал или конкретную точку:
        </p>

        {branches.length > 0 && (
          <div role="group" aria-label="Выбор филиала сети" className="flex flex-col gap-1.5">
            <button
              type="button"
              aria-pressed={selectedBranchMode === 'nearest'}
              onClick={() => {
                setSelectedBranchMode('nearest');
              }}
              className={clsx(
                'flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border-[1.5px] px-3 py-2 text-left font-ui text-xs leading-4 transition-colors',
                selectedBranchMode === 'nearest'
                  ? 'border-ink bg-bg font-semibold text-ink'
                  : 'border-line bg-surface text-ink-muted hover:border-ink',
              )}
            >
              <span>
                Ближайший филиал
                {nearestBranch?.address.trim() ? ` · ${nearestBranch.address}` : ''}
              </span>
              {nearestBranch && nearestBranch.metro.distanceM > 0 && (
                <span className="font-mono text-xs text-ink">
                  {formatDistance(
                    origin
                      ? calcDistanceM(nearestBranch.location, origin)
                      : nearestBranch.metro.distanceM,
                  )}
                </span>
              )}
            </button>

            {branches.map((branch) => {
              const isSelected = selectedBranchMode === branch.id;
              const bAddress = branch.address.trim();
              const bMetro = branch.metro.name.trim();
              return (
                <button
                  key={branch.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedBranchMode(branch.id);
                  }}
                  className={clsx(
                    'flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm border-[1.5px] px-3 py-2 text-left font-ui text-xs leading-4 transition-colors',
                    isSelected
                      ? 'border-ink bg-bg font-semibold text-ink'
                      : 'border-line bg-surface text-ink-muted hover:border-ink',
                  )}
                >
                  <span className="truncate">
                    {branch.name}
                    {bAddress ? ` · ${bAddress}` : ''}
                    {bMetro ? ` · м. ${bMetro}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {activeBranch && (branchHasAddress || branchHasMetro || branchHasHours) && (
          <div className="flex flex-col gap-1 text-sm leading-5 text-ink-muted">
            {(branchHasAddress || branchHasMetro || branchDistanceM !== null) && (
              <span>
                {placeTypeLabel[activeBranch.type]}
                {branchHasAddress && <> · {activeBranch.address}</>}
                {branchHasMetro && (
                  <>
                    {branchHasAddress ? <br /> : ' · '}
                    м. {activeBranch.metro.name}
                  </>
                )}
                {branchDistanceM !== null && (
                  <>
                    {' · '}
                    <span className="font-mono text-xs">{formatDistance(branchDistanceM)}</span>
                  </>
                )}
              </span>
            )}
            {branchHasHours && (
              <HoursStatus hours={activeBranch.hours} at={at} className="self-start" />
            )}
          </div>
        )}

        {cleanSourceUrl.length > 0 && (
          <a
            href={normalizeSourceHref(cleanSourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="candidate-source-link"
            className="inline-flex items-center gap-1 self-start font-ui text-xs leading-4 font-semibold text-link underline underline-offset-2 hover:text-ink"
          >
            Исходный ролик · {platformLabel[detectPlatform(cleanSourceUrl)]} ↗
          </a>
        )}

        <div className="flex flex-col gap-2">
          {activeBranch && (
            <Button
              variant={isPrimary ? 'primary' : 'secondary'}
              fullWidth
              loading={loading}
              loadingLabel="Сохраняем"
              onClick={() => {
                onSave?.(activeBranch);
              }}
            >
              {saveLabel ?? 'Да, сохранить'}
            </Button>
          )}
          {onSearchByName && (
            <Button
              variant="secondary"
              fullWidth
              onClick={() => {
                onSearchByName(chainName);
              }}
            >
              Найти другой филиал
            </Button>
          )}
        </div>
      </article>
    );
  }

  if (!place) {
    const rawExtractedName =
      candidateObj && 'extractedName' in candidateObj
        ? candidateObj.extractedName?.trim()
        : undefined;
    const extractedName =
      (rawExtractedName && rawExtractedName.length > 0 ? rawExtractedName : null) ??
      'Место из ролика';

    return (
      <article
        data-candidate-id="not-found"
        data-candidate-state="not_found"
        className={clsx(
          'flex flex-col gap-3 rounded-md border-[1.5px] border-dashed border-ink bg-surface p-4 text-ink',
          className,
        )}
        {...rest}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="font-ui text-lg leading-6 font-bold text-ink">{extractedName}</span>
            <span
              data-testid="candidate-confidence"
              className="inline-flex w-fit items-center rounded-pill border border-dashed border-ink bg-status-unknown px-2.5 py-0.5 text-xs leading-4 font-medium text-ink"
            >
              Не нашли в базе
            </span>
          </div>
          {index !== undefined && total !== undefined && (
            <span className="ml-auto font-mono text-xs text-ink-muted">
              {index}/{total}
            </span>
          )}
        </div>

        {(evidenceSource !== null || evidenceQuote !== null) && (
          <div
            data-testid="candidate-evidence"
            className="flex flex-col gap-1 rounded-sm border border-line bg-bg px-3 py-2 text-xs leading-4 text-ink-muted"
          >
            {evidenceSource !== null && (
              <span>
                Источник: <b className="font-semibold text-ink">{evidenceSource}</b>
              </span>
            )}
            {evidenceQuote !== null && (
              <blockquote className="m-0 text-ink italic">«{evidenceQuote}»</blockquote>
            )}
          </div>
        )}

        <p className="m-0 text-sm leading-5 text-ink-muted">
          Мы услышали или увидели название «{extractedName}», но не нашли такое место в базе. Если
          ролик закрытый — пришли видео файлом или найди место вручную.
        </p>

        {cleanSourceUrl.length > 0 && (
          <a
            href={normalizeSourceHref(cleanSourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="candidate-source-link"
            className="inline-flex items-center gap-1 self-start font-ui text-xs leading-4 font-semibold text-link underline underline-offset-2 hover:text-ink"
          >
            Исходный ролик · {platformLabel[detectPlatform(cleanSourceUrl)]} ↗
          </a>
        )}

        {onSearchByName && (
          <Button
            variant="secondary"
            onClick={() => {
              onSearchByName(extractedName);
            }}
            className="self-start"
          >
            Найти по названию
          </Button>
        )}
      </article>
    );
  }

  const saved = alreadySaved ?? isSaved ?? false;
  const hasAddress = place.address.trim().length > 0;
  const hasMetro = place.metro.name.trim().length > 0;
  const hasHours = place.hours !== null;

  const resolvedDistanceM =
    distanceM === null
      ? null
      : (distanceM ??
        (origin
          ? calcDistanceM(place.location, origin)
          : hasMetro || place.metro.distanceM > 0
            ? place.metro.distanceM
            : null));

  if (saved) {
    return (
      <article
        data-candidate-id={place.id}
        data-candidate-state="saved"
        className={clsx(
          'flex items-center gap-3 rounded-md border-[1.5px] border-line bg-surface p-4 text-ink',
          className,
        )}
        {...rest}
      >
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate font-ui text-base leading-[22px] font-semibold text-ink">
            {place.name}
          </b>
          <span className="text-sm leading-5 text-ink-muted">Уже в твоих местах</span>
        </div>
        {onOpen && (
          <Button
            variant="secondary"
            onClick={() => {
              onOpen(place);
            }}
            className="min-h-11 px-3.5"
          >
            {openLabel}
          </Button>
        )}
      </article>
    );
  }

  if (!isPrimary) {
    return (
      <article
        data-candidate-id={place.id}
        data-candidate-state="secondary"
        className={clsx(
          'flex items-center gap-3 rounded-md border-[1.5px] border-line bg-surface px-4 py-3.5 text-ink',
          className,
        )}
        {...rest}
      >
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <b className="truncate font-ui text-base leading-[22px] font-semibold text-ink">
            {place.name}
          </b>
          <span className="truncate text-[13px] leading-[18px] text-ink-muted">
            {placeTypeLabel[place.type]}
            {hasMetro ? ` · м. ${place.metro.name}` : hasAddress ? ` · ${place.address}` : ''}
          </span>
          {confidenceBadge && (
            <span data-testid="candidate-confidence" className="text-xs leading-4 text-ink-muted">
              {confidenceBadge.label}
            </span>
          )}
          {(evidenceSource !== null || evidenceQuote !== null) && (
            <span
              data-testid="candidate-evidence"
              className="truncate text-xs leading-4 text-ink-muted"
            >
              {evidenceSource ? `Источник: ${evidenceSource}` : ''}
              {evidenceSource && evidenceQuote ? ' · ' : ''}
              {evidenceQuote ? `«${evidenceQuote}»` : ''}
            </span>
          )}
        </div>
        <Button
          variant="secondary"
          loading={loading}
          onClick={() => {
            onSave?.(place);
          }}
          className="min-h-11 px-3.5"
        >
          {saveLabel ?? 'Это'}
        </Button>
      </article>
    );
  }

  return (
    <article
      data-candidate-id={place.id}
      data-candidate-state="primary"
      className={clsx(
        'flex flex-col gap-3 rounded-md border-[1.5px] border-ink bg-surface p-4 text-ink',
        className,
      )}
      {...rest}
    >
      <div className="flex items-start gap-3">
        <Sticker type={place.type} size="sm" placeId={place.id} name={place.name} tilt={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-ui text-lg leading-6 font-bold text-ink">{place.name}</span>
          {confidenceBadge && (
            <span
              data-testid="candidate-confidence"
              className={clsx(
                'inline-flex w-fit items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-xs leading-4 font-medium',
                confidenceBadge.level === 'high'
                  ? 'bg-status-open text-st-ink'
                  : 'border border-dashed border-ink bg-status-unknown text-ink',
              )}
            >
              <span>{confidenceBadge.label}</span>
              <span className="font-mono text-[11px]">{confidenceBadge.confidencePercent}%</span>
            </span>
          )}
          <span className="text-sm leading-5 text-ink-muted">
            {placeTypeLabel[place.type]}
            {hasAddress && <> · {place.address}</>}
            {(hasMetro || resolvedDistanceM !== null) && (
              <>
                <br />
                {hasMetro && <>м. {place.metro.name}</>}
                {hasMetro && resolvedDistanceM !== null && ' · '}
                {resolvedDistanceM !== null && (
                  <span className="font-mono text-xs">{formatDistance(resolvedDistanceM)}</span>
                )}
              </>
            )}
          </span>
        </div>
        {index !== undefined && total !== undefined && (
          <span className="ml-auto font-mono text-xs text-ink-muted">
            {index}/{total}
          </span>
        )}
      </div>

      {hasHours && <HoursStatus hours={place.hours} at={at} className="self-start" />}

      {(evidenceSource !== null || evidenceQuote !== null) && (
        <div
          data-testid="candidate-evidence"
          className="flex flex-col gap-1 rounded-sm border border-line bg-bg px-3 py-2 text-xs leading-4 text-ink-muted"
        >
          {evidenceSource !== null && (
            <span>
              Источник: <b className="font-semibold text-ink">{evidenceSource}</b>
            </span>
          )}
          {evidenceQuote !== null && (
            <blockquote className="m-0 text-ink italic">«{evidenceQuote}»</blockquote>
          )}
        </div>
      )}

      {cleanSourceUrl.length > 0 && (
        <a
          href={normalizeSourceHref(cleanSourceUrl)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="candidate-source-link"
          className="inline-flex items-center gap-1 self-start font-ui text-xs leading-4 font-semibold text-link underline underline-offset-2 hover:text-ink"
        >
          Исходный ролик · {platformLabel[detectPlatform(cleanSourceUrl)]} ↗
        </a>
      )}

      <div className="flex gap-2">
        <Button
          variant="primary"
          loading={loading}
          loadingLabel="Сохраняем"
          onClick={() => {
            onSave?.(place);
          }}
          className="flex-1"
        >
          {saveLabel ?? 'Да, сохранить'}
        </Button>
        {onReject && (
          <Button
            variant="secondary"
            onClick={() => {
              onReject(place);
            }}
          >
            {rejectLabel}
          </Button>
        )}
      </div>
    </article>
  );
}
