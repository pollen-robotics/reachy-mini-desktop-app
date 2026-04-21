import { Box, CircularProgress, Typography } from '@mui/material';
import reachySetupSvg from '../../../assets/reachy-how-to-create-app.svg';
import TipsCarousel from './TipsCarousel';

export interface BootstrapOverlayProps {
  darkMode: boolean;
  /**
   * `null` = we haven't decided yet (briefly shows a lightweight spinner),
   * `true` = we're actively bootstrapping (shows the friendly explainer),
   * `false` should never reach this component (caller should render the scan instead).
   */
  isBootstrapping: boolean | null;
  /** Humanized label produced by `useBootstrapDetection`. */
  bootstrapMessage: string;
}

/**
 * Full-bleed overlay shown while the daemon is going through its first-run
 * Python environment setup. We deliberately swap the 3D viewer for a static
 * illustration here: bootstrap is slow and GPU-heavy, so rendering the URDF
 * on top of it would hurt without any benefit.
 */
export default function BootstrapOverlay({
  darkMode,
  isBootstrapping,
  bootstrapMessage,
}: BootstrapOverlayProps): React.ReactElement {
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: '300px',
        height: '320px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <Box
        component="img"
        src={reachySetupSvg}
        alt="Reachy Mini setting up"
        sx={{
          width: 140,
          height: 'auto',
          opacity: darkMode ? 0.9 : 1,
          mb: 1,
        }}
      />
      {isBootstrapping === true ? (
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            sx={{
              fontSize: 18,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              mb: 0.5,
              letterSpacing: '-0.3px',
            }}
          >
            {bootstrapMessage || 'Preparing environment...'}
          </Typography>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 400,
              color: darkMode ? '#999' : '#666',
              mb: 0.5,
            }}
          >
            Grab a coffee, this will take a few minutes.
          </Typography>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 400,
              color: darkMode ? '#555' : '#aaa',
              fontStyle: 'italic',
            }}
          >
            This only happens once
          </Typography>
          <TipsCarousel darkMode={darkMode} interval={5000} />
        </Box>
      ) : (
        <CircularProgress size={24} thickness={3} sx={{ color: darkMode ? '#555' : '#bbb' }} />
      )}
    </Box>
  );
}
