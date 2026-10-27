import { forwardRef } from 'react';

import {
  formatOfflineActionLabel,
  OFFLINE_ACTION_SUFFIX,
  useOfflineStatus,
} from '@/features/offline-status/model/offline-status-model';
import { Button, type ButtonProps } from '@/shared/ui/button';

export interface OfflineActionButtonProps extends Omit<ButtonProps, 'children'> {
  label?: string | undefined;
  offline?: boolean | undefined;
  offlineSuffix?: string | undefined;
}

export const OfflineActionButton = forwardRef<HTMLButtonElement, OfflineActionButtonProps>(
  function OfflineActionButton(
    {
      label = 'Добавить место',
      offline,
      offlineSuffix = OFFLINE_ACTION_SUFFIX,
      disabled = false,
      variant = 'primary',
      ...rest
    },
    ref,
  ) {
    const { isOffline } = useOfflineStatus(offline);
    const resolvedText = isOffline ? formatOfflineActionLabel(label, offlineSuffix) : label;

    return (
      <Button ref={ref} variant={variant} disabled={disabled || isOffline} {...rest}>
        {resolvedText}
      </Button>
    );
  },
);
