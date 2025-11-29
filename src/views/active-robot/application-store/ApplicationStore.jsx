import React, { useState, useMemo, useEffect } from 'react';
import { Box, Typography, IconButton, Button, ButtonGroup, Accordion, AccordionSummary, AccordionDetails, Tooltip, Chip } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import ReachyBox from '../../../assets/reachy-update-box.svg';
import useAppStore from '../../../store/useAppStore';
import { useApps, useAppHandlers, useAppInstallation } from '../../../hooks/apps';
import { Section as InstalledAppsSection } from './installed';
import { Modal as DiscoverModal } from './discover';
import { CreateAppTutorial as CreateAppTutorialModal } from './modals';
import { Overlay as InstallOverlay } from './installation';
import { Pad as QuickActionsPad, Donut as QuickActionsDonut } from './quick-actions';
import RobotPositionControl from '../position-control';
import { useGamepadConnected, useActiveDevice } from '../../../utils/InputManager';
import { useWindowFocus } from '../../../hooks/system/useWindowFocus';

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
  
  // Ref to store the reset function from RobotPositionControl
  const positionControlResetRef = React.useRef(null);
  // State to track if robot is at initial position
  const [isAtInitialPosition, setIsAtInitialPosition] = React.useState(true);
  
  // Check if gamepad is connected and which device is active
  const isGamepadConnected = useGamepadConnected();
  const activeDevice = useActiveDevice();
  const hasWindowFocus = useWindowFocus();
  
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
  
  // ✅ REFACTORED: Separate hooks for different responsibilities
  
  // Hook to manage installation lifecycle (tracking, overlay, completion)
  useAppInstallation({
    activeJobs,
    installedApps,
    showToast,
    refreshApps: fetchAvailableApps,
    onInstallSuccess: () => {
      // Close discover modal when installation succeeds
      const discoverIsOpen = modalStack[modalStack.length - 1] === 'discover';
      if (discoverIsOpen) {
        closeModal();
      }
    },
  });
  
  // Hook to manage app actions (install, uninstall, start)
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

  // ✅ Get installing app info (with fallback if not in list yet)
  const installingApp = useMemo(() => {
    if (!installingAppName) return null;
    
    // Try to find in available apps first
    const found = availableApps.find(app => app.name === installingAppName);
    if (found) return found;
    
    // Fallback: Create minimal app object
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
  
  
  // Retrieve the current installation job - Convert Map to array
  const activeJobsArray = Array.from(activeJobs.values());
  const installingJob = installingAppName
    ? activeJobsArray.find(job => job.appName === installingAppName)
    : null;

  // Extract available categories from apps with counts
  const categories = useMemo(() => {
    const categoryMap = new Map(); // category -> count
    
    availableApps.forEach(app => {
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
  }, [availableApps]);

  // Filter available apps based on search and category
  const filteredApps = useMemo(() => {
    // Start with all available apps (including installed ones)
    let apps = [...availableApps];
    
    // Filter by category FIRST
    if (selectedCategory) {
      const beforeCount = apps.length;
      apps = apps.filter(app => {
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
          // Check if tag matches (case-insensitive), or if SDK matches the tag (for merged categories)
          const tagMatches = allTags.some(tag => 
            tag && typeof tag === 'string' && tag.toLowerCase() === selectedCategory.toLowerCase()
          );
          const sdkMatches = sdk && typeof sdk === 'string' && sdk.toLowerCase() === selectedCategory.toLowerCase();
          return tagMatches || sdkMatches;
        }
      });
      const afterCount = apps.length;
      console.log(`🔍 Category filter "${selectedCategory}": ${beforeCount} → ${afterCount} apps`);
    }
    
    // Filter by search query AFTER category filter
    if (searchQuery && searchQuery.trim()) {
      const beforeCount = apps.length;
      const query = searchQuery.toLowerCase().trim();
      apps = apps.filter(app => 
        app.name.toLowerCase().includes(query) ||
        (app.description && app.description.toLowerCase().includes(query))
      );
      const afterCount = apps.length;
      console.log(`🔍 Search filter "${searchQuery}": ${beforeCount} → ${afterCount} apps`);
    }
    
    console.log(`📊 Final filteredApps: ${apps.length} apps (total available: ${availableApps.length})`);
    return apps;
  }, [availableApps, searchQuery, selectedCategory]);

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
      {/* Emotion Wheel Section - Accordion */}
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
            <QuickActionsDonut
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

      {/* Quick Actions Section - Accordion */}
      {/* {quickActions.length > 0 && handleQuickAction && (
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
      )} */}

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
            {!isAtInitialPosition && (
              <Tooltip title="Reset all position controls" arrow>
                <IconButton 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent accordion from closing
                    if (positionControlResetRef.current) {
                      positionControlResetRef.current();
                    }
                  }}
                  disabled={!effectiveIsActive || isBusy}
                  sx={{ 
                    ml: 0.75,
                    color: effectiveDarkMode ? '#888' : '#999',
                    '&:hover': {
                      color: '#FF9500',
                      bgcolor: effectiveDarkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                    }
                  }}
                >
                  <RefreshIcon sx={{ fontSize: 16, color: effectiveDarkMode ? '#888' : '#999' }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip 
              title={
                <Box sx={{ p: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 1, color: '#fff' }}>
                    API Documentation
                  </Typography>
                  <Typography sx={{ fontSize: 11, mb: 1, color: '#f0f0f0', lineHeight: 1.6 }}>
                    <strong>Endpoint:</strong> POST /api/move/set_target
                  </Typography>
                  <Typography sx={{ fontSize: 11, mb: 1, color: '#f0f0f0', lineHeight: 1.6 }}>
                    <strong>Request Body:</strong>
                  </Typography>
                  <Box component="pre" sx={{ fontSize: 10, mb: 1, color: '#e0e0e0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', bgcolor: 'rgba(0,0,0,0.3)', p: 1, borderRadius: 1 }}>
{`{
  "target_head_pose": {
    "x": float,    // Position X (m), range: -0.05 to 0.05
    "y": float,    // Position Y (m), range: -0.05 to 0.05
    "z": float,    // Position Z/Height (m), range: -0.05 to 0.05
    "pitch": float, // Rotation pitch (rad), range: -0.8 to 0.8
    "yaw": float,   // Rotation yaw (rad), range: -1.2 to 1.2
    "roll": float   // Rotation roll (rad), range: -0.5 to 0.5
  },
  "target_antennas": [float, float], // [left, right] (rad), range: -π to π
  "target_body_yaw": float           // Body rotation (rad), range: -160° to 160°
}`}
                  </Box>
                  <Typography sx={{ fontSize: 11, mb: 0.5, color: '#f0f0f0', lineHeight: 1.6 }}>
                    <strong>Controls:</strong>
                  </Typography>
                  <Typography sx={{ fontSize: 10, mb: 1, color: '#e0e0e0', lineHeight: 1.6 }}>
                    • Drag joysticks/sliders for continuous movement<br/>
                    • Release to send final position<br/>
                    • All movements use set_target (no interpolation)<br/>
                    • Controls disabled when movements are active
                  </Typography>
                </Box>
              }
              arrow 
              placement="right"
              componentsProps={{
                tooltip: {
                  sx: {
                    maxWidth: 420,
                    bgcolor: 'rgba(26, 26, 26, 0.98)',
                    border: '1px solid rgba(255, 149, 0, 0.3)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                  }
                },
                arrow: {
                  sx: {
                    color: 'rgba(26, 26, 26, 0.98)',
                  }
                }
              }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 16, color: effectiveDarkMode ? '#888' : '#999', cursor: 'help', ml: 0.75 }} />
            </Tooltip>
            {/* Input device indicator - only show if gamepad is connected */}
            {isGamepadConnected && (
              <Tooltip 
                title={activeDevice === 'gamepad' && hasWindowFocus
                  ? 'Gamepad active' 
                  : 'Gamepad connected'}
              >
                <Chip
                  icon={<SportsEsportsIcon />}
                  label=""
                  size="small"
                  color={activeDevice === 'gamepad' && hasWindowFocus ? 'primary' : 'default'}
                  sx={{
                    height: 20,
                    width: 20,
                    minWidth: 20,
                    ml: 0.5,
                    opacity: hasWindowFocus ? 1 : 0.4, // Gray out when window loses focus
                    bgcolor: effectiveDarkMode 
                      ? (activeDevice === 'gamepad' && hasWindowFocus
                          ? 'rgba(255, 149, 0, 0.2)' 
                          : 'rgba(255, 255, 255, 0.05)')
                      : (activeDevice === 'gamepad' && hasWindowFocus
                          ? 'rgba(255, 149, 0, 0.15)'
                          : 'rgba(0, 0, 0, 0.05)'),
                    border: `1px solid ${effectiveDarkMode 
                      ? (activeDevice === 'gamepad' && hasWindowFocus
                          ? 'rgba(255, 149, 0, 0.3)' 
                          : 'rgba(255, 255, 255, 0.1)')
                      : (activeDevice === 'gamepad' && hasWindowFocus
                          ? 'rgba(255, 149, 0, 0.3)'
                          : 'rgba(0, 0, 0, 0.1)')}`,
                    '& .MuiChip-icon': {
                      fontSize: '0.9rem',
                      color: effectiveDarkMode 
                        ? (activeDevice === 'gamepad' && hasWindowFocus
                            ? '#FF9500' 
                            : 'rgba(255, 255, 255, 0.6)')
                        : (activeDevice === 'gamepad' && hasWindowFocus
                            ? '#FF9500'
                            : 'rgba(0, 0, 0, 0.6)'),
                      margin: 0,
                    },
                    '& .MuiChip-label': {
                      display: 'none',
                    },
                  }}
                />
              </Tooltip>
            )}
            {!isAtInitialPosition && (
              <Tooltip title="Reset all position controls" arrow>
                <IconButton 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent accordion from closing
                    if (positionControlResetRef.current) {
                      positionControlResetRef.current();
                    }
                  }}
                  disabled={!effectiveIsActive || effectiveIsBusy}
                  sx={{ 
                    ml: 0.5,
                    color: effectiveDarkMode ? '#888' : '#999',
                    '&:hover': {
                      color: '#FF9500',
                      bgcolor: effectiveDarkMode ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255, 149, 0, 0.05)',
                    }
                  }}
                >
                  <RefreshIcon sx={{ fontSize: 16, color: effectiveDarkMode ? '#888' : '#999' }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 0, pt: 0, pb: 3, bgcolor: 'transparent !important', backgroundColor: 'transparent !important' }}>
          <RobotPositionControl
            isActive={effectiveIsActive}
            darkMode={effectiveDarkMode}
            onResetReady={(resetFn) => {
              positionControlResetRef.current = resetFn;
            }}
            onIsAtInitialPosition={(isAtInitial) => {
              setIsAtInitialPosition(isAtInitial);
            }}
          />
        </AccordionDetails>
      </Accordion>

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
        totalAppsCount={availableApps.length}
        installedApps={installedApps}
        onOpenCreateTutorial={() => openModal('createTutorial')}
      />

      {/* Create App Tutorial Modal */}
      <CreateAppTutorialModal
        open={createAppTutorialModalOpen}
        onClose={closeModal}
        darkMode={effectiveDarkMode}
      />

      {/* Fullscreen overlay for installations */}
      {/* ✅ Show overlay if installingAppName is set (even if app not found in availableApps) */}
      {installingAppName && installingApp && (
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
