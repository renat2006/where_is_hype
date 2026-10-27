import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import type { Place, SavedPlace, Visit, VisitExpectation } from '@where-is-hype/core';
import { MapPin } from 'lucide-react';
import { useContext, useMemo, useRef, useState } from 'react';

import {
  countVisitedPlaces,
  hasVisitedToday,
  savedPlaceQueries,
  updateVisitExpectation,
} from '@/entities/saved-place';
import {
  applyOptimisticVisit,
  clampVisitComment,
  type DemoProximity,
  ensurePlaceAndMarkVisit,
  evaluateVisitLocation,
  getDemoVisitLocation,
  isVisitDemoModeEnabled,
  MARK_VISIT_BUTTON_LABEL,
  requestCurrentVisitLocation,
  updateLatestVisitInMockDb,
  VISIT_MARKED_TODAY_CAPTION,
  VISIT_SAVED_TOAST_MESSAGE,
} from '@/features/mark-visit/model/mark-visit-model';
import { readMockState } from '@/shared/api';
import { track } from '@/shared/lib/analytics';
import { Button } from '@/shared/ui/button';
import { showToast } from '@/shared/ui/toast';

import { MarkVisitModal } from './mark-visit-modal';

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

function patchLatestVisitOnSavedPlace(
  savedPlace: SavedPlace,
  patch: Partial<Pick<Visit, 'verified' | 'expectation' | 'comment'>>,
): SavedPlace {
  if (savedPlace.visits.length === 0) {
    return savedPlace;
  }
  const lastIndex = savedPlace.visits.length - 1;
  return {
    ...savedPlace,
    visits: savedPlace.visits.map((visit, idx) =>
      idx === lastIndex
        ? {
            ...visit,
            ...(patch.verified !== undefined ? { verified: patch.verified } : {}),
            ...(patch.expectation !== undefined ? { expectation: patch.expectation } : {}),
            ...(patch.comment !== undefined ? { comment: patch.comment } : {}),
          }
        : visit,
    ),
  };
}

export interface MarkVisitButtonProps {
  place: Place;
  savedPlace?: SavedPlace | null | undefined;
  at?: Date | undefined;
  demoMode?: boolean | undefined;
  initialDemoProximity?: DemoProximity | undefined;
  reducedMotion?: boolean | undefined;
  onVisitMarked?: ((savedPlace: SavedPlace) => void) | undefined;
  onExpectationSaved?: ((savedPlace: SavedPlace) => void) | undefined;
}

export function MarkVisitButton({
  place,
  savedPlace: savedPlaceProp,
  at,
  demoMode: demoModeProp,
  initialDemoProximity = 'near',
  reducedMotion,
  onVisitMarked,
  onExpectationSaved,
}: MarkVisitButtonProps) {
  const contextQueryClient = useContext(QueryClientContext);
  const activeQueryClient = contextQueryClient ?? fallbackQueryClient;
  const savedPlacesQuery = useQuery(
    {
      ...savedPlaceQueries.list(),
      enabled: Boolean(contextQueryClient),
    },
    activeQueryClient,
  );

  const [localSavedPlace, setLocalSavedPlace] = useState<SavedPlace | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  const [isSubmittingExpectation, setIsSubmittingExpectation] = useState(false);
  const [verified, setVerified] = useState(true);
  const [demoProximity, setDemoProximity] = useState<DemoProximity>(initialDemoProximity);
  const [expectation, setExpectation] = useState<VisitExpectation | null>(null);
  const [comment, setComment] = useState('');
  const [expectationTracked, setExpectationTracked] = useState(false);

  const latestPatchRef = useRef<{
    verified: boolean;
    expectation: VisitExpectation | null;
    comment: string;
  }>({
    verified: true,
    expectation: null,
    comment: '',
  });
  const markInFlightRef = useRef<Promise<SavedPlace | null> | null>(null);

  const isDemo = isVisitDemoModeEnabled(demoModeProp);
  const savedPlacesList = savedPlacesQuery.data ?? readMockState().savedPlaces;

  const querySavedPlace = useMemo(
    () => savedPlacesList.find((item) => item.place.id === place.id) ?? null,
    [place.id, savedPlacesList],
  );

  const effectiveSavedPlace = useMemo(() => {
    const candidates = [localSavedPlace, querySavedPlace, savedPlaceProp].filter(
      (item): item is SavedPlace => Boolean(item),
    );
    if (candidates.length === 0) {
      return null;
    }
    return candidates.reduce((best, item) =>
      item.visits.length >= best.visits.length ? item : best,
    );
  }, [localSavedPlace, querySavedPlace, savedPlaceProp]);

  const effectiveList = useMemo(() => {
    const list = [...savedPlacesList];
    if (effectiveSavedPlace) {
      const idx = list.findIndex((item) => item.place.id === effectiveSavedPlace.place.id);
      if (idx >= 0) {
        list[idx] = effectiveSavedPlace;
      } else {
        list.unshift(effectiveSavedPlace);
      }
    }
    return list;
  }, [effectiveSavedPlace, savedPlacesList]);

  const totalCount = Math.max(effectiveList.length, 1);
  const visitedCount = Math.max(countVisitedPlaces(effectiveList), modalOpen ? 1 : 0);

  const visitedToday =
    !modalOpen &&
    Boolean(effectiveSavedPlace && hasVisitedToday(effectiveSavedPlace, at ?? new Date()));

  const syncSavedPlaceToCache = (updatedPlace: SavedPlace) => {
    setLocalSavedPlace(updatedPlace);
    activeQueryClient.setQueryData<SavedPlace[]>(savedPlaceQueries.list().queryKey, (prev) => {
      const list = prev ? [...prev] : [...effectiveList];
      const idx = list.findIndex((item) => item.place.id === updatedPlace.place.id);
      if (idx >= 0) {
        list[idx] = updatedPlace;
        return list;
      }
      return [updatedPlace, ...list];
    });
  };

  const applyPatchEverywhere = (
    patch: Partial<Pick<Visit, 'verified' | 'expectation' | 'comment'>>,
  ): SavedPlace | null => {
    const dbUpdated = updateLatestVisitInMockDb(place.id, patch);
    const base = dbUpdated ?? effectiveSavedPlace;
    if (!base) {
      return null;
    }
    const patched = patchLatestVisitOnSavedPlace(base, patch);
    syncSavedPlaceToCache(patched);
    return patched;
  };

  const handleMarkVisit = async () => {
    if (visitedToday || isMarking) {
      return;
    }

    setIsMarking(true);

    try {
      const currentProximity = initialDemoProximity;
      setDemoProximity(currentProximity);

      const userLocation = isDemo
        ? getDemoVisitLocation(place.location, currentProximity)
        : await requestCurrentVisitLocation();

      const evaluation = evaluateVisitLocation(userLocation, place.location);
      const isVerifiedVisit = evaluation.verified;

      latestPatchRef.current = {
        verified: isVerifiedVisit,
        expectation: null,
        comment: '',
      };

      setVerified(isVerifiedVisit);
      setExpectation(null);
      setComment('');
      setExpectationTracked(false);
      setModalOpen(true);

      const optimisticVisit: Visit = {
        at: (at ?? new Date()).toISOString(),
        verified: isVerifiedVisit,
        expectation: 'as_expected',
        comment: null,
      };

      const optimistic = applyOptimisticVisit(
        activeQueryClient.getQueryData<SavedPlace[]>(savedPlaceQueries.list().queryKey) ??
          effectiveList,
        place,
        effectiveSavedPlace,
        optimisticVisit,
      );

      syncSavedPlaceToCache(optimistic.updated);

      track('visit_marked', {
        placeId: place.id,
        verified: isVerifiedVisit,
        status: isVerifiedVisit ? 'verified' : 'not',
      });

      const markPromise = ensurePlaceAndMarkVisit({
        place,
        savedPlace: effectiveSavedPlace,
        location: evaluation.location,
        verified: isVerifiedVisit,
      })
        .then((savedFromApi) => {
          const currentPatch = latestPatchRef.current;
          const mergedSaved = patchLatestVisitOnSavedPlace(savedFromApi, {
            verified: currentPatch.verified,
            ...(currentPatch.expectation ? { expectation: currentPatch.expectation } : {}),
            ...(currentPatch.comment.trim() ? { comment: currentPatch.comment.trim() } : {}),
          });

          updateLatestVisitInMockDb(place.id, {
            verified: currentPatch.verified,
            ...(currentPatch.expectation ? { expectation: currentPatch.expectation } : {}),
            ...(currentPatch.comment.trim() ? { comment: currentPatch.comment.trim() } : {}),
          });

          syncSavedPlaceToCache(mergedSaved);
          onVisitMarked?.(mergedSaved);
          return mergedSaved;
        })
        .catch(() => null);

      markInFlightRef.current = markPromise;
      await markPromise;
    } finally {
      markInFlightRef.current = null;
      setIsMarking(false);
    }
  };

  const handleToggleDemoProximity = () => {
    const nextProximity: DemoProximity = demoProximity === 'near' ? 'far' : 'near';
    const nextLocation = getDemoVisitLocation(place.location, nextProximity);
    const nextVerified = evaluateVisitLocation(nextLocation, place.location).verified;

    setDemoProximity(nextProximity);
    setVerified(nextVerified);
    latestPatchRef.current.verified = nextVerified;

    applyPatchEverywhere({ verified: nextVerified });

    track('visit_marked', {
      placeId: place.id,
      verified: nextVerified,
      status: nextVerified ? 'verified' : 'not',
    });
  };

  const handleSelectExpectation = (nextExpectation: VisitExpectation) => {
    setExpectation(nextExpectation);
    latestPatchRef.current.expectation = nextExpectation;

    track('expectation_answered', {
      placeId: place.id,
      expectation: nextExpectation,
    });
    setExpectationTracked(true);

    const normalizedComment = clampVisitComment(comment).trim() || null;
    const patched = applyPatchEverywhere({
      expectation: nextExpectation,
      comment: normalizedComment,
    });

    if (patched) {
      onExpectationSaved?.(patched);
    }
  };

  const handleChangeComment = (nextComment: string) => {
    const clamped = clampVisitComment(nextComment);
    setComment(clamped);
    latestPatchRef.current.comment = clamped;
  };

  const handleFinish = async () => {
    const finalExpectation: VisitExpectation = expectation ?? 'as_expected';
    const finalComment = clampVisitComment(comment).trim() || null;

    if (!expectationTracked) {
      track('expectation_answered', {
        placeId: place.id,
        expectation: finalExpectation,
      });
      setExpectationTracked(true);
    }

    setIsSubmittingExpectation(true);

    try {
      if (markInFlightRef.current) {
        await markInFlightRef.current;
      }

      applyPatchEverywhere({
        verified: latestPatchRef.current.verified,
        expectation: finalExpectation,
        comment: finalComment,
      });

      const saved = await updateVisitExpectation({
        placeId: place.id,
        expectation: finalExpectation,
        comment: finalComment,
      });

      const synced = patchLatestVisitOnSavedPlace(saved, {
        verified: latestPatchRef.current.verified,
      });
      updateLatestVisitInMockDb(place.id, { verified: latestPatchRef.current.verified });
      syncSavedPlaceToCache(synced);
      onExpectationSaved?.(synced);
    } catch {
      // Optimistic patch is already applied
    } finally {
      setIsSubmittingExpectation(false);
      setModalOpen(false);
      showToast({ message: VISIT_SAVED_TOAST_MESSAGE });
    }
  };

  const handleClose = () => {
    setModalOpen(false);
  };

  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        disabled={visitedToday}
        loading={isMarking}
        {...(visitedToday ? { errorText: VISIT_MARKED_TODAY_CAPTION } : {})}
        onClick={() => {
          void handleMarkVisit();
        }}
        data-testid="mark-visit-button"
      >
        <MapPin size={18} strokeWidth={2} aria-hidden="true" className="shrink-0" />
        <span>{MARK_VISIT_BUTTON_LABEL}</span>
      </Button>

      <MarkVisitModal
        open={modalOpen}
        place={place}
        verified={verified}
        visitedCount={visitedCount}
        totalCount={totalCount}
        expectation={expectation}
        comment={comment}
        isSubmitting={isSubmittingExpectation}
        demoMode={isDemo}
        demoProximity={demoProximity}
        reducedMotion={reducedMotion}
        onSelectExpectation={handleSelectExpectation}
        onChangeComment={handleChangeComment}
        onToggleDemoProximity={isDemo ? handleToggleDemoProximity : undefined}
        onFinish={() => {
          void handleFinish();
        }}
        onClose={handleClose}
      />
    </>
  );
}
