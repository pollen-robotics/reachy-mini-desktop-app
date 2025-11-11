import React, { useState, useMemo } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import useAppStore from '../../store/useAppStore';
import { useApps } from '../../hooks/useApps';
import { useAppHandlers } from './useAppHandlers';
import InstalledAppsSection from './InstalledAppsSection';
import DiscoverAppsSection from './DiscoverAppsSection';
import InstallOverlay from '../InstallOverlay';

/**
 * Application Store for Reachy Mini
 * Displays installed and available apps from Hugging Face
 * @param {Function} showToast - Function to show toasts (message, severity)
 */

export default function ApplicationStore({ showToast }) {
  const { darkMode, toggleDarkMode } = useAppStore();
  const isActive = useAppStore(state => state.isActive);
  const isBusy = useAppStore(state => state.isBusy());
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
  } = useApps(isActive);
  
  // Hook pour gérer les handlers et la logique
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

  // Récupérer les infos de l'app en cours d'installation pour l'overlay
  const installingApp = installingAppName 
    ? [...availableApps, ...installedApps].find(app => app.name === installingAppName)
    : null;
  
  // Récupérer le job d'installation en cours - Convertir la Map en array
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
        // Scrollbar styling
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderRadius: '3px',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
        },
      }}
    >
      {/* Header */}
      <Box 
        sx={{ 
          px: 3, 
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: 20,
              fontWeight: 700,
              color: darkMode ? '#f5f5f5' : '#333',
              letterSpacing: '-0.3px',
            }}
          >
            Applications
          </Typography>
          
          {/* Dark Mode Toggle */}
          <IconButton
            size="small"
            onClick={toggleDarkMode}
            sx={{
              width: 32,
              height: 32,
              bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'transparent',
              '&:hover': {
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.12)' : 'rgba(0, 0, 0, 0.04)',
              },
            }}
          >
            {darkMode ? (
              <LightModeOutlinedIcon sx={{ fontSize: 18, color: '#FF9500' }} />
            ) : (
              <DarkModeOutlinedIcon sx={{ fontSize: 18, color: darkMode ? '#aaa' : '#999' }} />
            )}
          </IconButton>
        </Box>
        
        <Typography
          sx={{
            fontSize: 12,
            color: darkMode ? '#888' : '#999',
            fontWeight: 500,
          }}
        >
          Extend Reachy's capabilities
        </Typography>
      </Box>

      {/* Installed Apps Section */}
      <InstalledAppsSection
        installedApps={installedApps}
        darkMode={darkMode}
        expandedApp={expandedApp}
        setExpandedApp={setExpandedApp}
        appSettings={appSettings}
        updateAppSetting={updateAppSetting}
        startingApp={startingApp}
        currentApp={currentApp}
        isBusy={isBusy}
        isJobRunning={isJobRunning}
        handleStartApp={handleStartApp}
        handleUninstall={handleUninstall}
        getJobInfo={getJobInfo}
        stopCurrentApp={stopCurrentApp}
      />

      {/* Discover from Hugging Face */}
      <DiscoverAppsSection
        filteredApps={filteredApps}
        darkMode={darkMode}
        isBusy={isBusy}
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
          darkMode={darkMode}
          jobType={installJobType || 'install'}
          resultState={installResult}
        />
      )}
    </Box>
  );
}
