import { useState, useEffect, useRef } from 'react';
import useAppStore from '../../../../store/useAppStore';

/**
 * Hook pour gérer toutes les actions sur les apps
 * Extrait de ApplicationStore.jsx pour clarifier la logique
 */
export function useAppHandlers({
  currentApp,
  activeJobs,
  installApp,
  removeApp,
  startApp,
  stopCurrentApp,
  showToast,
  refreshApps, // Callback pour forcer le refresh de la liste
}) {
  const { lockForApp, unlockApp, lockForInstall, unlockInstall, setInstallResult } = useAppStore();
  
  const [expandedApp, setExpandedApp] = useState(null);
  const [appSettings, setAppSettings] = useState({});
  const [startingApp, setStartingApp] = useState(null);
  const notifiedJobs = useRef(new Set());
  const installStartTime = useRef(null); // Track start time for minimum display duration (4s)
  const installJobType = useRef(null); // Track job type (install/remove) pour les messages
  const pendingTimeouts = useRef([]); // Track timeouts pour cleanup

  // Effect to detect completed installations/uninstallations and show a toast
  useEffect(() => {
    if (!showToast) return;
    
    // Iterate through all active jobs
    activeJobs.forEach((job, jobId) => {
      // If the job is completed and not yet notified
      if (job.status === 'completed' && !notifiedJobs.current.has(jobId)) {
        // Mark as notified
        notifiedJobs.current.add(jobId);
        
        // Show success toast
        if (job.type === 'install') {
          showToast(`✅ ${job.appName} installed successfully!`, 'success');
        } else if (job.type === 'remove') {
          showToast(`✅ ${job.appName} uninstalled successfully!`, 'success');
        }
      }
    });
    
    // Clean up refs of jobs that are no longer in activeJobs
    const currentJobIds = new Set(activeJobs.keys());
    notifiedJobs.current.forEach(jobId => {
      if (!currentJobIds.has(jobId)) {
        notifiedJobs.current.delete(jobId);
      }
    });
  }, [activeJobs, showToast]);

  // ✅ Cleanup des timeouts en attente lors du unmount
  useEffect(() => {
    return () => {
      // Nettoyer tous les timeouts en attente
      pendingTimeouts.current.forEach(clearTimeout);
      pendingTimeouts.current = [];
    };
  }, []);

  // ✅ Vérifier si tous les jobs sont terminés pour déverrouiller immédiatement
  useEffect(() => {
    const state = useAppStore.getState();
    const installingAppName = state.installingAppName;
    
    // Si pas d'installation en cours mais qu'il y a encore des jobs, ne rien faire
    if (!installingAppName) {
      // ✅ Si pas d'installation mais qu'il y avait un job, s'assurer que tout est nettoyé
      if (activeJobs.size === 0 && installStartTime.current) {
        console.log('🧹 Cleaning up install state (no active jobs)');
        installStartTime.current = null;
        installJobType.current = null;
      }
      return;
    }
    
    // ✅ Vérifier si tous les jobs d'installation sont terminés
    const hasActiveInstallJobs = Array.from(activeJobs.values()).some(
      job => job.appName === installingAppName && 
             job.status !== 'completed' && 
             job.status !== 'failed'
    );
    
    // Si plus de jobs actifs pour cette app, le job est terminé (même si pas encore nettoyé)
    if (!hasActiveInstallJobs && installStartTime.current) {
      console.log('✅ All install jobs completed for', installingAppName);
      // Le cleanup sera fait par l'autre useEffect qui gère l'overlay
    }
  }, [activeJobs]);
  
  // ✅ Écouter les jobs actifs et gérer le cycle de vie de l'overlay
  // Délai minimum de 4s pour désinstallations + affichage résultat 2s
  useEffect(() => {
    const installingAppName = useAppStore.getState().installingAppName;
    
    // Si pas d'installation en cours, rien à faire
    if (!installingAppName) {
      return;
    }
    
    // Vérifier si le job de l'app en cours est terminé
    let jobFound = null;
    for (const [jobId, job] of activeJobs.entries()) {
      if (job.appName === installingAppName) {
        jobFound = job;
        break;
      }
    }
    
    // Si le job n'existe plus OU s'il est marqué completed/failed
    // ✅ Vérifier aussi si le job a été supprimé (signe qu'il est terminé)
    const jobWasRemoved = !jobFound && installStartTime.current !== null;
    if (jobWasRemoved || (jobFound && (jobFound.status === 'completed' || jobFound.status === 'failed'))) {
      console.log('📦 [RESULT] Job found:', !!jobFound);
      console.log('📦 [RESULT] Job was removed:', jobWasRemoved);
      console.log('📦 [RESULT] Job status:', jobFound?.status);
      console.log('📦 [RESULT] Job logs:', jobFound?.logs);
      
      // ✨ Détection intelligente du succès depuis les logs
      let wasCompleted = false;
      let wasFailed = false;
      
      if (jobFound?.status === 'completed') {
        wasCompleted = true;
      } else if (jobFound?.status === 'failed') {
        wasFailed = true;
      } else if (jobFound?.logs) {
        // Analyser les logs pour détecter le résultat
        const allLogs = jobFound.logs.join(' ');
        const hasSuccess = allLogs.includes('Successfully installed') || 
                          allLogs.includes('Successfully uninstalled') || 
                          allLogs.includes('completed successfully');
        const hasError = allLogs.includes('Failed') || 
                        allLogs.includes('Error:') || 
                        allLogs.includes('error:');
        
        if (hasSuccess) {
          wasCompleted = true;
        } else if (hasError) {
          wasFailed = true;
        } else {
          // Par défaut : succès si le job a disparu proprement
          wasCompleted = true;
        }
      } else {
        // Pas de logs disponibles : considérer comme succès par défaut
        wasCompleted = true;
      }
      
      // Utiliser le type stocké au démarrage (car jobFound peut être undefined)
      const jobType = installJobType.current || 'install';
      const isUninstall = jobType === 'remove';
      
      console.log('📦 [RESULT] Job type:', jobType, 'Completed:', wasCompleted, 'Failed:', wasFailed);
      
      // ⏱️ Calculer le temps minimum d'affichage (4s pour uninstall, 0s pour install)
      const MINIMUM_DISPLAY_TIME = isUninstall ? 4000 : 0;
      const elapsedTime = installStartTime.current ? Date.now() - installStartTime.current : MINIMUM_DISPLAY_TIME;
      const remainingTime = Math.max(0, MINIMUM_DISPLAY_TIME - elapsedTime);
      
      // 🎯 Fonction pour afficher le résultat puis fermer
      const showResultThenClose = () => {
        // 1️⃣ Afficher le résultat dans l'overlay
        setInstallResult(wasCompleted ? 'success' : 'failed');
        
        // ✅ Déverrouiller IMMÉDIATEMENT pour permettre les health checks de reprendre
        // (mais garder l'overlay ouvert pour l'affichage du résultat)
        console.log('🔓 Unlocking install immediately (job completed)');
        unlockInstall();
        
        // 2️⃣ Attendre 2s puis fermer et afficher toast
        const toastTimeout = setTimeout(() => {
          installStartTime.current = null;
          installJobType.current = null;
          
          // Refresh la liste des apps (pour être sûr que l'app installée apparaît)
          if (refreshApps) {
            console.log('🔄 Refreshing apps list after overlay close');
            refreshApps();
          }
          
          // Toast de résultat
          if (showToast) {
            const appName = installingAppName;
            if (wasCompleted) {
              const actionType = isUninstall ? 'uninstalled' : 'installed';
              showToast(`✅ ${appName} ${actionType} successfully`, 'success');
            } else if (wasFailed) {
              const actionType = isUninstall ? 'uninstall' : 'install';
              showToast(`❌ Failed to ${actionType} ${appName}`, 'error');
            }
          }
        }, 2000);
        
        pendingTimeouts.current.push(toastTimeout);
      };
      
      // Attendre le délai minimum si nécessaire
      if (remainingTime > 0) {
        const delayTimeout = setTimeout(showResultThenClose, remainingTime);
        pendingTimeouts.current.push(delayTimeout);
      } else {
        showResultThenClose();
      }
    }
  }, [activeJobs, unlockInstall, showToast, setInstallResult]);

  const handleInstall = async (appInfo) => {
    try {
      // ✅ Verrouiller avec le type de job
      lockForInstall(appInfo.name, 'install');
      installStartTime.current = Date.now();
      installJobType.current = 'install'; // 📝 Backup local
      
      // Lancer l'installation (retourne job_id, ne bloque pas)
      await installApp(appInfo);
      
      // Note: Le déverrouillage et les toasts de fin sont gérés par useEffect
      // qui écoute activeJobs et détecte quand le job se termine
    } catch (err) {
      console.error('Failed to install:', err);
      
      // ✅ Erreur au démarrage : reset tout
      installStartTime.current = null;
      installJobType.current = null;
      setInstallResult(null);
      unlockInstall();
      
      // Message utilisateur spécifique pour les erreurs de permission
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const message = err.userFriendly 
          ? err.message 
          : `🔒 ${appInfo.name}: System permission required. Please accept the permission dialog if it appears.`;
        
        if (showToast) {
          showToast(message, 'warning'); // Utiliser 'warning' au lieu de 'error' pour les permissions
        }
      } else {
        // Erreur standard
        if (showToast) {
          showToast(`❌ Failed to start install ${appInfo.name}: ${err.message}`, 'error');
        }
      }
    }
  };
  
  const handleUninstall = async (appName) => {
    try {
      // ✅ Verrouiller avec le type de job
      lockForInstall(appName, 'remove');
      installStartTime.current = Date.now();
      installJobType.current = 'remove'; // 📝 Backup local
      
      await removeApp(appName);
      setExpandedApp(null);
      
      // Note: Le déverrouillage et les toasts de fin sont gérés par useEffect
      // qui écoute activeJobs et détecte quand le job se termine
    } catch (err) {
      console.error('Failed to uninstall:', err);
      
      // ✅ Erreur au démarrage : reset tout
      installStartTime.current = null;
      installJobType.current = null;
      setInstallResult(null);
      unlockInstall();
      
      // Message utilisateur spécifique pour les erreurs de permission
      if (err.name === 'PermissionDeniedError' || err.name === 'SystemPopupTimeoutError') {
        const message = err.userFriendly 
          ? err.message 
          : `🔒 ${appName}: System permission required. Please accept the permission dialog if it appears.`;
        
        if (showToast) {
          showToast(message, 'warning');
        }
      } else {
        if (showToast) {
          showToast(`❌ Failed to start uninstall ${appName}: ${err.message}`, 'error');
        }
      }
    }
  };
  
  const handleStartApp = async (appName) => {
    try {
      // ✅ Vérifier si le robot est occupé (quick action en cours)
      if (useAppStore.getState().isCommandRunning) {
        showToast('⚠️ Please wait for the current action to finish', 'warning');
        console.warn(`⚠️ Cannot start ${appName}: quick action is running`);
        return;
      }
      
      // Check if another app is already running
      if (currentApp && currentApp.info && currentApp.info.name !== appName) {
        const shouldStop = window.confirm(`${currentApp.info.name} is currently running. Stop it and launch ${appName}?`);
        if (!shouldStop) return;
        
        // Stop the current app
        await stopCurrentApp();
        unlockApp(); // Déverrouiller
        // Wait a bit for the app to stop
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      setStartingApp(appName);
      console.log(`▶️ Launching ${appName}...`);
      const result = await startApp(appName);
      console.log(`✅ ${appName} started successfully:`, result.state);
      
      // ✅ Verrouiller pour empêcher les quick actions
      lockForApp(appName);
      
      setStartingApp(null);
    } catch (err) {
      console.error(`❌ Failed to start ${appName}:`, err);
      setStartingApp(null);
      unlockApp(); // S'assurer de déverrouiller en cas d'erreur
      alert(`Failed to start app: ${err.message}`);
    }
  };
  
  const updateAppSetting = (appName, key, value) => {
    setAppSettings(prev => ({
      ...prev,
      [appName]: {
        ...prev[appName],
        [key]: value,
      },
    }));
    // TODO: Call API to save settings (if available)
  };
  
  // Check if an app is being installed/removed
  const isJobRunning = (appName, jobType) => {
    for (const [jobId, job] of activeJobs.entries()) {
      if (job.appName === appName && job.type === jobType) {
        return true;
      }
    }
    return false;
  };
  
  // Get job info (status + logs)
  const getJobInfo = (appName, jobType) => {
    for (const [jobId, job] of activeJobs.entries()) {
      if (job.appName === appName && job.type === jobType) {
        return job;
      }
    }
    return null;
  };

  return {
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
    stopCurrentApp,
  };
}

