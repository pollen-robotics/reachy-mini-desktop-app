import React from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useActiveRobotContext } from '../../context';
import FullscreenOverlay from '@components/FullscreenOverlay';
import HowToCreateApp from '@assets/reachy-how-to-create-app.svg';
import JoystickIcon from '@assets/joystick.svg';
import BlueprintIcon from '@assets/blueprint.svg';
import RocketIcon from '@assets/rocket.svg';
import { getBaseUrl } from '../../../../config/daemon';

/**
 * Modal overlay for tutorial on creating your own Reachy Mini app
 * Design style Apple with grid cards
 * Uses ActiveRobotContext for decoupling from Tauri
 */
export default function CreateAppTutorialModal({
  open: isOpen,
  onClose,
  darkMode,
}) {
  const { shellApi } = useActiveRobotContext();
  const open = shellApi.open;
  const tutorials = [
    {
      id: 'console',
      icon: JoystickIcon,
      title: 'Get familiar with the robot',
      description: 'Use the daemon API via console commands',
      url: 'https://github.com/pollen-robotics/reachy_mini/blob/main/docs/rest-api.md',
    },
    {
      id: 'create',
      icon: BlueprintIcon,
      title: 'Create your own app',
      description: 'Build your app with the Python SDK',
      url: 'https://github.com/pollen-robotics/reachy_mini/blob/main/docs/python-sdk.md',
    },
    {
      id: 'deploy',
      icon: RocketIcon,
      title: 'Deploy',
      description: 'Share your app on Hugging Face Spaces',
      url: 'https://huggingface.co/blog/pollen-robotics/make-and-publish-your-reachy-mini-apps',
    },
  ];

  const handleTutorialClick = async (url) => {
    try {
      await open(url);
    } catch (err) {
      console.error('Failed to open tutorial URL:', err);
    }
  };

  return (
    <FullscreenOverlay
      open={isOpen}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10003}
      centeredX={true}
      centeredY={false}
    >
      <Box
        sx={{
          position: 'relative',
          width: '90%',
          maxWidth: '700px',
          display: 'flex',
          flexDirection: 'column',
          mt: 8,
          mb: 4,
        }}
      >
        {/* Close button - top right */}
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            color: '#FF9500',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
            border: '1px solid #FF9500',
            opacity: 0.7,
            '&:hover': {
              opacity: 1,
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
            },
            zIndex: 1,
          }}
        >
          <CloseIcon sx={{ fontSize: 20 }} />
        </IconButton>

        {/* Header */}
        <Box sx={{ mb: 6, textAlign: 'center' }}>
              <Box
                component="img"
            src={HowToCreateApp}
            alt="How to create app"
                sx={{
              width: 200,
                  height: 'auto',
              mb: 3,
              opacity: darkMode ? 0.9 : 1,
            }}
          />
          <Typography
            sx={{
              fontSize: 40,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#1a1a1a',
              letterSpacing: '-0.8px',
              lineHeight: 1.1,
              mb: 1.5,
            }}
          >
            Build your own application
          </Typography>
          <Typography
            sx={{
              fontSize: 16,
              color: darkMode ? '#aaa' : '#666',
              fontWeight: 400,
              lineHeight: 1.6,
              maxWidth: '600px',
              mx: 'auto',
            }}
          >
            Create interactive apps for <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ccc' : '#555' }}>Reachy Mini</Box> using the <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ccc' : '#555' }}>Python SDK</Box>. Deploy on <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ccc' : '#555' }}>Hugging Face Spaces</Box> and share with the <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ccc' : '#555' }}>community</Box>.
          </Typography>
        </Box>

        {/* Tutorials layout */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            mb: 6,
            maxWidth: '1400px',
            mx: 'auto',
            width: '100%',
            borderRadius: '20px',
            border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.18)'}`,
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
            overflow: 'hidden',
          }}
        >
          {tutorials.map((tutorial, index) => (
            <Box
              key={tutorial.id}
              onClick={() => handleTutorialClick(tutorial.url)}
              sx={{
                px: 3,
                py: 2.5,
                minHeight: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                width: '100%',
                cursor: 'pointer',
                bgcolor: 'transparent',
                transition: 'background-color 0.2s ease',
                borderBottom: index < tutorials.length - 1
                  ? `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`
                  : 'none',
                '&:hover': {
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
                },
              }}
            >
              <Box
                component="img"
                src={tutorial.icon}
                alt={tutorial.title}
                sx={{
                  width: 64,
                  height: 64,
                  flexShrink: 0,
                  objectFit: 'contain',
                }}
              />
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: darkMode ? '#f5f5f5' : '#1a1a1a',
                    letterSpacing: '-0.4px',
                    mb: 0.5,
                  }}
                >
                  {tutorial.title}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: darkMode ? '#aaa' : '#666',
                  }}
                >
                  {tutorial.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Footer note */}
        <Box
          sx={{
            textAlign: 'center',
            pt: 3,
            mb: 6,
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: darkMode ? '#888' : '#999',
              lineHeight: 1.6,
            }}
          >
            Need help? Check out the{' '}
            <Box
              component="span"
              onClick={async () => {
                try {
                  await open(`${getBaseUrl()}/docs`);
                } catch (err) {
                  console.error('Failed to open API docs:', err);
                }
              }}
              sx={{
                color: '#FF9500',
                cursor: 'pointer',
                textDecoration: 'underline',
                '&:hover': {
                  opacity: 0.8,
                },
              }}
            >
              API documentation
            </Box>
            {' '}or browse{' '}
            <Box
              component="span"
              onClick={async () => {
                try {
                  await open('https://huggingface.co/spaces?q=reachy_mini');
                } catch (err) {
                  console.error('Failed to open spaces:', err);
                }
              }}
              sx={{
                color: '#FF9500',
                cursor: 'pointer',
                textDecoration: 'underline',
                '&:hover': {
                  opacity: 0.8,
                },
              }}
            >
              existing apps
            </Box>
            {' '}for inspiration.
          </Typography>
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}

