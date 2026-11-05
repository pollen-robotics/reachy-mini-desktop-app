import { STATUS } from '@styles/tokens';
import type { NfcState } from './nfcState';

/** Dot colour for each reader state, shared by the status button and the Settings card. */
export const NFC_STATE_COLOR: Record<NfcState, string> = {
  disabled: STATUS.neutral,
  unavailable: STATUS.neutral,
  connecting: STATUS.neutral,
  not_responding: STATUS.warning,
  idle: STATUS.neutral,
  tag: STATUS.success,
};
