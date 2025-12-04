import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import useAppStore from '@store/useAppStore';
import { useApps, useAppHandlers, useAppInstallation } from '../../application-store/hooks';
import { InstalledAppsSection } from '../../application-store/installed';
import { Modal as DiscoverModal } from '../../application-store/discover';
import { CreateAppTutorial as CreateAppTutorialModal } from '../../application-store/modals';
import { Overlay as InstallOverlay } from '../../application-store/installation';

/**
 * Applications Section - Displays installed and available apps from Hugging Face
 */
export default function ApplicationsSection({ 
  showToast, 
  onLoadingChange,
  hasQuickActions = false, // To adjust padding-top of AccordionSummary
  isActive = false,
  isBusy = false,
  darkMode = false,
}) {
  const { darkMode: storeDarkMode } = useAppStore();
  const effectiveDarkMode = darkMode !== undefined ? darkMode : storeDarkMode;
  const storeIsActive = useAppStore(state => state.isActive);
  const storeIsBusy = useAppStore(state => state.isBusy());
  const effectiveIsActive = isActive !== undefined ? isActive : storeIsActive;
  const effectiveIsBusy = isBusy !== undefined ? isBusy : storeIsBusy;
  const installingAppName = useAppStore(state => state.installingAppName);
  const installJobType = useAppStore(state => state.installJobType);
  const installResult = useAppStore(state => state.installResult);
  const installStartTime = useAppStore(state => state.installStartTime);
  
  const [officialOnly, setOfficialOnly] = useState(true);
  
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
  
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);
  
  const [selectedCategory, setSelectedCategory] = useState(null);
  
  useEffect(() => {
    setSelectedCategory(null);
  }, [officialOnly]);
  
  useAppInstallation({
    activeJobs,
    installedApps,
    showToast,
    refreshApps: fetchAvailableApps,
    onInstallSuccess: () => {
      const discoverIsOpen = modalStack[modalStack.length - 1] === 'discover';
      if (discoverIsOpen) {
        closeModal();
      }
    },
  });
  
  const {
    expandedApp,
    setExpandedApp,
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
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [modalStack, setModalStack] = useState([]);
  
  const openModal = (modalType) => {
    setModalStack(prev => [...prev, modalType]);
  };
  
  const closeModal = () => {
    setModalStack(prev => prev.slice(0, -1));
  };
  
  const discoverModalOpen = modalStack[modalStack.length - 1] === 'discover';
  const createAppTutorialModalOpen = modalStack[modalStack.length - 1] === 'createTutorial';

  const installingApp = useMemo(() => {
    if (!installingAppName) return null;
    const found = availableApps.find(app => app.name === installingAppName);
    if (found) return found;
    return {
      name: installingAppName,
      id: installingAppName,
      description: '',
      url: null,
      source_kind: 'local',
      isInstalled: false,
      extra: {},
    };
  }, [installingAppName, availableApps]);
  
  const activeJobsArray = Array.from(activeJobs.values());
  const installingJob = installingAppName
    ? activeJobsArray.find(job => job.appName === installingAppName)
    : null;

  const categories = useMemo(() => {
    const categoryMap = new Map();
    availableApps.forEach(app => {
      const rootTags = app.extra?.tags || [];
      const cardDataTags = app.extra?.cardData?.tags || [];
      const allTags = [...new Set([...rootTags, ...cardDataTags])];
      const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;
      
      allTags.forEach(tag => {
        if (tag && typeof tag === 'string') {
          if (!tag.startsWith('region:') && 
              tag.toLowerCase() !== 'reachy_mini' && 
              tag.toLowerCase() !== 'reachy-mini' &&
              tag.toLowerCase() !== 'static') {
            if (sdk && tag.toLowerCase() === sdk.toLowerCase()) {
              categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
            } else {
              categoryMap.set(tag, (categoryMap.get(tag) || 0) + 1);
            }
          }
        }
      });
      
      if (sdk && typeof sdk === 'string') {
        const sdkLower = sdk.toLowerCase();
        const hasMatchingTag = allTags.some(tag => 
          tag && typeof tag === 'string' && tag.toLowerCase() === sdkLower
        );
        if (!hasMatchingTag) {
          const sdkCategory = `sdk:${sdk}`;
          categoryMap.set(sdkCategory, (categoryMap.get(sdkCategory) || 0) + 1);
        }
      }
    });
    
    return Array.from(categoryMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, 6);
  }, [availableApps]);

  const filteredApps = useMemo(() => {
    let apps = [...availableApps];
    
    if (selectedCategory) {
      apps = apps.filter(app => {
        const rootTags = app.extra?.tags || [];
        const cardDataTags = app.extra?.cardData?.tags || [];
        const allTags = [...new Set([...rootTags, ...cardDataTags])];
        const sdk = app.extra?.sdk || app.extra?.cardData?.sdk;
        
        if (selectedCategory.startsWith('sdk:')) {
          const sdkCategory = selectedCategory.replace('sdk:', '');
          return sdk === sdkCategory;
        } else {
          const tagMatches = allTags.some(tag => 
            tag && typeof tag === 'string' && tag.toLowerCase() === selectedCategory.toLowerCase()
          );
          const sdkMatches = sdk && typeof sdk === 'string' && sdk.toLowerCase() === selectedCategory.toLowerCase();
          return tagMatches || sdkMatches;
        }
      });
    }
    
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      apps = apps.filter(app => 
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query))
      );
    }
    
    return apps;
  }, [availableApps, searchQuery, selectedCategory]);

  return (
    <>
      <Box>
        <Box
          sx={{
            px: 3,
            py: 1,
            pt: hasQuickActions ? 1 : 0,
            bgcolor: 'transparent',
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
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
        </Box>
        <Box sx={{ px: 0, mb: 0, bgcolor: 'transparent' }}>
          <InstalledAppsSection
            installedApps={installedApps}
            darkMode={effectiveDarkMode}
            expandedApp={expandedApp}
            setExpandedApp={setExpandedApp}
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
        </Box>
      </Box>

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
        totalAppsCount={availableApps.length}
        installedApps={installedApps}
        onOpenCreateTutorial={() => openModal('createTutorial')}
      />

      <CreateAppTutorialModal
        open={createAppTutorialModalOpen}
        onClose={closeModal}
        darkMode={effectiveDarkMode}
      />

      {installingAppName && installingApp && (
        <InstallOverlay
          appInfo={installingApp}
          jobInfo={installingJob || { type: installJobType || 'install', status: 'starting', logs: [] }}
          darkMode={effectiveDarkMode}
          jobType={installJobType || 'install'}
          resultState={installResult}
          installStartTime={installStartTime}
        />
      )}
    </>
  );
}

