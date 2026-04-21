import React from 'react';
import { Box, Typography } from '@mui/material';
import { useActiveRobotContext } from '../../context';
// TODO(ts): FullscreenOverlay is a .jsx file whose JSDoc produces a bogus
// `IntrinsicAttributes & boolean` prop type when imported by .tsx files.
// Cast to a permissive component type until FullscreenOverlay is migrated.
import FullscreenOverlayRaw from '@components/FullscreenOverlay';
const FullscreenOverlay = FullscreenOverlayRaw as unknown as React.ComponentType<
  Record<string, unknown> & { children?: React.ReactNode }
>;
import HowToCreateApp from '@assets/reachy-how-to-create-app.svg';
import ExploratorIcon from '@assets/exporator.svg';
import AstronautIcon from '@assets/astronaut.svg';

interface CreateAppTutorialModalProps {
  open: boolean;
  hidden?: boolean;
  onClose: () => void;
  darkMode: boolean;
}

interface Tutorial {
  id: string;
  icon: string;
  title: string;
  description: string;
  url: string;
}

export default function CreateAppTutorialModal({
  open: isOpen,
  hidden = false,
  onClose,
  darkMode,
}: CreateAppTutorialModalProps): React.ReactElement {
  const { shellApi } = useActiveRobotContext();
  const open = shellApi.open;
  const tutorials: Tutorial[] = [
    {
      id: 'console',
      icon: ExploratorIcon,
      title: 'Explore',
      description: 'Discover the REST API endpoints',
      url: 'https://huggingface.co/docs/reachy_mini/API/rest-api',
    },
    {
      id: 'create',
      icon: HowToCreateApp,
      title: 'Build',
      description: 'Create real world applications with the SDK',
      url: 'https://github.com/pollen-robotics/reachy_mini/blob/main/docs/SDK/',
    },
    {
      id: 'deploy',
      icon: AstronautIcon,
      title: 'Deploy',
      description: 'Publish on Hugging Face Spaces',
      url: 'https://huggingface.co/blog/pollen-robotics/make-and-publish-your-reachy-mini-apps',
    },
  ];

  const handleTutorialClick = async (url: string): Promise<void> => {
    try {
      await open(url);
    } catch (err) {
      console.error('Failed to open tutorial URL:', err);
    }
  };

  return (
    <FullscreenOverlay
      open={isOpen}
      hidden={hidden}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10003}
      debugName="CreateAppTutorial"
      centeredX={true}
      centeredY={true}
      showCloseButton={true}
    >
      <Box
        sx={{
          width: '90%',
          maxWidth: '700px',
          display: 'flex',
          flexDirection: 'column',
          my: 'auto',
        }}
      >
        <Box sx={{ mb: 4, textAlign: 'center' }}>
          <Typography
            sx={{
              fontSize: 28,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#1a1a1a',
              letterSpacing: '-0.5px',
              lineHeight: 1.1,
              mb: 1,
            }}
          >
            Build your own app
          </Typography>
          <Typography
            sx={{
              fontSize: 14,
              color: darkMode ? '#888' : '#888',
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            Create, build & deploy with Python SDK
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            gap: 2,
            mb: 6,
            mx: 'auto',
            width: '100%',
          }}
        >
          {tutorials.map(tutorial => (
            <Box
              key={tutorial.id}
              onClick={() => handleTutorialClick(tutorial.url)}
              sx={{
                flex: 1,
                p: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 2,
                cursor: 'pointer',
                borderRadius: '16px',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)'}`,
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.02)',
                  borderColor: darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.5)',
                  transform: 'translateY(-2px)',
                },
              }}
            >
              <Box
                component="img"
                src={tutorial.icon}
                alt={tutorial.title}
                sx={{
                  width: 140,
                  height: 140,
                  objectFit: 'contain',
                }}
              />
              <Box>
                <Typography
                  sx={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: darkMode ? '#f5f5f5' : '#1a1a1a',
                    letterSpacing: '-0.2px',
                    mb: 0.25,
                  }}
                >
                  {tutorial.title}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: darkMode ? '#888' : '#888',
                  }}
                >
                  {tutorial.description}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}
