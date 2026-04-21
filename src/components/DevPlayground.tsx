import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  ButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  LinearProgress,
  useTheme,
  type SelectChangeEvent,
} from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import Viewer3D from './viewer3d';
import { EmojiPicker } from '@components/emoji-grid';
import { mapMeshToScanPart, type ScanMesh, type ScanPartMatch } from '../utils/scanParts';
import {
  HARDWARE_ERROR_CONFIGS,
  getErrorMeshes,
  type HardwareErrorConfig,
  type MeshLike,
} from '../utils/hardwareErrors';
import useAppStore from '../store/useAppStore';

type ScanState = 'idle' | 'scanning' | 'complete' | 'error';
type ErrorType = 'none' | 'camera' | 'no_motors' | 'motor_communication';

interface ScanProgress {
  current: number;
  total: number;
}

interface SampleAction {
  // `name` matches the `NamedItem` shape expected by `EmojiPicker`.
  name: string;
  id: string;
  label: string;
  emoji: string;
  originalAction: { type: 'emotion' | 'dance'; name: string };
}

interface StartupErrorDisplay {
  type: string;
  message: string;
  messageParts: HardwareErrorConfig['message'];
  code: string | null;
}

/**
 * Development page to test RobotViewer3D in isolation
 * Automatic access via http://localhost:5173/#dev
 */
export default function DevPlayground(): React.ReactElement {
  const { darkMode } = useAppStore();
  const theme = useTheme();
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [errorType, setErrorType] = useState<ErrorType>('none');
  const [scanProgress, setScanProgress] = useState<ScanProgress>({ current: 0, total: 0 });
  const [currentPart, setCurrentPart] = useState<ScanPartMatch | null>(null);
  const [scanComplete, setScanComplete] = useState<boolean>(false);
  const [allMeshes, setAllMeshes] = useState<MeshLike[]>([]);
  const [errorMesh, setErrorMesh] = useState<MeshLike | null>(null);
  const robotRefRef = useRef<unknown>(null);
  const scanKeyRef = useRef<number>(0);

  const sampleActions = useMemo<{ emotions: SampleAction[]; dances: SampleAction[] }>(() => {
    const makeEmotion = (id: string, label: string, emoji: string): SampleAction => ({
      name: id,
      id,
      label,
      emoji,
      originalAction: { type: 'emotion', name: id },
    });
    const makeDance = (id: string, label: string, emoji: string): SampleAction => ({
      name: id,
      id,
      label,
      emoji,
      originalAction: { type: 'dance', name: id },
    });

    const emotions: SampleAction[] = [
      makeEmotion('happy', 'Happy', '😊'),
      makeEmotion('sad', 'Sad', '😢'),
      makeEmotion('angry', 'Angry', '😠'),
      makeEmotion('surprised', 'Surprised', '😲'),
      makeEmotion('excited', 'Excited', '🤩'),
      makeEmotion('calm', 'Calm', '😌'),
      makeEmotion('confused', 'Confused', '😕'),
      makeEmotion('love', 'Love', '🥰'),
    ];

    const dances: SampleAction[] = [
      makeDance('wave', 'Wave', '👋'),
      makeDance('spin', 'Spin', '🌀'),
      makeDance('dance1', 'Dance 1', '💃'),
      makeDance('dance2', 'Dance 2', '🕺'),
      makeDance('bow', 'Bow', '🙇'),
      makeDance('jump', 'Jump', '🦘'),
    ];

    return { emotions, dances };
  }, []);

  const handleActionClick = useCallback((_action: unknown): void => {}, []);

  const errorConfig = useMemo<HardwareErrorConfig | null>(() => {
    if (errorType === 'none') return null;

    const errorKeyMap: Record<Exclude<ErrorType, 'none'>, keyof typeof HARDWARE_ERROR_CONFIGS> = {
      camera: 'CAMERA_ERROR',
      no_motors: 'NO_MOTORS',
      motor_communication: 'MOTOR_COMMUNICATION',
    };

    const configKey = errorKeyMap[errorType];
    return configKey ? HARDWARE_ERROR_CONFIGS[configKey] : null;
  }, [errorType]);

  React.useEffect(() => {
    if (!errorConfig || !allMeshes.length || scanState !== 'error') {
      setErrorMesh(null);
      return;
    }

    const meshes = getErrorMeshes(
      errorConfig,
      robotRefRef.current as Parameters<typeof getErrorMeshes>[1],
      allMeshes
    );
    if (meshes && meshes.length > 0) {
      setErrorMesh(meshes[0]);
    } else {
      setErrorMesh(null);
    }
  }, [errorConfig, allMeshes, scanState]);

  const handleMeshesReady = useCallback((meshes: MeshLike[]): void => {
    setAllMeshes(meshes);
  }, []);

  const handleScanMesh = useCallback((mesh: ScanMesh, index: number, total: number): void => {
    const partInfo = mapMeshToScanPart(mesh);

    if (partInfo) {
      setCurrentPart(partInfo);
    }

    setScanProgress({ current: index, total });
  }, []);

  const handleScanComplete = useCallback((): void => {
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentPart(null);
    setScanComplete(true);
    setScanState('complete');
  }, []);

  const handleStartScan = useCallback((): void => {
    setScanState('scanning');
    setScanComplete(false);
    setScanProgress({ current: 0, total: 0 });
    setCurrentPart(null);
    setErrorMesh(null);
    scanKeyRef.current += 1;
  }, []);

  const handleReset = useCallback((): void => {
    setScanState('idle');
    setScanComplete(false);
    setScanProgress({ current: 0, total: 0 });
    setCurrentPart(null);
    setErrorMesh(null);
    setErrorType('none');
    scanKeyRef.current += 1;
  }, []);

  const handleSetError = useCallback((type: ErrorType): void => {
    setErrorType(type);
    setScanState('error');
    setScanComplete(false);
    setScanProgress({ current: 0, total: 0 });
    setCurrentPart(null);
    scanKeyRef.current += 1;
  }, []);

  const showScanEffect = scanState === 'scanning' && errorType === 'none';
  const startupError = useMemo<StartupErrorDisplay | null>(() => {
    if (scanState !== 'error' || !errorConfig) return null;
    return {
      type: errorConfig.type,
      message: errorConfig.message.text
        ? `${errorConfig.message.text} ${errorConfig.message.bold} ${errorConfig.message.suffix}`
        : 'Hardware error detected',
      messageParts: errorConfig.message,
      code: errorConfig.code || null,
    };
  }, [scanState, errorConfig]);

  // TODO(ts): Viewer3D is JS-typed and accepts a permissive props bag; cast
  // through ComponentType to keep this dev playground compiling without a
  // strict prop interface.
  const Viewer3DAny = Viewer3D as unknown as React.ComponentType<Record<string, unknown>>;

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        p: 2,
      }}
    >
      <Typography variant="h6" sx={{ mb: 1 }}>
        Dev Playground - Normal vs Scan Mode
      </Typography>

      <Box
        sx={{
          width: '500px',
          maxHeight: '400px',
          border: '2px solid #FF9500',
          borderRadius: 2,
          overflow: 'auto',
          mb: 2,
          p: 2,
        }}
      >
        <EmojiPicker
          emotions={sampleActions.emotions}
          dances={sampleActions.dances}
          onAction={handleActionClick}
          darkMode={darkMode}
          disabled={false}
        />
      </Box>

      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          gap: 2,
          alignItems: 'stretch',
        }}
      >
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
            Normal (MeshStandardMaterial)
          </Typography>
          <Box
            sx={{
              flex: 1,
              border: '2px solid #1976d2',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <Viewer3DAny
              isActive={true}
              initialMode="normal"
              forceLoad={true}
              hideControls={false}
            />
          </Box>
        </Box>

        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
          }}
        >
          <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
            Scan Mode (X-Ray + Scan Effect)
          </Typography>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              p: 1,
              bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
              borderRadius: 1,
            }}
          >
            <ButtonGroup size="small" variant="outlined" fullWidth>
              <Button onClick={handleStartScan} disabled={scanState === 'scanning'}>
                Start Scan
              </Button>
              <Button onClick={handleReset}>Reset</Button>
            </ButtonGroup>

            <FormControl size="small" fullWidth>
              <InputLabel>Error Type</InputLabel>
              <Select
                value={errorType}
                label="Error Type"
                onChange={(e: SelectChangeEvent<ErrorType>) => {
                  const value = e.target.value as ErrorType;
                  if (value === 'none') {
                    handleReset();
                  } else {
                    handleSetError(value);
                  }
                }}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="camera">Camera Error</MenuItem>
                <MenuItem value="no_motors">No Motors</MenuItem>
                <MenuItem value="motor_communication">Motor Communication</MenuItem>
              </Select>
            </FormControl>

            {scanState !== 'idle' && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  justifyContent: 'center',
                  py: 0.5,
                  width: '100%',
                }}
              >
                {startupError ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 1,
                      width: '100%',
                      p: 2,
                      bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                      borderRadius: 2,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 16,
                        fontWeight: 900,
                        color: '#ef4444',
                        letterSpacing: '0.3px',
                        textAlign: 'center',
                      }}
                    >
                      {startupError.messageParts ? (
                        <>
                          {startupError.messageParts.text && `${startupError.messageParts.text} `}
                          <Box component="span" sx={{ fontWeight: 700 }}>
                            {startupError.messageParts.bold}
                          </Box>
                          {startupError.messageParts.suffix &&
                            ` ${startupError.messageParts.suffix}`}
                        </>
                      ) : startupError.message ? (
                        startupError.message
                      ) : (
                        'Hardware error detected'
                      )}
                    </Typography>
                    {startupError.code && (
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: darkMode ? 'rgba(239, 68, 68, 0.7)' : '#dc2626',
                          fontFamily: 'monospace',
                        }}
                      >
                        {startupError.code}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {scanComplete && (
                        <CheckCircleOutlinedIcon
                          sx={{
                            fontSize: 18,
                            color: '#16a34a',
                          }}
                        />
                      )}
                      <Typography
                        sx={{
                          fontSize: 16,
                          fontWeight: 900,
                          color: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.85)',
                          letterSpacing: '0.3px',
                        }}
                      >
                        {scanComplete ? 'Scan complete' : 'Scanning hardware'}
                      </Typography>
                    </Box>
                    {!scanComplete && scanProgress.total > 0 && (
                      <Box sx={{ margin: 'auto', width: '100%', maxWidth: '300px' }}>
                        <LinearProgress
                          variant="determinate"
                          value={
                            scanProgress.total > 0
                              ? (scanProgress.current / scanProgress.total) * 100
                              : 0
                          }
                          sx={{
                            height: 4,
                            borderRadius: 2,
                            backgroundColor: darkMode
                              ? `${theme.palette.primary.main}33`
                              : `${theme.palette.primary.main}1A`,
                            '& .MuiLinearProgress-bar': {
                              backgroundColor: theme.palette.primary.main,
                              borderRadius: 2,
                            },
                          }}
                        />
                        <Typography
                          sx={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: darkMode ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.65)',
                            opacity: 1,
                            textAlign: 'center',
                            mt: 1,
                            letterSpacing: '0.2px',
                            minHeight: '16px',
                            display: 'block',
                          }}
                        >
                          {currentPart ? currentPart.part : 'Initializing scan...'}
                        </Typography>
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}
          </Box>

          <Box
            sx={{
              flex: 1,
              border: '2px solid #16a34a',
              borderRadius: 2,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Viewer3DAny
              key={`scan-${scanKeyRef.current}`}
              isActive={false}
              antennas={[-10, -10]}
              headPose={null}
              headJoints={null}
              yawBody={null}
              initialMode="xray"
              hideControls={true}
              forceLoad={true}
              hideGrid={true}
              hideBorder={true}
              showScanEffect={showScanEffect}
              usePremiumScan={false}
              onScanComplete={handleScanComplete}
              onScanMesh={handleScanMesh}
              onMeshesReady={handleMeshesReady}
              cameraPreset={errorConfig?.cameraPreset || 'scan'}
              useCinematicCamera={true}
              errorFocusMesh={errorMesh}
              backgroundColor="transparent"
              canvasScale={0.9}
              canvasTranslateX="5%"
              canvasTranslateY="10%"
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
