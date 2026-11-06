import React from 'react';
import type { SxProps, Theme } from '@mui/material/styles';
import NfcReaderCard from './NfcReaderCard';
import { useNfcReader } from './useNfcReader';

export interface SettingsNfcCardProps {
  cardStyle?: SxProps<Theme>;
}

export default function SettingsNfcCard({ cardStyle }: SettingsNfcCardProps): React.ReactElement {
  const reader = useNfcReader();

  return (
    <NfcReaderCard
      status={reader.status}
      tag={reader.tag}
      state={reader.state}
      fetchError={reader.fetchError}
      unsupported={reader.unsupported}
      isErasing={reader.isErasing}
      eraseResult={reader.eraseResult}
      onErase={full => void reader.erase(full)}
      isWriting={reader.isWriting}
      writeResult={reader.writeResult}
      onWrite={content => void reader.write(content)}
      onClearResults={reader.clearResults}
      canToggle={reader.canToggle}
      isToggling={reader.isToggling}
      toggleError={reader.toggleError}
      onToggle={enabled => void reader.setEnabled(enabled)}
      cardStyle={cardStyle}
    />
  );
}
