import type { ChangeEvent, ClipboardEvent, ReactNode, SyntheticEvent } from 'react';
import { useState } from 'react';

import { demoLinks } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import { isDemoLinksEnabled } from './resolve-link-flow';

export interface LinkInputFormProps {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmitUrl: (url: string) => void;
  onPasteUrl?: ((url: string) => void) | undefined;
  onSwitchToSearch: () => void;
  showDemoLinks?: boolean | undefined;
  loading?: boolean | undefined;
  error?: ReactNode;
}

export function LinkInputForm({
  url,
  onUrlChange,
  onSubmitUrl,
  onPasteUrl,
  onSwitchToSearch,
  showDemoLinks,
  loading = false,
  error,
}: LinkInputFormProps) {
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const demoEnabled = isDemoLinksEnabled(showDemoLinks);

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setValidationHint('Вставь ссылку на ролик или выбери поиск по названию');
      return;
    }
    setValidationHint(null);
    onSubmitUrl(trimmed);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setValidationHint('Файл больше 20 МБ — выбери короткий ролик до 20 МБ');
      return;
    }
    setValidationHint(null);
    const fileUrl = `file://${file.name}`;
    onUrlChange(fileUrl);
    onSubmitUrl(fileUrl);
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').trim();
    if (pasted) {
      setValidationHint(null);
      onPasteUrl?.(pasted);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <TextField
          variant="link"
          label="Ссылка на ролик"
          placeholder="Instagram, TikTok, ВК, YouTube…"
          value={url}
          onValueChange={(nextValue) => {
            if (validationHint) {
              setValidationHint(null);
            }
            onUrlChange(nextValue);
          }}
          onClear={() => {
            setValidationHint(null);
            onUrlChange('');
          }}
          onPaste={handlePaste}
          disabled={loading}
          error={error ?? validationHint ?? undefined}
          hint="Instagram, TikTok, ВК, t.me, YouTube и любые другие"
        />

        {demoEnabled && (
          <div
            aria-label="Примеры ссылок для демо"
            className="flex flex-wrap items-center gap-2 pt-0.5"
          >
            {demoLinks.map((demo) => (
              <Button
                key={demo.id}
                variant="text"
                disabled={loading}
                onClick={() => {
                  setValidationHint(null);
                  onUrlChange(demo.url);
                  onSubmitUrl(demo.url);
                }}
              >
                {demo.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <Button variant="primary" type="submit" loading={loading} loadingLabel="Смотрим" fullWidth>
        Вставить ссылку
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center px-3 py-1.5 font-ui text-sm font-semibold text-link underline underline-offset-4 hover:text-ink">
          <span>Загрузить видео (.mp4 до 20 МБ)</span>
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            data-testid="add-video-file-input"
            disabled={loading}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
        <Button variant="text" disabled={loading} onClick={onSwitchToSearch} className="self-center">
          Найти по названию
        </Button>
      </div>
    </form>
  );
}
