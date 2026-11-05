import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import NfcIcon from '@mui/icons-material/Nfc';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SectionHeader from '../../../components/viewer3d/settings/SectionHeader';
import { STATUS } from '@styles/tokens';
import { useAppPalette, TYPO, FONT_WEIGHT, RADIUS } from '@styles';
import { openUrl } from '../../../utils/tauriCompat';
import { NFC_STATE_COLOR } from './nfcStateColor';
import {
  describeTagError,
  isRawPreviewTruncated,
  isReaderAbsentForGood,
  ndefMessageBytes,
  needsFullErase,
  type NfcRecord,
  type NfcState,
  type NfcStatus,
  type NfcTag,
  type NfcTagResult,
  type NfcWriteContent,
} from './nfcState';

const ADD_ON_STORE_URL = 'https://store.pollen-robotics.com/products/reachy-mini-accessory-pack';

// Daemon limit; the tag capacity is checked separately, in bytes.
const MAX_WRITE_CHARS = 860;

type WriteKind = 'text' | 'uri';

export interface NfcReaderCardProps {
  status: NfcStatus | null;
  tag: NfcTag | null;
  state: NfcState;
  fetchError: string | null;
  isErasing: boolean;
  eraseResult: NfcTagResult | null;
  onErase: (full: boolean) => void;
  isWriting: boolean;
  writeResult: NfcTagResult | null;
  onWrite: (content: NfcWriteContent) => void;
  onClearResults: () => void;
  canToggle: boolean;
  isToggling: boolean;
  toggleError: string | null;
  onToggle: (enabled: boolean) => void;
  cardStyle?: SxProps<Theme>;
}

function readerTitle(status: NfcStatus | null): string {
  if (!status) return 'Unknown';
  if (status.enabled === false) return 'Reader switched off';
  if (status.error_code === 'LINK_ERROR') return 'Reader not responding';
  if (!status.connected) return 'Connecting…';
  return 'Reader connected';
}

function readerDetail(status: NfcStatus | null, fetchError: string | null): string | null {
  if (!status) return fetchError ?? 'Waiting for the daemon…';
  if (status.enabled === false) return 'Turn it on to read tags';
  if (status.error_code === 'LINK_ERROR') {
    return status.error ? `${status.error} · Retrying…` : 'Retrying…';
  }
  if (status.connected && status.board_version) return `Board version ${status.board_version}`;
  return null;
}

function recordValue(record: NfcRecord): string {
  return record.value ?? [record.type_name, record.data_hex].filter(Boolean).join(' ');
}

function editableContent(records: NfcRecord[]): { kind: WriteKind; value: string } {
  const record = records.find(r => (r.kind === 'text' || r.kind === 'uri') && r.value);
  if (!record) return { kind: 'text', value: '' };
  return { kind: record.kind as WriteKind, value: record.value ?? '' };
}

export default function NfcReaderCard({
  status,
  tag,
  state,
  fetchError,
  isErasing,
  eraseResult,
  onErase,
  isWriting,
  writeResult,
  onWrite,
  onClearResults,
  canToggle,
  isToggling,
  toggleError,
  onToggle,
  cardStyle,
}: NfcReaderCardProps): React.ReactElement {
  const palette = useAppPalette();
  const { textPrimary, textSecondary, textMuted } = palette;
  const [confirming, setConfirming] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [writeKind, setWriteKind] = useState<WriteKind>('text');
  const [draft, setDraft] = useState<string>('');

  const tagUid = tag?.present ? tag.uid : null;
  const records = tag?.records ?? [];
  const fullErase = needsFullErase(tag);
  const busy = isErasing || isWriting;
  const result = writeResult ?? eraseResult;

  // Reset when the tag changes.
  useEffect(() => {
    setConfirming(false);
    setEditing(false);
    if (!busy) onClearResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagUid]);

  const startEditing = (): void => {
    const { kind, value } = editableContent(records);
    setWriteKind(kind);
    setDraft(value);
    onClearResults();
    setEditing(true);
  };

  // The daemon only answers TOO_LONG once a tag is presented.
  const writeContent: NfcWriteContent =
    writeKind === 'uri' ? { uri: draft.trim() } : { text: draft };
  const writeBytes = ndefMessageBytes(writeContent);
  const capacity = tag?.present ? (tag.capacity ?? null) : null;
  const tooLong = capacity !== null && writeBytes > capacity;
  const canSubmit = draft.trim() !== '' && !tooLong;

  const submitWrite = (): void => {
    setEditing(false);
    onWrite(writeContent);
  };

  const labelSx = {
    fontSize: TYPO.tiny,
    fontWeight: FONT_WEIGHT.semibold,
    color: textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  } as const;

  const detail = readerDetail(status, fetchError);

  const monoSx = { fontFamily: 'monospace', fontSize: TYPO.xs, color: textSecondary } as const;

  // No board: show the add-on. While the reader starts, it is not connected yet either.
  const absent = status !== null && isReaderAbsentForGood(status);

  if (absent) {
    return (
      <Box sx={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
        <SectionHeader title="NFC Reader" icon={NfcIcon} darkMode={palette.isDark} />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{ fontSize: TYPO.md, fontWeight: FONT_WEIGHT.semibold, color: textPrimary }}
          >
            No NFC reader detected
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography sx={{ fontSize: TYPO.sm, color: textSecondary, lineHeight: 1.5 }}>
              Pop a hat on Reachy Mini and watch its personality change! The Conversation app reads
              the hat's NFC tag and takes on its character.
            </Typography>
            <Typography sx={{ fontSize: TYPO.sm, color: textSecondary, lineHeight: 1.5 }}>
              Got an idea? Tag any object and make it trigger your own behaviors in your apps.
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void openUrl(ADD_ON_STORE_URL)}
            endIcon={<OpenInNewIcon sx={{ fontSize: TYPO.md }} />}
            sx={{ textTransform: 'none' }}
          >
            Get the NFC add-on
          </Button>
          {!status.driver_available && (
            <Typography sx={{ fontSize: TYPO.tiny, color: textMuted }}>
              Already fitted? Install reachy_mini[nfc] on the robot.
            </Typography>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
      <SectionHeader
        title="NFC Reader"
        icon={NfcIcon}
        darkMode={palette.isDark}
        action={
          <Tooltip
            title={canToggle ? '' : 'This daemon version cannot switch the reader off'}
            placement="left"
          >
            {/* A disabled Switch fires no events: the span carries the tooltip. */}
            <span>
              <Switch
                checked={state !== 'disabled'}
                onChange={e => onToggle(e.target.checked)}
                disabled={!canToggle || isToggling || busy}
                size="small"
                color="primary"
                inputProps={{ 'aria-label': 'NFC reader on' }}
              />
            </span>
          </Tooltip>
        }
      />

      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography
          sx={{ fontSize: TYPO.md, fontWeight: FONT_WEIGHT.semibold, color: textPrimary, mb: 0.5 }}
        >
          {readerTitle(status)}
        </Typography>
        {detail && <Typography sx={{ fontSize: TYPO.sm, color: textMuted }}>{detail}</Typography>}
        {toggleError && (
          <Typography sx={{ fontSize: TYPO.xs, color: STATUS.error, mt: 0.5 }}>
            {toggleError}
          </Typography>
        )}
      </Box>

      <Box
        sx={{
          minHeight: 120,
          p: 1.5,
          borderRadius: RADIUS.lg,
          bgcolor: palette.surfaceSubtle,
          border: `1px solid ${palette.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: NFC_STATE_COLOR[state],
            }}
          />
          <Typography sx={{ ...labelSx, lineHeight: 1 }}>
            {tag?.present ? 'Tag' : 'No tag'}
          </Typography>
          {tag?.present && tag.model && (
            <Typography sx={{ fontSize: TYPO.xs, color: textSecondary, ml: 'auto' }}>
              {tag.model}
              {tag.capacity != null && ` · ${tag.capacity} bytes`}
            </Typography>
          )}
        </Box>

        {!tag?.present ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: TYPO.sm, color: textMuted, textAlign: 'center' }}>
              {state === 'disabled'
                ? 'Reader is off'
                : state === 'connecting' || state === 'not_responding'
                  ? 'Waiting for the reader…'
                  : state === 'unavailable'
                    ? 'No reader to read from'
                    : 'Place a tag on the reader'}
            </Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{ ...labelSx, minWidth: 56 }}>UID</Typography>
              <Typography sx={monoSx}>{tag.uid ?? '—'}</Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{ ...labelSx, minWidth: 56 }}>Content</Typography>
              <Box
                sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
              >
                {tag.blank ? (
                  <Typography sx={{ fontSize: TYPO.sm, color: textMuted }}>Blank tag</Typography>
                ) : records.length > 0 ? (
                  records.map((record, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                      <Typography
                        sx={{
                          fontSize: TYPO.micro,
                          fontWeight: FONT_WEIGHT.semibold,
                          color: textMuted,
                          textTransform: 'uppercase',
                          px: 0.5,
                          borderRadius: RADIUS.xs,
                          border: `1px solid ${palette.border}`,
                          flexShrink: 0,
                        }}
                      >
                        {record.kind}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: TYPO.sm,
                          color: textPrimary,
                          wordBreak: 'break-all',
                        }}
                      >
                        {recordValue(record)}
                      </Typography>
                    </Box>
                  ))
                ) : tag.raw_hex ? (
                  <Typography sx={{ ...monoSx, wordBreak: 'break-all' }}>
                    {tag.raw_hex}
                    {isRawPreviewTruncated(tag.raw_hex) && '…'}
                  </Typography>
                ) : (
                  <Typography sx={{ fontSize: TYPO.sm, color: STATUS.warning }}>
                    {tag.error ?? 'Content could not be read'}
                  </Typography>
                )}
              </Box>
            </Box>

            {result?.success && (
              <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CheckIcon sx={{ fontSize: TYPO.sm, color: textMuted }} />
                <Typography sx={{ fontSize: TYPO.xs, color: textMuted }}>
                  {writeResult ? 'Tag written' : 'Tag erased'}
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {editing ? (
          <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="label" htmlFor="nfc-tag-content" sx={labelSx}>
              Tag content
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={writeKind}
                onChange={(_, kind: WriteKind | null) => kind && setWriteKind(kind)}
                sx={{
                  flexShrink: 0,
                  // Same height as a small TextField.
                  height: 40,
                  '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25 },
                }}
              >
                <ToggleButton value="text">Text</ToggleButton>
                <ToggleButton value="uri">Link</ToggleButton>
              </ToggleButtonGroup>
              <TextField
                id="nfc-tag-content"
                autoFocus
                fullWidth
                size="small"
                multiline={writeKind === 'text'}
                maxRows={4}
                placeholder={writeKind === 'uri' ? 'https://…' : 'Content to write'}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditing(false);
                  }
                  if (e.key === 'Enter' && !e.shiftKey && canSubmit) {
                    e.preventDefault();
                    submitWrite();
                  }
                }}
                inputProps={{ maxLength: MAX_WRITE_CHARS }}
              />
            </Box>
            {capacity !== null && (
              <Typography
                sx={{
                  fontSize: TYPO.tiny,
                  color: tooLong ? STATUS.error : textMuted,
                  textAlign: 'right',
                }}
              >
                {tooLong && 'Too long for this tag · '}
                {writeBytes} / {capacity} bytes
              </Typography>
            )}
            {records.length > 1 && (
              <Typography sx={{ fontSize: TYPO.tiny, color: textMuted, textAlign: 'center' }}>
                Replaces all {records.length} records on the tag.
              </Typography>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
              <Button
                size="small"
                onClick={() => setEditing(false)}
                sx={{ textTransform: 'none', color: textSecondary }}
              >
                Cancel
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={!canSubmit}
                onClick={submitWrite}
                sx={{ textTransform: 'none' }}
              >
                Write
              </Button>
            </Box>
          </Box>
        ) : confirming ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: TYPO.sm, color: textSecondary }}>
              {fullErase ? 'Wipe the whole tag memory?' : 'Erase this tag?'}
            </Typography>
            <Button
              size="small"
              onClick={() => setConfirming(false)}
              sx={{ textTransform: 'none', color: textSecondary }}
            >
              Cancel
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => {
                setConfirming(false);
                onErase(fullErase);
              }}
              sx={{ textTransform: 'none' }}
            >
              Erase
            </Button>
          </Box>
        ) : state === 'tag' || busy ? (
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={startEditing}
              startIcon={isWriting ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minWidth: 140 }}
            >
              {isWriting ? 'Writing…' : 'Modify content'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              disabled={busy}
              onClick={() => {
                onClearResults();
                setConfirming(true);
              }}
              startIcon={isErasing ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={{ textTransform: 'none', minWidth: 140 }}
            >
              {isErasing ? 'Erasing…' : fullErase ? 'Wipe tag' : 'Erase tag'}
            </Button>
          </Box>
        ) : null}

        {fullErase && !result && !editing && (
          <Typography sx={{ fontSize: TYPO.tiny, color: textMuted, textAlign: 'center' }}>
            Not an NDEF tag: the whole memory is wiped, which takes a few seconds.
          </Typography>
        )}

        {result && !result.success && (
          <Typography sx={{ fontSize: TYPO.sm, color: STATUS.error, textAlign: 'center' }}>
            {describeTagError(result.error)}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
