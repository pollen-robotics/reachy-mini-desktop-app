import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Box, Typography, Button, ButtonGroup, CircularProgress, Select, MenuItem, FormControl, InputLabel, LinearProgress, useTheme } from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import Viewer3D from './viewer3d';
import { EmojiPicker } from '@components/emoji-grid';
import { mapMeshToScanPart } from '../utils/scanParts';
import { HARDWARE_ERROR_CONFIGS, getErrorMeshes } from '../utils/hardwareErrors';
import useAppStore from '../store/useAppStore';

/**
 * Development page to test RobotViewer3D in isolation
 * Automatic access via http://localhost:5173/#dev
 */
export default function DevPlayground() {
  const { darkMode } = useAppStore();
  const theme = useTheme();
  const [scanState, setScanState] = useState('idle'); // 'idle' | 'scanning' | 'complete' | 'error'
  const [errorType, setErrorType] = useState('none'); // 'none' | 'camera' | 'no_motors' | 'motor_communication'
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [currentPart, setCurrentPart] = useState(null);
  const [scanComplete, setScanComplete] = useState(false);
  const [allMeshes, setAllMeshes] = useState([]);
  const [errorMesh, setErrorMesh] = useState(null);
  const robotRefRef = useRef(null);
  const scanKeyRef = useRef(0); // Force re-render of scan effect
  const [activeTab, setActiveTab] = useState('emotions');
  
  // Sample actions for the wheel
  const sampleActions = useMemo(() => {
    const emotions = [
      { id: 'happy', label: 'Happy', emoji: '😊', originalAction: { type: 'emotion', name: 'happy' } },
      { id: 'sad', label: 'Sad', emoji: '😢', originalAction: { type: 'emotion', name: 'sad' } },
      { id: 'angry', label: 'Angry', emoji: '😠', originalAction: { type: 'emotion', name: 'angry' } },
      { id: 'surprised', label: 'Surprised', emoji: '😲', originalAction: { type: 'emotion', name: 'surprised' } },
      { id: 'excited', label: 'Excited', emoji: '🤩', originalAction: { type: 'emotion', name: 'excited' } },
      { id: 'calm', label: 'Calm', emoji: '😌', originalAction: { type: 'emotion', name: 'calm' } },
      { id: 'confused', label: 'Confused', emoji: '😕', originalAction: { type: 'emotion', name: 'confused' } },
      { id: 'love', label: 'Love', emoji: '🥰', originalAction: { type: 'emotion', name: 'love' } },
    ];
    
    const dances = [
      { id: 'wave', label: 'Wave', emoji: '👋', originalAction: { type: 'dance', name: 'wave' } },
      { id: 'spin', label: 'Spin', emoji: '🌀', originalAction: { type: 'dance', name: 'spin' } },
      { id: 'dance1', label: 'Dance 1', emoji: '💃', originalAction: { type: 'dance', name: 'dance1' } },
      { id: 'dance2', label: 'Dance 2', emoji: '🕺', originalAction: { type: 'dance', name: 'dance2' } },
      { id: 'bow', label: 'Bow', emoji: '🙇', originalAction: { type: 'dance', name: 'bow' } },
      { id: 'jump', label: 'Jump', emoji: '🦘', originalAction: { type: 'dance', name: 'jump' } },
    ];
    
    return { emotions, dances };
  }, []);
  
  const handleActionClick = useCallback((action) => {
    
  }, []);

  // Get error configuration
  const errorConfig = useMemo(() => {
    if (errorType === 'none') return null;
    
    // Map error types to config keys
    const errorKeyMap = {
      'camera': 'CAMERA_ERROR',
      'no_motors': 'NO_MOTORS',
      'motor_communication': 'MOTOR_COMMUNICATION',
    };
    
    const configKey = errorKeyMap[errorType];
    return configKey ? HARDWARE_ERROR_CONFIGS[configKey] : null;
  }, [errorType]);

  // Find error meshes
  React.useEffect(() => {
    if (!errorConfig || !allMeshes.length || scanState !== 'error') {
      setErrorMesh(null);
      return;
    }
    
    const meshes = getErrorMeshes(errorConfig, robotRefRef.current, allMeshes);
    if (meshes && meshes.length > 0) {
      setErrorMesh(meshes[0]);
    } else {
      setErrorMesh(null);
    }
  }, [errorConfig, allMeshes, scanState]);

  const handleMeshesReady = useCallback((meshes) => {
    setAllMeshes(meshes);
  }, []);

  const handleScanMesh = useCallback((mesh, index, total) => {
    // Map mesh to actual scan part based on mesh characteristics
    const partInfo = mapMeshToScanPart(mesh);
    
    if (partInfo) {
      setCurrentPart(partInfo);
    }
    
    // Update progress based on actual mesh count
    setScanProgress({ current: index, total });
  }, []);

  const handleScanComplete = useCallback(() => {
    setScanProgress(prev => ({ ...prev, current: prev.total }));
    setCurrentPart(null);
    setScanComplete(true);
    setScanState('complete');
  }, []);

  const handleStartScan = useCallback(() => {
    setScanState('scanning');
    setScanComplete(false);
    setScanProgress({ current: 0, total: 0 });
    setCurrentPart(null);
    setErrorMesh(null);
    scanKeyRef.current += 1; // Force re-render
  }, []);

  const handleReset = useCallback(() => {
    setScanState('idle');
    setScanComplete(false);
    setScanProgress({ current: 0, total: 0 });
    setCurrentPart(null);
    setErrorMesh(null);
    setErrorType('none');
    scanKeyRef.current += 1;
  }, []);

  const handleSetError = useCallback((type) => {
    setErrorType(type);
    setScanState('error');
    setScanComplete(false);
    setScanProgress({ current: 0, total: 0 });
    setCurrentPart(null);
    scanKeyRef.current += 1;
  }, []);

  const showScanEffect = scanState === 'scanning' && errorType === 'none';
  const startupError = scanState === 'error' && errorConfig ? {
    type: errorConfig.type,
    message: errorConfig.message.text 
      ? `${errorConfig.message.text} ${errorConfig.message.bold} ${errorConfig.message.suffix}`
      : 'Hardware error detected',
    messageParts: errorConfig.message,
    code: errorConfig.code || null,
  } : null;

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
      
      {/* Emoji Picker Section */}
      <Box sx={{ 
        width: '500px',
        maxHeight: '400px',
        border: '2px solid #FF9500',
        borderRadius: 2,
        overflow: 'auto',
        mb: 2,
        p: 2,
      }}>
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
        {/* Normal view */}
        <Box sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}>
          <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
            Normal (MeshStandardMaterial)
          </Typography>
          <Box sx={{ 
            flex: 1,
            border: '2px solid #1976d2',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <Viewer3D 
              isActive={true}
              initialMode="normal"
              forceLoad={true}
              hideControls={false}
            />
          </Box>
        </Box>

        {/* Scan view */}
        <Box sx={{ 
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}>
          <Typography variant="subtitle2" sx={{ textAlign: 'center' }}>
            Scan Mode (X-Ray + Scan Effect)
          </Typography>
          
          {/* Controls */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 1,
            p: 1,
            bgcolor: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
            borderRadius: 1,
          }}>
            <ButtonGroup size="small" variant="outlined" fullWidth>
              <Button 
                onClick={handleStartScan}
                disabled={scanState === 'scanning'}
              >
                Start Scan
              </Button>
              <Button 
                onClick={handleReset}
              >
                Reset
              </Button>
            </ButtonGroup>
            
            <FormControl size="small" fullWidth>
              <InputLabel>Error Type</InputLabel>
              <Select
                value={errorType}
                label="Error Type"
                onChange={(e) => {
                  if (e.target.value === 'none') {
                    handleReset();
                  } else {
                    handleSetError(e.target.value);
                  }
                }}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="camera">Camera Error</MenuItem>
                <MenuItem value="no_motors">No Motors</MenuItem>
                <MenuItem value="motor_communication">Motor Communication</MenuItem>
              </Select>
            </FormControl>

            {/* Scan status - matching HardwareScanView */}
            {scanState !== 'idle' && (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center', 
                gap: 1,
                justifyContent: 'center',
                py: 0.5,
                width: '100%',
              }}>
                {startupError ? (
                  // Error display - matching HardwareScanView
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center', 
                    gap: 1,
                    width: '100%',
                    p: 2,
                    bgcolor: darkMode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.05)',
                    borderRadius: 2,
                  }}>
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
                          <Box component="span" sx={{ fontWeight: 700 }}>{startupError.messageParts.bold}</Box>
                          {startupError.messageParts.suffix && ` ${startupError.messageParts.suffix}`}
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
                  // Normal scan display
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
                      <Box sx={{ margin: "auto", width: '100%', maxWidth: '300px' }}>
                        <LinearProgress 
                          variant="determinate"
                          value={scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}
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

          <Box sx={{ 
            flex: 1,
            border: '2px solid #16a34a',
            borderRadius: 2,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <Viewer3D 
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



