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
import { NFC_STATE_COLOR } from './NfcStatusButton';
import {
  describeTagError,
  needsFullErase,
  type NfcRecord,
  type NfcState,
  type NfcStatus,
  type NfcTag,
  type NfcTagResult,
  type NfcWriteContent,
} from './nfcState';

/** Same page as the conversation app's "Get the NFC add-on". */
const ADD_ON_STORE_URL = 'https://store.pollen-robotics.com/collections/reachy-mini';

/** The daemon refuses more than this; the tag's own capacity is smaller still. */
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

// A reader the daemon cannot find gets its own card (see `absent`), so these
// only cover the daemon not answering, the switch off, and a live reader.
function readerTitle(status: NfcStatus | null): string {
  if (!status) return 'Unknown';
  if (status.enabled === false) return 'Reader switched off';
  return 'Reader connected';
}

/** Null when the title says it all. */
function readerDetail(status: NfcStatus | null, fetchError: string | null): string | null {
  if (!status) return fetchError ?? 'Waiting for the daemon…';
  if (status.enabled === false) return 'Turn it on to read tags';
  if (status.connected && status.board_version) return `Board version ${status.board_version}`;
  return null;
}

function recordValue(record: NfcRecord): string {
  return record.value ?? [record.type_name, record.data_hex].filter(Boolean).join(' ');
}

/** What the editor opens on: the tag's first text or URI record, if any. */
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

  // A result, a pending confirmation or an open editor belongs to the tag it
  // was about.
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

  const submitWrite = (): void => {
    setEditing(false);
    onWrite(writeKind === 'uri' ? { uri: draft.trim() } : { text: draft });
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

  // The daemon answers but finds no board: most robots have no add-on, so
  // present it rather than a reader with nothing to do. A reader switched off
  // keeps the full card, since its switch is the way back on.
  const absent = status !== null && !status.connected && status.enabled !== false;

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
                disabled={!canToggle || isToggling || isErasing}
                size="small"
                color="primary"
                inputProps={{ 'aria-label': 'NFC reader on' }}
              />
            </span>
          </Tooltip>
        }
      />

      {/* Reader module */}
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

      {/* Tag */}
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
          {/* lineHeight 1: the caps then sit in the middle of the line box,
              level with the dot. */}
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
                  <Typography sx={{ ...monoSx, wordBreak: 'break-all' }}>{tag.raw_hex}…</Typography>
                ) : (
                  <Typography sx={{ fontSize: TYPO.sm, color: STATUS.warning }}>
                    {tag.error ?? 'Content could not be read'}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Pushed to the bottom of the box: a quiet acknowledgement, the
                content above already shows what changed. */}
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

      {/* Actions */}
      <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {editing ? (
          <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography component="label" htmlFor="nfc-tag-content" sx={labelSx}>
              Tag content
            </Typography>
            {/* Top-aligned: a multiline field grows downwards, the toggle stays
                level with its first line. */}
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
                  if (e.key === 'Escape') setEditing(false);
                  if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
                    e.preventDefault();
                    submitWrite();
                  }
                }}
                inputProps={{ maxLength: MAX_WRITE_CHARS }}
              />
            </Box>
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
                disabled={!draft.trim()}
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
          // No tag, or the reader off: nothing to modify or erase.
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
