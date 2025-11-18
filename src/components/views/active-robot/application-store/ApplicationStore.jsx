import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, IconButton, Button, ButtonGroup, Accordion, AccordionSummary, AccordionDetails, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import useAppStore from '../../../../store/useAppStore';
import { useApps } from '../../../../hooks/useApps';
import { useAppHandlers } from './useAppHandlers';
import InstalledAppsSection from './InstalledAppsSection';
import DiscoverModal from './DiscoverModal';
import InstallOverlay from './InstallOverlay';
import QuickActionsPad from './QuickActionsPad';
import HandwrittenArrows from './HandwrittenArrows';
import RobotPositionControl from '../RobotPositionControl';

/**
 * Application Store for Reachy Mini
 * Displays installed and available apps from Hugging Face
 * @param {Function} showToast - Function to show toasts (message, severity)
 */

export default function ApplicationStore({ 
  showToast, 
  onLoadingChange,
  quickActions = [],
  handleQuickAction = null,
  isReady = false,
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const { darkMode: storeDarkMode, toggleDarkMode } = useAppStore();
  // Use prop darkMode if provided, otherwise use store darkMode
  const effectiveDarkMode = darkMode !== undefined ? darkMode : storeDarkMode;
  // Use props isActive/isBusy if provided, otherwise use store values
  const storeIsActive = useAppStore(state => state.isActive);
  const storeIsBusy = useAppStore(state => state.isBusy());
  const effectiveIsActive = isActive !== undefined ? isActive : storeIsActive;
  const effectiveIsBusy = isBusy !== undefined ? isBusy : storeIsBusy;
  const installingAppName = useAppStore(state => state.installingAppName);
  const installJobType = useAppStore(state => state.installJobType);
  const installResult = useAppStore(state => state.installResult);
  
  // Hook to manage apps via API
  const {
    availableApps,
    installedApps,
    currentApp,
    activeJobs,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchAvailableApps,
    isLoading,
  } = useApps(effectiveIsActive);
  
  // ✅ Notify parent when loading status changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);
  
  // Hook to manage handlers and logic
  const {
    expandedApp,
    setExpandedApp,
    appSettings,
    updateAppSetting,
    startingApp,
    handleInstall,
    handleUninstall,
    handleStartApp,
    isJobRunning,
    getJobInfo,
  } = useAppHandlers({
    currentApp,
    activeJobs,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    showToast,
    refreshApps: fetchAvailableApps,
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [discoverModalOpen, setDiscoverModalOpen] = useState(false);

  // Retrieve the info of the app being installed for the overlay
  const installingApp = installingAppName 
    ? [...availableApps, ...installedApps].find(app => app.name === installingAppName)
    : null;
  
  // Retrieve the current installation job - Convert Map to array
  const activeJobsArray = Array.from(activeJobs.values());
  const installingJob = installingAppName
    ? activeJobsArray.find(job => job.appName === installingAppName)
    : null;

  // Filter available apps (not installed) based on search
  const filteredApps = useMemo(() => {
    // Only show apps NOT installed (exclude those in installedApps)
    const notInstalled = availableApps.filter(app => 
      !installedApps.some(inst => inst.name === app.name)
    );
    
    if (!searchQuery.trim()) return notInstalled;
    
    const query = searchQuery.toLowerCase();
    return notInstalled.filter(app => 
      app.name.toLowerCase().includes(query) ||
      (app.description && app.description.toLowerCase().includes(query))
    );
  }, [availableApps, installedApps, searchQuery]);

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarGutter: 'stable',
        pt: 0,
        bgcolor: 'transparent !important',
        backgroundColor: 'transparent !important',
        // Scrollbar styling
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: effectiveDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderRadius: '3px',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: effectiveDarkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      {/* Quick Actions Section - Accordion */}
      {quickActions.length > 0 && handleQuickAction && (
        <Accordion 
          defaultExpanded={true}
          sx={{
            boxShadow: 'none !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
            mt: 0,
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ color: effectiveDarkMode ? '#666' : '#bbb', opacity: 0.5 }} />}
            sx={{
              px: 3,
              py: 1,
              pt: 0,
              minHeight: 'auto',
              bgcolor: 'transparent !important',
              backgroundColor: 'transparent !important',
              '&.Mui-expanded': { minHeight: 'auto' },
              '& .MuiAccordionSummary-content': {
                margin: '12px 0',
                '&.Mui-expanded': { margin: '12px 0' },
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  bgcolor: effectiveDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: effectiveDarkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.3px',
            }}
          >
            Quick Actions
          </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 3, pt: 0, pb: 0, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>
          <QuickActionsPad
            actions={quickActions}
            onActionClick={handleQuickAction}
            isReady={isReady}
            isActive={effectiveIsActive}
            isBusy={effectiveIsBusy}
            darkMode={effectiveDarkMode}
          />
          </AccordionDetails>
        </Accordion>
      )}

      {/* Applications Section - Accordion */}
      <Accordion 
        defaultExpanded={true}
        sx={{ 
          boxShadow: 'none !important',
          bgcolor: 'transparent !important',
          backgroundColor: 'transparent !important',
          '&:before': { display: 'none' },
          '&.Mui-expanded': { margin: 0 },
          mt: 0,
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: effectiveDarkMode ? '#666' : '#bbb', opacity: 0.5 }} />}
          sx={{
            px: 3,
            py: 1,
            pt: quickActions.length > 0 && handleQuickAction ? 1 : 0,
            minHeight: 'auto',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            '&.Mui-expanded': { minHeight: 'auto' },
            '& .MuiAccordionSummary-content': {
              margin: '12px 0',
              '&.Mui-expanded': { margin: '12px 0' },
            },
          }}
      >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  bgcolor: effectiveDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
        <Typography
          sx={{
            fontSize: 20,
            fontWeight: 700,
            color: effectiveDarkMode ? '#f5f5f5' : '#333',
            letterSpacing: '-0.3px',
          }}
        >
          Applications
        </Typography>
              <Tooltip 
                title="Apps that are currently installed on your robot. You can start, stop, configure, or uninstall them from here." 
                arrow 
                placement="top"
              >
                <InfoOutlinedIcon sx={{ fontSize: 14, color: effectiveDarkMode ? '#666' : '#999', opacity: 0.6, cursor: 'help', ml: 0.5 }} />
              </Tooltip>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: effectiveDarkMode ? '#666' : '#999',
                  ml: 0.5,
                }}
              >
                {installedApps.length}
        </Typography>
            </Box>
        <Typography
          sx={{
            fontSize: 12,
            color: effectiveDarkMode ? '#888' : '#999',
            fontWeight: 500,
          }}
        >
          Extend Reachy's capabilities
        </Typography>
      </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 0, pb: 0, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>

      {/* Installed Apps Section */}
      <InstalledAppsSection
        installedApps={installedApps}
        darkMode={effectiveDarkMode}
        expandedApp={expandedApp}
        setExpandedApp={setExpandedApp}
        appSettings={appSettings}
        updateAppSetting={updateAppSetting}
        startingApp={startingApp}
        currentApp={currentApp}
        isBusy={effectiveIsBusy}
        isJobRunning={isJobRunning}
        handleStartApp={handleStartApp}
        handleUninstall={handleUninstall}
        getJobInfo={getJobInfo}
        stopCurrentApp={stopCurrentApp}
        onOpenDiscover={() => setDiscoverModalOpen(true)}
      />
        </AccordionDetails>
      </Accordion>

      {/* Develop Section - Accordion (only show when apps are installed) */}
      {installedApps.length > 0 && (
        <Accordion 
          defaultExpanded={true}
          sx={{ 
            boxShadow: 'none !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
            mt: 0,
          }}
        >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: effectiveDarkMode ? '#666' : '#bbb', opacity: 0.5 }} />}
          sx={{
            px: 3,
            py: 1,
            pt: 1,
            minHeight: 'auto',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            '&.Mui-expanded': { minHeight: 'auto' },
            '& .MuiAccordionSummary-content': {
              margin: '12px 0',
              '&.Mui-expanded': { margin: '12px 0' },
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                bgcolor: effectiveDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                borderRadius: '50%',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontSize: 20,
                fontWeight: 700,
                color: effectiveDarkMode ? '#f5f5f5' : '#333',
                letterSpacing: '-0.3px',
              }}
            >
                Develop Center
            </Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 3, pt: 0, pb: 3, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>
          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1.5 }}>
            {/* Discover Card */}
            <Box
              component="button"
              onClick={() => setDiscoverModalOpen(true)}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                p: 2.5,
                borderRadius: '14px',
                bgcolor: effectiveDarkMode ? 'rgba(255, 149, 0, 0.05)' : 'rgba(255, 149, 0, 0.03)',
                border: `1px solid ${effectiveDarkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.3)'}`,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'center',
                '&:hover': {
                  bgcolor: effectiveDarkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  borderColor: '#FF9500',
                  transform: 'translateY(-1px)',
                  boxShadow: effectiveDarkMode 
                    ? `0 4px 12px rgba(255, 149, 0, 0.2)` 
                    : `0 4px 12px rgba(255, 149, 0, 0.15)`,
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  fontSize: 40,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Handwritten arrows pointing to icon */}
                <HandwrittenArrows color="#FF9500" size={80} />
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  📦
                </Box>
              </Box>
              
              <Box sx={{ width: '100%' }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#FF9500',
                    mb: 0.5,
                    letterSpacing: '-0.2px',
                    textAlign: 'center',
                  }}
                >
                  Discover Apps
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: effectiveDarkMode ? '#888' : '#999',
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}
                >
                  Browse and install apps from Hugging Face Spaces
                </Typography>
              </Box>
            </Box>

            {/* Create Card */}
            <Box
              component="button"
              onClick={async () => {
                try {
                  await open('https://huggingface.co/new-space');
                } catch (err) {
                  console.error('Failed to open Hugging Face URL:', err);
                }
              }}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                p: 2.5,
                borderRadius: '14px',
                bgcolor: 'transparent',
                border: `1px dashed ${effectiveDarkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.5)'}`,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'center',
                '&:hover': {
                  borderColor: '#FF9500',
                  bgcolor: effectiveDarkMode ? 'rgba(255, 149, 0, 0.05)' : 'rgba(255, 149, 0, 0.03)',
                  transform: 'translateY(-1px)',
                  boxShadow: effectiveDarkMode 
                    ? `0 4px 12px rgba(255, 149, 0, 0.15)` 
                    : `0 4px 12px rgba(255, 149, 0, 0.1)`,
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
              }}
            >
              <Box
                sx={{
                  fontSize: 40,
                  lineHeight: 1,
                }}
              >
                🛠️
              </Box>
              
              <Box sx={{ width: '100%' }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#FF9500',
                    mb: 0.5,
                    letterSpacing: '-0.2px',
                    textAlign: 'center',
                  }}
                >
                  Build your own app
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: effectiveDarkMode ? '#888' : '#999',
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}
                >
                  Create and share your Reachy Mini app on Hugging Face Spaces
                </Typography>
              </Box>
            </Box>
          </Box>
        </AccordionDetails>
      </Accordion>
      )}

      {/* Robot Position Control */}
      {installedApps.length > 0 && (
        <Accordion
          defaultExpanded={true}
          sx={{
            boxShadow: 'none !important',
            bgcolor: 'transparent !important',
            backgroundColor: 'transparent !important',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
            mt: 0,
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ color: effectiveDarkMode ? '#666' : '#bbb', opacity: 0.5 }} />}
            sx={{
              px: 3,
              py: 1,
              pt: 1,
              minHeight: 'auto',
              bgcolor: 'transparent !important',
              backgroundColor: 'transparent !important',
              '&.Mui-expanded': { margin: '12px 0' },
              '& .MuiAccordionSummary-content': {
                margin: '12px 0',
                '&.Mui-expanded': { margin: '12px 0' },
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  bgcolor: effectiveDarkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: effectiveDarkMode ? '#f5f5f5' : '#333',
                  letterSpacing: '-0.3px',
                }}
              >
                Position Control
              </Typography>
              <Tooltip 
                title="Glissez les contrôles pour un mouvement continu (envoie /api/move/set_target). Relâchez pour envoyer une commande discrète avec durée dynamique basée sur la distance (envoie /api/move/goto)." 
                arrow 
                placement="right"
              >
                <InfoOutlinedIcon sx={{ fontSize: 16, color: effectiveDarkMode ? '#888' : '#999', cursor: 'help', ml: 0.75 }} />
              </Tooltip>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 0, pt: 0, pb: 3, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>
            <RobotPositionControl
              isActive={effectiveIsActive}
              darkMode={effectiveDarkMode}
            />
          </AccordionDetails>
        </Accordion>
      )}

      {/* Discover Modal */}
      <DiscoverModal
        open={discoverModalOpen}
        onClose={() => setDiscoverModalOpen(false)}
        filteredApps={filteredApps}
        darkMode={effectiveDarkMode}
        isBusy={effectiveIsBusy}
        activeJobs={activeJobs}
        isJobRunning={isJobRunning}
        handleInstall={handleInstall}
        getJobInfo={getJobInfo}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Overlay fullscreen pour installations */}
      {installingApp && (
        <InstallOverlay
          appInfo={installingApp}
          jobInfo={installingJob || { type: installJobType || 'install', status: 'starting', logs: [] }}
          darkMode={effectiveDarkMode}
          jobType={installJobType || 'install'}
          resultState={installResult}
        />
      )}
    </Box>
  );
}
