import { type SubmitEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { buildAddPlacePath, readClipboardLink } from '@/features/start-session/lib/clipboard';
import { useStartSession } from '@/features/start-session/model/start-session-model';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

export interface WelcomeLinkFormProps {
  initialUrl?: string | undefined;
  autoStartSession?: boolean | undefined;
}

export function WelcomeLinkForm({
  initialUrl = '',
  autoStartSession = true,
}: WelcomeLinkFormProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { startSession } = useStartSession({ autoStart: autoStartSession });

  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUrlChange = (nextValue: string) => {
    setUrl(nextValue);
    if (error) {
      setError(null);
    }
  };

  const handleClear = () => {
    setUrl('');
    setError(null);
    inputRef.current?.focus();
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    let targetUrl = url.trim();

    if (!targetUrl) {
      const clipboardResult = await readClipboardLink();
      if (clipboardResult.status === 'success') {
        targetUrl = clipboardResult.text;
        setUrl(targetUrl);
        setError(null);
      } else if (clipboardResult.status === 'empty') {
        setError('В буфере обмена пусто — вставь ссылку на ролик в поле.');
        inputRef.current?.focus();
        return;
      } else {
        setError('Не удалось вставить из буфера — вставь ссылку в поле вручную.');
        inputRef.current?.focus();
        return;
      }
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await startSession();
    } finally {
      setIsSubmitting(false);
    }

    await navigate(buildAddPlacePath(targetUrl));
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-3">
      <span
        aria-hidden="true"
        className="-rotate-3 self-end font-hand text-xl leading-none font-semibold text-ink select-none"
      >
        просто вставь сюда
      </span>

      <TextField
        ref={inputRef}
        variant="link"
        label="Ссылка на ролик"
        placeholder="Instagram, TikTok, ВК, YouTube…"
        type="url"
        inputMode="url"
        autoComplete="off"
        value={url}
        onValueChange={handleUrlChange}
        onClear={handleClear}
        error={error}
      />

      <Button
        type="submit"
        variant="primary"
        fullWidth
        loading={isSubmitting}
        loadingLabel="Переходим"
      >
        Вставить ссылку
      </Button>

      <p className="m-0 text-center font-ui text-xs font-medium text-ink-muted">
        Без регистрации. Имя и телефон не нужны.
      </p>
    </form>
  );
}
