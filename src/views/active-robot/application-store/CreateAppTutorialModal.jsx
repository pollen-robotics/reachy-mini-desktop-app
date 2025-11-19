import React, { useState } from 'react';
import { Box, Typography, Button, IconButton, Chip, Divider, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TerminalIcon from '@mui/icons-material/Terminal';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ApiIcon from '@mui/icons-material/Api';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { open } from '@tauri-apps/plugin-shell';
import FullscreenOverlay from '../../../components/FullscreenOverlay';
import HowToCreateApp from '../../../assets/reachy-how-to-create-app.svg';
import JoystickIcon from '../../../assets/joystick.svg';
import BlueprintIcon from '../../../assets/blueprint.svg';
import RocketIcon from '../../../assets/rocket.svg';

/**
 * Modal overlay for tutorial on creating your own Reachy Mini app
 * Design style Apple with grid cards
 */
export default function CreateAppTutorialModal({
  open: isOpen,
  onClose,
  darkMode,
}) {
  const [expanded, setExpanded] = useState(null);

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : null);
  };

  const consoleExamples = [
    {
      title: 'Get robot state',
      description: 'Check the current state of all joints, motors, and sensors',
      code: `curl http://localhost:8000/api/state/full`,
      explanation: 'Returns complete robot state including joint positions, velocities, and motor status',
    },
    {
      title: 'Enable motors',
      description: 'Power on all robot motors (required before movement)',
      code: `curl -X POST http://localhost:8000/api/motors/enable`,
      explanation: 'Motors must be enabled before sending movement commands. Use disable to turn them off.',
    },
    {
      title: 'Move head',
      description: 'Control the robot head position in 3D space',
      code: `curl -X POST http://localhost:8000/api/goto \\
  -H "Content-Type: application/json" \\
  -d '{"head": {"x": 0, "y": -10, "z": 0}}'`,
      explanation: 'x=left/right, y=up/down, z=forward/backward. Values in degrees. Use goto_target for smooth interpolation.',
    },
    {
      title: 'Get joint positions',
      description: 'Read current joint angles for all motors',
      code: `curl http://localhost:8000/api/state/joints`,
      explanation: 'Returns an array of joint positions. Useful for monitoring or saving poses.',
    },
  ];

  const createSteps = [
    {
      number: 1,
      icon: <TerminalIcon sx={{ fontSize: 20 }} />,
      title: 'Create App Structure',
      description: 'Use the official tool to generate your app structure with all required files.',
      details: [
        'Run: reachy-mini-make-app my_app',
        'Creates pyproject.toml with entry points',
        'Generates template code with examples',
      ],
      code: `reachy-mini-make-app my_app`,
      action: 'View Default App Template',
      actionUrl: 'https://huggingface.co/spaces/pollen-robotics/reachy_mini_app_example',
      tip: 'This tool ensures correct structure and entry points configuration',
    },
    {
      number: 2,
      icon: <CodeIcon sx={{ fontSize: 20 }} />,
      title: 'Write Your App',
      description: 'Implement your app logic by inheriting from ReachyMiniApp and implementing the run method.',
      details: [
        'Inherit from ReachyMiniApp',
        'Implement run(reachy_mini, stop_event)',
        'Check stop_event.is_set() in loops',
      ],
      code: `import threading
import time
from reachy_mini import ReachyMini, ReachyMiniApp
from reachy_mini.utils import create_head_pose

class MyApp(ReachyMiniApp):
    def run(self, reachy_mini: ReachyMini, stop_event: threading.Event):
        while not stop_event.is_set():
            pose = create_head_pose(yaw=30, degrees=True)
            reachy_mini.goto_target(head=pose, duration=1.0)
            time.sleep(0.1)`,
      tip: 'ReachyMini is already initialized - don\'t create a new instance in run()',
    },
    {
      number: 3,
      icon: <CheckCircleIcon sx={{ fontSize: 20 }} />,
      title: 'Test Locally',
      description: 'Test your app locally before deploying. Install it and run it with the daemon.',
      details: [
        'Install: pip install -e my_app/',
        'Ensure daemon is running',
        'Run: python my_app/my_app/main.py',
      ],
      code: `pip install -e my_app/
python my_app/my_app/main.py`,
      tip: 'Test in simulation mode: reachy-mini-daemon --sim',
    },
  ];

  const deploySteps = [
    {
      number: 1,
      icon: <CloudUploadIcon sx={{ fontSize: 20 }} />,
      title: 'Create Hugging Face Space',
      description: 'Create a new Space with SDK framework. Upload your files and configure it.',
      details: [
        'Go to: huggingface.co/new-space',
        'Select SDK as framework',
        'Upload: app.py, requirements.txt, README.md',
        'Add tag: reachy_mini',
      ],
      code: `# requirements.txt
reachy-mini

# app.py (root of Space)
from my_app.main import MyApp
from reachy_mini import ReachyMini
import threading

with ReachyMini() as reachy:
    app = MyApp()
    stop = threading.Event()
    app.run(reachy, stop)`,
      action: 'Create Space',
      actionUrl: 'https://huggingface.co/new-space',
      tip: 'Make sure to select SDK, not Gradio or Streamlit',
    },
    {
      number: 2,
      icon: <RocketLaunchIcon sx={{ fontSize: 20 }} />,
      title: 'Publish & Share',
      description: 'Once your Space is ready, it will appear in searches. Share it with the community!',
      details: [
        'Commit and push to your Space',
        'Add description and screenshots',
        'Tag with reachy_mini for discovery',
        'Share with the community',
      ],
      action: 'Browse Apps',
      actionUrl: 'https://huggingface.co/spaces?q=reachy_mini',
      tip: 'Apps with tag reachy_mini appear in the store automatically',
    },
  ];

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

        {/* Accordions layout */}
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
          {/* Accordion 1: Get familiar with the robot */}
          <Accordion
            expanded={expanded === 'console'}
            onChange={handleChange('console')}
            sx={{
              bgcolor: 'transparent',
              border: 'none',
              borderRadius: '0 !important',
              boxShadow: 'none',
              '&:before': {
                display: 'none',
              },
              '&.Mui-expanded': {
                margin: 0,
              },
              borderBottom: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: '#FF9500', fontSize: 28 }} />}
              sx={{
                px: 3,
                py: 2.5,
                minHeight: 'auto',
                '&.Mui-expanded': {
                  minHeight: 'auto',
                },
                '& .MuiAccordionSummary-content': {
                  margin: 0,
                  '&.Mui-expanded': {
                    margin: 0,
                  },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Box
                  component="img"
                  src={JoystickIcon}
                  alt="Joystick"
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
                    Get familiar with the robot
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: darkMode ? '#aaa' : '#666',
                    }}
                  >
                    Use the daemon API via console commands
                </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: darkMode ? '#bbb' : '#666',
                    lineHeight: 1.6,
                    mb: 2.5,
                  }}
                >
                  The <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ddd' : '#555' }}>Reachy Mini daemon</Box> runs a <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ddd' : '#555' }}>REST API</Box> at <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 12, color: '#FF9500' }}>localhost:8000</Box>. It manages robot communication and exposes endpoints to control motors, read sensors, and execute movements. Use <Box component="span" sx={{ fontWeight: 600, color: darkMode ? '#ddd' : '#555' }}>curl</Box> commands or any HTTP client to interact with it.
                </Typography>
                
                {/* Console examples */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2.5 }}>
                  {consoleExamples.map((example, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        p: 2,
                        borderRadius: '12px',
                        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                        border: `1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            sx={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: darkMode ? '#f5f5f5' : '#1a1a1a',
                              mb: 0.5,
                            }}
                          >
                            {example.title}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: darkMode ? '#aaa' : '#666',
                              lineHeight: 1.4,
                            }}
                          >
                            {example.description}
                          </Typography>
                        </Box>
                      </Box>
                      <Box
                        sx={{
                          p: 1.5,
                          borderRadius: '8px',
                          bgcolor: darkMode ? '#0a0a0a' : '#f8f8f8',
                          border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                          mb: example.explanation ? 1 : 0,
                        }}
                      >
                        <Typography
                          component="pre"
                          sx={{
                            fontSize: 10,
                            fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace',
                            color: darkMode ? '#e0e0e0' : '#333',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            lineHeight: 1.5,
                          }}
                        >
                          {example.code}
                        </Typography>
                      </Box>
                      {example.explanation && (
                        <Typography
                          sx={{
                            fontSize: 10,
                            color: darkMode ? '#888' : '#777',
                            lineHeight: 1.4,
                            fontStyle: 'italic',
                            mt: 0.5,
                          }}
                        >
                          💡 {example.explanation}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>

                {/* API Documentation link */}
                <Button
                  fullWidth
                  size="medium"
                  onClick={async () => {
                    try {
                      await open('http://localhost:8000/docs');
                    } catch (err) {
                      console.error('Failed to open API docs:', err);
                    }
                  }}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#FF9500',
                    border: '1.5px solid #FF9500',
                    borderRadius: '10px',
                    py: 1.25,
                    bgcolor: 'transparent',
                    '&:hover': {
                      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                      borderColor: '#FF9500',
                    },
                  }}
                >
                  View full API documentation
                  <Box component="span" sx={{ ml: 1, fontSize: 11, opacity: 0.7, fontFamily: 'monospace' }}>
                    (localhost:8000/docs)
                  </Box>
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Accordion 2: Create Your Own App */}
          <Accordion
            expanded={expanded === 'create'}
            onChange={handleChange('create')}
            sx={{
              bgcolor: 'transparent',
              border: 'none',
              borderRadius: '0 !important',
              boxShadow: 'none',
              '&:before': {
                display: 'none',
              },
              '&.Mui-expanded': {
                margin: 0,
              },
              borderBottom: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: '#FF9500', fontSize: 28 }} />}
              sx={{
                px: 3,
                py: 2.5,
                minHeight: 'auto',
                '&.Mui-expanded': {
                  minHeight: 'auto',
                },
                '& .MuiAccordionSummary-content': {
                  margin: 0,
                  '&.Mui-expanded': {
                    margin: 0,
                  },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Box
                  component="img"
                  src={BlueprintIcon}
                  alt="Blueprint"
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
                    Create your own app
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: darkMode ? '#aaa' : '#666',
                    }}
                  >
                    Build your app with the Python SDK
                  </Typography>
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {createSteps.map((step) => (
            <Box
              key={step.number}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                p: 3.5,
                borderRadius: '20px',
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                border: `1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: darkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                      boxShadow: darkMode 
                    ? '0 8px 24px rgba(0, 0, 0, 0.3)'
                    : '0 8px 24px rgba(0, 0, 0, 0.08)',
                },
              }}
            >
              {/* Step header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
              <Box
                sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                    flexShrink: 0,
                    color: '#FF9500',
                  }}
                >
                  {step.icon}
              </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Chip
                    label={`Step ${step.number}`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                      color: '#FF9500',
                      border: 'none',
                      mb: 0.5,
                    }}
                  />
                <Typography
                  sx={{
                      fontSize: 18,
                    fontWeight: 700,
                      color: darkMode ? '#f5f5f5' : '#1a1a1a',
                      letterSpacing: '-0.3px',
                      lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </Typography>
                </Box>
              </Box>
                
              {/* Description */}
                <Typography
                  sx={{
                  fontSize: 13,
                  color: darkMode ? '#bbb' : '#666',
                  lineHeight: 1.6,
                  mb: 2.5,
                  }}
                >
                  {step.description}
                </Typography>

              {/* Details list */}
              {step.details && (
                <Box sx={{ mb: 2.5 }}>
                  {step.details.map((detail, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Box
                        sx={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          bgcolor: '#FF9500',
                          mt: 0.75,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: darkMode ? '#999' : '#777',
                          lineHeight: 1.5,
                        }}
                      >
                        {detail}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

                {/* Code block */}
                {step.code && (
                  <Box
                    sx={{
                    p: 2,
                    borderRadius: '12px',
                    bgcolor: darkMode ? '#0a0a0a' : '#f8f8f8',
                    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                    mb: 2.5,
                    overflow: 'hidden',
                    }}
                  >
                    <Typography
                      component="pre"
                      sx={{
                      fontSize: 11,
                      fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace',
                        color: darkMode ? '#e0e0e0' : '#333',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      lineHeight: 1.6,
                      }}
                    >
                      {step.code}
                    </Typography>
                  </Box>
                )}

              {/* Tip */}
              {step.tip && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: '10px',
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                    border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                    mb: 2,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#FF9500',
                      mb: 0.5,
                    }}
                  >
                    💡 Tip
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: darkMode ? '#ddd' : '#666',
                      lineHeight: 1.5,
                    }}
                  >
                    {step.tip}
                  </Typography>
                </Box>
              )}

                {/* Action button */}
                {step.action && step.actionUrl && (
                  <Button
                  fullWidth
                  size="medium"
                    onClick={async () => {
                      try {
                        await open(step.actionUrl);
                      } catch (err) {
                        console.error('Failed to open URL:', err);
                      }
                    }}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      textTransform: 'none',
                    fontSize: 13,
                      fontWeight: 600,
                      color: '#FF9500',
                      border: '1px solid #FF9500',
                    borderRadius: '10px',
                    py: 1.25,
                      bgcolor: 'transparent',
                    mt: 'auto',
                      '&:hover': {
                      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                        borderColor: '#FF9500',
                      },
                    }}
                  >
                    {step.action}
                  </Button>
                )}
            </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Accordion 3: Deploy */}
          <Accordion
            expanded={expanded === 'deploy'}
            onChange={handleChange('deploy')}
            sx={{
              bgcolor: 'transparent',
              border: 'none',
              borderRadius: '0 !important',
              boxShadow: 'none',
              '&:before': {
                display: 'none',
              },
              '&.Mui-expanded': {
                margin: 0,
              },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon sx={{ color: '#FF9500', fontSize: 28 }} />}
              sx={{
                px: 3,
                py: 2.5,
                minHeight: 'auto',
                '&.Mui-expanded': {
                  minHeight: 'auto',
                },
                '& .MuiAccordionSummary-content': {
                  margin: 0,
                  '&.Mui-expanded': {
                    margin: 0,
                  },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <Box
                  component="img"
                  src={RocketIcon}
                  alt="Rocket"
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
                    Deploy
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: darkMode ? '#aaa' : '#666',
                    }}
                  >
                    Share your app on Hugging Face Spaces
                  </Typography>
            </Box>
          </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {deploySteps.map((step) => (
            <Box
              key={step.number}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                p: 3.5,
                borderRadius: '20px',
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                border: `1.5px solid ${darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)'}`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: darkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
                  boxShadow: darkMode
                    ? '0 8px 24px rgba(0, 0, 0, 0.3)'
                    : '0 8px 24px rgba(0, 0, 0, 0.08)',
                },
              }}
            >
              {/* Step header */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
              <Box
                sx={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.2)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                    flexShrink: 0,
                    color: '#FF9500',
                  }}
                >
                  {step.icon}
              </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Chip
                    label={`Step ${step.number}`}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.1)',
                      color: '#FF9500',
                      border: 'none',
                      mb: 0.5,
                    }}
                  />
                <Typography
                  sx={{
                      fontSize: 18,
                    fontWeight: 700,
                      color: darkMode ? '#f5f5f5' : '#1a1a1a',
                      letterSpacing: '-0.3px',
                      lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </Typography>
                </Box>
              </Box>
                
              {/* Description */}
                <Typography
                  sx={{
                  fontSize: 13,
                  color: darkMode ? '#bbb' : '#666',
                  lineHeight: 1.6,
                  mb: 2.5,
                  }}
                >
                  {step.description}
                </Typography>

              {/* Details list */}
              {step.details && (
                <Box sx={{ mb: 2.5 }}>
                  {step.details.map((detail, idx) => (
                    <Box
                      key={idx}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1,
                        mb: 1,
                      }}
                    >
                      <Box
                        sx={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          bgcolor: '#FF9500',
                          mt: 0.75,
                          flexShrink: 0,
                        }}
                      />
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: darkMode ? '#999' : '#777',
                          lineHeight: 1.5,
                        }}
                      >
                        {detail}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

                {/* Code block */}
                {step.code && (
                  <Box
                    sx={{
                    p: 2,
                    borderRadius: '12px',
                    bgcolor: darkMode ? '#0a0a0a' : '#f8f8f8',
                    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                    mb: 2.5,
                    overflow: 'hidden',
                    }}
                  >
                    <Typography
                      component="pre"
                      sx={{
                      fontSize: 11,
                      fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", monospace',
                        color: darkMode ? '#e0e0e0' : '#333',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      lineHeight: 1.6,
                      }}
                    >
                      {step.code}
                    </Typography>
                  </Box>
                )}

              {/* Tip */}
              {step.tip && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: '10px',
                    bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                    border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                    mb: 2,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#FF9500',
                      mb: 0.5,
                    }}
                  >
                    💡 Tip
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: darkMode ? '#ddd' : '#666',
                      lineHeight: 1.5,
                    }}
                  >
                    {step.tip}
                    </Typography>
                  </Box>
                )}

                {/* Action button */}
                {step.action && step.actionUrl && (
                  <Button
                  fullWidth
                  size="medium"
                    onClick={async () => {
                      try {
                        await open(step.actionUrl);
                      } catch (err) {
                        console.error('Failed to open URL:', err);
                      }
                    }}
                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      textTransform: 'none',
                    fontSize: 13,
                      fontWeight: 600,
                      color: '#FF9500',
                      border: '1px solid #FF9500',
                    borderRadius: '10px',
                    py: 1.25,
                      bgcolor: 'transparent',
                    mt: 'auto',
                      '&:hover': {
                      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                        borderColor: '#FF9500',
                      },
                    }}
                  >
                    {step.action}
                  </Button>
                )}
              </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
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
                  await open('http://localhost:8000/docs');
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

