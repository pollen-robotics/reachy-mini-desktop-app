import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, IconButton, Button, ButtonGroup, Accordion, AccordionSummary, AccordionDetails, Tooltip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReachyBox from '../../../assets/reachy-update-box.svg';
import useAppStore from '../../../store/useAppStore';
import { useApps } from '../../../hooks/useApps';
import { useAppHandlers } from './useAppHandlers';
import InstalledAppsSection from './InstalledAppsSection';
import DiscoverModal from './DiscoverModal';
import CreateAppTutorialModal from './CreateAppTutorialModal';
import InstallOverlay from './InstallOverlay';
import QuickActionsPad from './QuickActionsPad';
// import RobotPositionControl from '../RobotPositionControl';

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
  
  // State for official/non-official filter
  const [officialOnly, setOfficialOnly] = useState(true); // Default: only official apps
  
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
  } = useApps(effectiveIsActive, officialOnly);
  
  // ✅ Notify parent when loading status changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);
  
  // ✅ Reset category when switching between official/non-official
  useEffect(() => {
    setSelectedCategory(null);
  }, [officialOnly]);
  
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
  const [selectedCategory, setSelectedCategory] = useState(null); // null = all categories
  
  // Modal stack management for proper navigation between modals
  const [modalStack, setModalStack] = useState([]);
  
  // Helper functions for modal management
  const openModal = (modalType) => {
    setModalStack(prev => [...prev, modalType]);
  };
  
  const closeModal = () => {
    setModalStack(prev => prev.slice(0, -1));
  };
  
  const closeAllModals = () => {
    setModalStack([]);
  };
  
  // Derived state for each modal - only the top modal in stack is open
  const discoverModalOpen = modalStack[modalStack.length - 1] === 'discover';
  const createAppTutorialModalOpen = modalStack[modalStack.length - 1] === 'createTutorial';

  // Retrieve the info of the app being installed for the overlay
  const installingApp = installingAppName 
    ? [...availableApps, ...installedApps].find(app => app.name === installingAppName)
    : null;
  
  // Retrieve the current installation job - Convert Map to array
  const activeJobsArray = Array.from(activeJobs.values());
  const installingJob = installingAppName
    ? activeJobsArray.find(job => job.appName === installingAppName)
    : null;

  // Get not installed apps (used for categories and total count)
  const notInstalledApps = useMemo(() => {
    return availableApps.filter(app => 
      !installedApps.some(inst => inst.name === app.name)
    );
  }, [availableApps, installedApps]);

  // Extract available categories from apps with counts
  const categories = useMemo(() => {
    const categoryMap = new Map(); // category -> count
    
    notInstalledApps.forEach(app => {
      // Extract tags from both root level and cardData (HF API has tags in both places)
      const rootTags = app.extra?.tags || [];
      const cardDataTags = app.extra?.cardData?.tags || [];
      const allTags = [...new Set([...rootTags, ...cardDataTags])]; // Merge and deduplicate
      
      // Extract SDK from both root level and cardData
      const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;
      
      allTags.forEach(tag => {
        if (tag && typeof tag === 'string') {
          // Skip region tags (e.g., 'region:us')
          // Skip reachy_mini tag as it's present everywhere and is the condition to be in the list
          // Skip static tag as it's not useful for filtering
          if (!tag.startsWith('region:') && 
              tag.toLowerCase() !== 'reachy_mini' && 
              tag.toLowerCase() !== 'reachy-mini' &&
              tag.toLowerCase() !== 'static') {
            // If tag matches SDK, use tag name instead of sdk: prefix to avoid duplicates
            // Otherwise, add tag as-is
            if (sdk && tag.toLowerCase() === sdk.toLowerCase()) {
              // Tag matches SDK, use tag name (will be counted once)
              categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
            } else {
              categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
            }
          }
        }
      });
      
      // Only add SDK category if SDK doesn't match any existing tag
      if (sdk && typeof sdk === 'string') {
        const sdkLower = sdk.toLowerCase();
        const hasMatchingTag = allTags.some(tag => 
          tag && typeof tag === 'string' && tag.toLowerCase() === sdkLower
        );
        
        // Only add SDK category if no matching tag exists
        if (!hasMatchingTag) {
          const sdkCategory = `sdk:${sdk}`;
          categoryMap.set(sdkCategory, (categoryMap.get(sdkCategory) || 0) + 1);
        }
      }
    });
    
    // Convert to array of objects with name and count, sorted by count (descending) then by name
    // Limit to top 6 categories by count
    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        // First sort by count (descending)
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        // Then by name (ascending)
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6); // Keep only top 6 categories
  }, [notInstalledApps]);

  // Filter available apps (not installed) based on search and category
  const filteredApps = useMemo(() => {
    // Start with not installed apps
    let notInstalled = [...notInstalledApps];
    
    // Filter by category
    if (selectedCategory) {
      notInstalled = notInstalled.filter(app => {
        // Get tags from both root level and cardData
        const rootTags = app.extra?.tags || [];
        const cardDataTags = app.extra?.cardData?.tags || [];
        const allTags = [...new Set([...rootTags, ...cardDataTags])];
        
        // Get SDK from both root level and cardData
        const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;
        
        // Check if app matches selected category
        if (selectedCategory.startsWith('sdk:')) {
          const sdkCategory = selectedCategory.replace('sdk:', '');
          return sdk === sdkCategory;
        } else {
          // Check if tag matches, or if SDK matches the tag (for merged categories)
          const tagMatches = allTags.includes(selectedCategory);
          const sdkMatches = sdk && sdk.toLowerCase() === selectedCategory.toLowerCase();
          return tagMatches || sdkMatches;
        }
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase();
      notInstalled = notInstalled.filter(app => 
      app.name.toLowerCase().includes(query) ||
      (app.description && app.description.toLowerCase().includes(query))
    );
    }
    
    return notInstalled;
  }, [notInstalledApps, searchQuery, selectedCategory]);

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
              {installedApps.length > 0 && (
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: effectiveDarkMode ? '#666' : '#999',
                  }}
                >
                  {installedApps.length}
                </Typography>
              )}
              <Tooltip 
                title="Apps that are currently installed on your robot. You can start, stop, configure, or uninstall them from here." 
                arrow 
                placement="top"
              >
                <InfoOutlinedIcon sx={{ fontSize: 14, color: effectiveDarkMode ? '#666' : '#999', opacity: 0.6, cursor: 'help' }} />
              </Tooltip>
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
            onOpenDiscover={() => openModal('discover')}
        onOpenCreateTutorial={() => openModal('createTutorial')}
      />
        </AccordionDetails>
      </Accordion>


      {/* Robot Position Control */}
      {/* {installedApps.length > 0 && (
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
      )} */}

      {/* Discover Modal */}
      <DiscoverModal
        open={discoverModalOpen}
        onClose={closeModal}
        filteredApps={filteredApps}
        darkMode={effectiveDarkMode}
        isBusy={effectiveIsBusy}
        isLoading={isLoading}
        activeJobs={activeJobs}
        isJobRunning={isJobRunning}
        handleInstall={handleInstall}
        getJobInfo={getJobInfo}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        officialOnly={officialOnly}
        setOfficialOnly={setOfficialOnly}
        categories={categories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        totalAppsCount={notInstalledApps.length}
        onOpenCreateTutorial={() => openModal('createTutorial')}
      />

      {/* Create App Tutorial Modal */}
      <CreateAppTutorialModal
        open={createAppTutorialModalOpen}
        onClose={closeModal}
        darkMode={effectiveDarkMode}
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
