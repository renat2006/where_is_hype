import { QueryClient, QueryClientContext, QueryClientProvider } from '@tanstack/react-query';
import type { Place } from '@where-is-hype/core';
import { ChevronLeft } from 'lucide-react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import {
  CandidateListView,
  LinkInputForm,
  ResolveLoadingView,
  useResolveLinkFlow,
} from '@/features/resolve-link';
import { useSavePlaceFlow } from '@/features/save-place';
import { SearchPlaceView } from '@/features/search-place';
import { isTelegramMiniApp, telegramStorage, useTelegramBackButton } from '@/shared/telegram';
import { Button } from '@/shared/ui/button';
import { ToastViewport } from '@/shared/ui/toast';

export const ADD_PLACE_DRAFT_STORAGE_KEY = 'where-is-hype:add-place-draft';

export type AddPlaceStep = 'input' | 'loading' | 'candidates' | 'search';

export interface AddPlacePageProps {
  showDemoLinks?: boolean | undefined;
  slowThresholdMs?: number | undefined;
}

const fallbackQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

function AddPlacePageContent({ showDemoLinks, slowThresholdMs }: AddPlacePageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialUrlParam = searchParams.get('url')?.trim() ?? '';

  const [url, setUrl] = useState(initialUrlParam);
  const [step, setStep] = useState<AddPlaceStep>(() =>
    initialUrlParam.length > 0 ? 'loading' : 'input',
  );
  const [unrecognized, setUnrecognized] = useState(false);

  useEffect(() => {
    if (initialUrlParam.length > 0 || !isTelegramMiniApp()) {
      return;
    }

    let cancelled = false;
    void telegramStorage.getItem(ADD_PLACE_DRAFT_STORAGE_KEY).then((draft) => {
      if (!cancelled && draft && draft.trim().length > 0) {
        setUrl((prev) => (prev.length === 0 ? draft : prev));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialUrlParam]);

  const handleUrlChange = useCallback((nextUrl: string) => {
    setUrl(nextUrl);
    if (isTelegramMiniApp()) {
      if (nextUrl.trim().length > 0) {
        void telegramStorage.setItem(ADD_PLACE_DRAFT_STORAGE_KEY, nextUrl);
      } else {
        void telegramStorage.deleteItem(ADD_PLACE_DRAFT_STORAGE_KEY);
      }
    }
  }, []);

  const { savedPlaceIds, savePlaceWithFeedback, savingPlaceId, saveError, clearSaveError } =
    useSavePlaceFlow();

  const handleResolvedCandidates = useCallback(() => {
    setUnrecognized(false);
    setStep('candidates');
  }, []);

  const handleUnrecognized = useCallback((failedUrl: string) => {
    setUrl(failedUrl);
    setUnrecognized(true);
    setStep('search');
  }, []);

  const { loadingStep, isSlow, candidates, startResolve, cancelResolve, trackLinkPastedOnce } =
    useResolveLinkFlow({
      slowThresholdMs,
      onResolvedCandidates: handleResolvedCandidates,
      onUnrecognized: handleUnrecognized,
    });

  const autoResolvedRef = useRef<string | null>(null);
  useEffect(() => {
    if (initialUrlParam.length > 0 && autoResolvedRef.current !== initialUrlParam) {
      autoResolvedRef.current = initialUrlParam;
      void startResolve(initialUrlParam);
      return () => {
        autoResolvedRef.current = null;
      };
    }
    return undefined;
  }, [initialUrlParam, startResolve]);

  const handleSubmitUrl = (submittedUrl: string) => {
    const trimmed = submittedUrl.trim();
    if (!trimmed) {
      return;
    }
    clearSaveError();
    setUrl(trimmed);
    setUnrecognized(false);
    setStep('loading');
    void startResolve(trimmed);
  };

  const handleCancelLoading = () => {
    cancelResolve();
    setStep('input');
  };

  const handleSwitchToSearch = () => {
    cancelResolve();
    clearSaveError();
    setUnrecognized(false);
    setStep('search');
  };

  const handleOpenPlace = (place: Place) => {
    void navigate(`/place/${place.id}`);
  };

  const handleSaveFromCandidate = async (place: Place) => {
    try {
      const outcome = await savePlaceWithFeedback(place, {
        source: 'link',
        sourceUrl: url,
      });
      if (outcome.status === 'saved') {
        void telegramStorage.deleteItem(ADD_PLACE_DRAFT_STORAGE_KEY);
        void navigate(`/place/${outcome.savedPlace.place.id}`);
      }
    } catch {
      // Save error is displayed via saveError state
    }
  };

  const handleSaveFromSearch = async (place: Place) => {
    try {
      const outcome = await savePlaceWithFeedback(place, {
        source: 'name',
        sourceUrl: url,
      });
      if (outcome.status === 'saved') {
        void telegramStorage.deleteItem(ADD_PLACE_DRAFT_STORAGE_KEY);
        void navigate(`/place/${outcome.savedPlace.place.id}`);
      }
    } catch {
      // Save error is displayed via saveError state
    }
  };

  const handleNativeBack = useCallback(() => {
    if (step === 'loading') {
      cancelResolve();
      setStep('input');
      return;
    }
    if (step === 'candidates') {
      clearSaveError();
      setStep('input');
      return;
    }
    if (step === 'search') {
      clearSaveError();
      if (!unrecognized && candidates.length > 0) {
        setStep('candidates');
      } else {
        setUnrecognized(false);
        setStep('input');
      }
      return;
    }
    void navigate('/');
  }, [cancelResolve, candidates.length, clearSaveError, navigate, step, unrecognized]);

  const { isNativeBackVisible } = useTelegramBackButton(handleNativeBack, true);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 p-4">
      {step === 'input' && (
        <>
          <header className="flex items-center gap-3">
            {!isNativeBackVisible && (
              <Button
                variant="map"
                aria-label="Назад"
                onClick={() => {
                  void navigate('/');
                }}
                className="h-11 min-h-11 w-11 min-w-11 shrink-0 px-0 py-0"
              >
                <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
              </Button>
            )}
            <h1 className="m-0 font-display text-xl font-normal text-ink">Добавить место</h1>
          </header>

          <p className="m-0 text-base leading-6 text-ink-muted">
            Вставь ссылку на Reels, клип или пост — найдём место в базе и положим на твою карту.
          </p>

          <LinkInputForm
            url={url}
            onUrlChange={handleUrlChange}
            onSubmitUrl={handleSubmitUrl}
            onPasteUrl={trackLinkPastedOnce}
            onSwitchToSearch={handleSwitchToSearch}
            showDemoLinks={showDemoLinks}
          />
        </>
      )}

      {step === 'loading' && (
        <ResolveLoadingView
          loadingStep={loadingStep}
          isSlow={isSlow}
          onCancel={handleCancelLoading}
          onSwitchToSearch={handleSwitchToSearch}
        />
      )}

      {step === 'candidates' && (
        <CandidateListView
          sourceUrl={url}
          candidates={candidates}
          savedPlaceIds={savedPlaceIds}
          savingPlaceId={savingPlaceId}
          saveError={saveError}
          onSavePlace={(place) => {
            void handleSaveFromCandidate(place);
          }}
          onOpenPlace={handleOpenPlace}
          onSearchByName={handleSwitchToSearch}
          onBack={() => {
            clearSaveError();
            setStep('input');
          }}
        />
      )}

      {step === 'search' && (
        <SearchPlaceView
          sourceUrl={url}
          onSourceUrlChange={setUrl}
          unrecognized={unrecognized}
          savedPlaceIds={savedPlaceIds}
          savingPlaceId={savingPlaceId}
          saveError={saveError}
          onSelectPlace={(place) => {
            void handleSaveFromSearch(place);
          }}
          onOpenPlace={handleOpenPlace}
          onBack={() => {
            clearSaveError();
            if (!unrecognized && candidates.length > 0) {
              setStep('candidates');
            } else {
              setUnrecognized(false);
              setStep('input');
            }
          }}
        />
      )}

      <ToastViewport />
    </main>
  );
}

export function AddPlacePage(props: AddPlacePageProps) {
  const existingQueryClient = useContext(QueryClientContext);

  if (!existingQueryClient) {
    return (
      <QueryClientProvider client={fallbackQueryClient}>
        <AddPlacePageContent {...props} />
      </QueryClientProvider>
    );
  }

  return <AddPlacePageContent {...props} />;
}
