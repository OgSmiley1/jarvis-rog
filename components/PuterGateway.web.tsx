import { forwardRef, useImperativeHandle } from 'react';
import { View } from 'react-native';
import { AppText } from './Ui';
import type { PuterGatewayHandle } from './PuterGateway.native';
import type { PuterBridgeEvent } from '@/lib/online/types';

export const PuterGateway = forwardRef<PuterGatewayHandle, { onEvent: (event: PuterBridgeEvent) => void }>(
  function PuterGatewayWeb({ onEvent }, ref) {
    useImperativeHandle(ref, () => ({
      refreshModels: () => onEvent({ type: 'bridge_error', payload: { message: 'Use the Android build for the embedded Puter gateway.' } }),
      refreshAuth: () => undefined,
      signOut: () => undefined,
      getUsage: () => undefined,
      chat: () => onEvent({ type: 'chat_error', payload: { message: 'Embedded online gateway is Android-only in this build.' } }),
    }));
    return <View><AppText muted>Embedded Puter gateway is available in the Android build.</AppText></View>;
  },
);
