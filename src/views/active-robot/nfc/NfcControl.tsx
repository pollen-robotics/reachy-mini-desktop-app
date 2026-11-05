import React, { useCallback } from 'react';
import useAppStore from '../../../store/useAppStore';
import { selectIsBusy } from '../../../store/slices';
import NfcStatusButton from './NfcStatusButton';
import { useNfcReader } from './useNfcReader';

export default function NfcControl(): React.ReactElement {
  // Settings polls the reader itself while open.
  const settingsOpen = useAppStore(state => state.showSettings);
  const reader = useNfcReader({ enabled: !settingsOpen });
  const isBusy = useAppStore(selectIsBusy);
  const openNfcSettings = useCallback(() => useAppStore.getState().openSettings('nfc'), []);

  return <NfcStatusButton state={reader.state} onClick={openNfcSettings} disabled={isBusy} />;
}
