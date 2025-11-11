import { useState, useEffect, useCallback, useRef } from 'react';
import useAppStore from '../store/useAppStore';
import { DAEMON_CONFIG, fetchWithTimeout, buildApiUrl } from '../config/daemon';

/**
 * Hook pour gérer les applications (liste, installation, lancement)
 * Intégré avec l'API FastAPI du daemon Reachy
 */
export function useApps(isActive) {
  const appStore = useAppStore();
  const { addFrontendLog } = appStore; // ⚡ Déstructurer pour compatibilité
  const [availableApps, setAvailableApps] = useState([]);
  const [installedApps, setInstalledApps] = useState([]);
  const [currentApp, setCurrentApp] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Jobs en cours (installations/désinstallations)
  const [activeJobs, setActiveJobs] = useState(new Map()); // job_id -> { type: 'install'/'remove', appName, status, logs }
  const jobPollingIntervals = useRef(new Map());
  
  /**
   * Fetch toutes les apps disponibles
   */
  const fetchAvailableApps = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/list-available'),
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true } // ⚡ Polling silencieux
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch apps: ${response.status}`);
      }
      
      const apps = await response.json();
      setAvailableApps(apps);
      
      // Séparer les apps installées et enrichir avec les métadonnées des spaces HF
      const installed = apps.filter(app => app.source_kind === 'installed');
      
      // Enrichir les apps installées avec les métadonnées des apps HF correspondantes
      const enrichedInstalled = installed.map(installedApp => {
        const hfApp = apps.find(app => 
          app.name === installedApp.name && app.source_kind === 'hf_space'
        );
        
        // Fusionner : garder les infos de l'app installée, enrichir avec extra de HF
        return {
          ...installedApp,
          extra: hfApp?.extra || installedApp.extra,
          description: installedApp.description || hfApp?.description,
          url: installedApp.url || hfApp?.url,
        };
      });
      
      setInstalledApps(enrichedInstalled);
      
      console.log('📦 Apps fetched:', apps.length, 'available,', enrichedInstalled.length, 'installed');
      return apps;
    } catch (err) {
      console.error('❌ Failed to fetch apps:', err);
      setError(err.message);
      return [];
    }
  }, []);
  
  /**
   * Fetch le statut d'un job (install/remove)
   */
  const fetchJobStatus = useCallback(async (jobId) => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/job-status/${encodeURIComponent(jobId)}`),
        {},
        DAEMON_CONFIG.TIMEOUTS.JOB_STATUS,
        { silent: true } // ⚡ Polling job status silencieux
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch job status: ${response.status}`);
      }
      
      const jobStatus = await response.json();
      console.log(`📊 Job ${jobId} status:`, jobStatus);
      return jobStatus;
    } catch (err) {
      console.error('❌ Failed to fetch job status:', err);
      return null;
    }
  }, []);
  
  /**
   * Arrêter le polling d'un job
   */
  const stopJobPolling = useCallback((jobId) => {
    const interval = jobPollingIntervals.current.get(jobId);
    if (interval) {
      clearInterval(interval);
      jobPollingIntervals.current.delete(jobId);
      console.log('⏱️ Stop polling job:', jobId);
    }
  }, []);
  
  /**
   * Démarrer le polling d'un job
   */
  const startJobPolling = useCallback((jobId) => {
    // Éviter les doublons
    if (jobPollingIntervals.current.has(jobId)) {
      console.warn('⚠️ Polling already active for job:', jobId);
      return;
    }
    
    console.log('⏱️ Start polling job:', jobId);
    
    const pollJob = async () => {
      // Vérifier si le polling est toujours actif (peut avoir été arrêté)
      if (!jobPollingIntervals.current.has(jobId)) {
        return; // Polling arrêté, ne pas continuer
      }
      
      const jobStatus = await fetchJobStatus(jobId);
      
      if (!jobStatus) {
        // Job pas trouvé : incrémenter le compteur d'échecs
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const failCount = (job.fetchFailCount || 0) + 1;
          
          // Arrêter seulement après N tentatives ratées
          if (failCount > DAEMON_CONFIG.CRASH_DETECTION.JOB_MAX_FAILS) {
            console.warn(`⚠️ Job ${jobId} polling failed after ${failCount} attempts (network timeout), marking as failed`);
            stopJobPolling(jobId);
            
            // ⚡ Logger dans le LogConsole
            if (job.appName) {
              addFrontendLog(`❌ ${job.type === 'install' ? 'Install' : 'Uninstall'} ${job.appName} TIMEOUT - Daemon non responsive`);
            }
            
            // Marquer le job comme failed au lieu de le supprimer
            const updated = new Map(prev);
            updated.set(jobId, {
              ...job,
              status: 'failed',
              logs: [...(job.logs || []), '❌ Installation timed out - Network error or daemon overloaded'],
              fetchFailCount: failCount,
            });
            
            // Cleanup après un délai pour que l'utilisateur voie l'erreur
            setTimeout(() => {
              setActiveJobs(prevJobs => {
                const clean = new Map(prevJobs);
                clean.delete(jobId);
                return clean;
              });
            }, DAEMON_CONFIG.CRASH_DETECTION.JOB_CLEANUP_DELAY);
            
            return updated;
          }
          
          // Sinon, garder le job et incrémenter le compteur
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            fetchFailCount: failCount,
          });
          return updated;
        });
        return;
      }
      
      // Si job terminé, arrêter IMMÉDIATEMENT avant de mettre à jour le state
      // Détecter aussi la fin via les logs si l'API ne retourne pas status:"completed"
      const logsText = (jobStatus.logs || []).join('\n').toLowerCase();
      const isSuccessInLogs = logsText.includes('completed successfully') || 
                              logsText.includes("job 'install' completed") || 
                              logsText.includes("job 'remove' completed");
      const isFinished = jobStatus.status === 'completed' || jobStatus.status === 'failed' || isSuccessInLogs;
      
      if (isFinished) {
        stopJobPolling(jobId);
        const finalStatus = jobStatus.status === 'failed' ? 'failed' : 'completed';
        console.log(`${finalStatus === 'completed' ? '✅' : '❌'} Job ${jobId} finished:`, finalStatus, isSuccessInLogs ? '(detected from logs)' : '(from status field)');
        
        // ⚡ Logger dans le LogConsole visible
        const jobInfo = activeJobs.get(jobId);
        if (jobInfo) {
          if (finalStatus === 'failed') {
            console.error('❌ Job failed with logs:', jobStatus.logs);
            const errorSummary = jobStatus.logs?.slice(-2).join(' | ') || 'Unknown error';
            addFrontendLog(`❌ ${jobInfo.type === 'install' ? 'Install' : 'Uninstall'} ${jobInfo.appName} FAILED: ${errorSummary}`);
          } else {
            addFrontendLog(`✓ ${jobInfo.type === 'install' ? 'Installed' : 'Uninstalled'} ${jobInfo.appName}`);
          }
        }
        
        // Forcer le status à "completed" si détecté dans les logs
        jobStatus.status = finalStatus;
      }
      
      // Mettre à jour le job dans activeJobs
      setActiveJobs(prev => {
        const job = prev.get(jobId);
        if (!job) return prev;
        
        const updated = new Map(prev);
        const newLogs = jobStatus.logs || [];
        const oldLogs = job.logs || [];
        
        // Logger les nouvelles lignes (seulement si pas déjà loggées)
        if (newLogs.length > oldLogs.length) {
          const newLines = newLogs.slice(oldLogs.length);
          newLines.forEach(line => {
            console.log(`📦 [${job.type}/${job.appName}] ${line}`);
          });
        }
        
        updated.set(jobId, {
          ...job,
          status: jobStatus.status,
          logs: newLogs,
          fetchFailCount: 0,
        });
        return updated;
      });
      
      // Si terminé, marquer comme terminé IMMÉDIATEMENT puis cleanup
      if (isFinished) {
        // Marquer le job comme terminé (change le status)
        setActiveJobs(prev => {
          const job = prev.get(jobId);
          if (!job) return prev;
          
          const updated = new Map(prev);
          updated.set(jobId, {
            ...job,
            status: jobStatus.status, // "completed" ou "failed"
          });
          return updated;
        });
        
        // Refresh la liste après un court délai (laisser le daemon mettre à jour sa DB)
        setTimeout(() => {
          console.log('🔄 Refreshing apps list after job completion');
          fetchAvailableApps();
        }, 500);
        
        // Retirer le job : très rapide si succès, 8s si échec (pour voir l'erreur)
        const delay = jobStatus.status === 'failed' ? 8000 : 100;
        setTimeout(() => {
          setActiveJobs(prev => {
            const updated = new Map(prev);
            updated.delete(jobId);
            return updated;
          });
        }, delay);
      }
    };
    
    // Polling du job
    const interval = setInterval(pollJob, DAEMON_CONFIG.INTERVALS.JOB_POLLING);
    jobPollingIntervals.current.set(jobId, interval);
    
    // Premier poll immédiat
    pollJob();
  }, [fetchJobStatus, fetchAvailableApps, stopJobPolling]);
  
  /**
   * Installer une app (retourne job_id)
   */
  const installApp = useCallback(async (appInfo) => {
    try {
      console.log('📥 Installing app:', appInfo.name);
      
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/install'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appInfo),
        },
        DAEMON_CONFIG.TIMEOUTS.APP_INSTALL,
        { label: `Install ${appInfo.name}` } // ⚡ Log automatique
      );
      
      if (!response.ok) {
        throw new Error(`Installation failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('📦 Install API response:', result);
      
      // Le résultat peut être {"job_id": "xxx"} ou {"uuid": ...}
      const jobId = result.job_id || Object.keys(result)[0];
      
      if (!jobId) {
        throw new Error('No job_id returned from API');
      }
      
      console.log('✅ Installation started, job_id:', jobId);
      
      // Ajouter le job au tracking
      setActiveJobs(prev => new Map(prev).set(jobId, {
        type: 'install',
        appName: appInfo.name,
        appInfo,
        status: 'running', // Démarrer directement en "running" pour l'UI
        logs: [],
      }));
      
      // Démarrer le polling du job
      startJobPolling(jobId);
      
      return jobId;
    } catch (err) {
      console.error('❌ Installation error:', err);
      addFrontendLog(`❌ Failed to start install ${appInfo.name}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [startJobPolling, addFrontendLog]);
  
  /**
   * Désinstaller une app (retourne job_id)
   */
  const removeApp = useCallback(async (appName) => {
    try {
      console.log('🗑️ Removing app:', appName);
      
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/remove/${encodeURIComponent(appName)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_REMOVE,
        { label: `Uninstall ${appName}` } // ⚡ Log automatique
      );
      
      if (!response.ok) {
        throw new Error(`Removal failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('📦 Remove API response:', result);
      
      // Le résultat peut être {"job_id": "xxx"} ou {"uuid": ...}
      const jobId = result.job_id || Object.keys(result)[0];
      
      if (!jobId) {
        throw new Error('No job_id returned from API');
      }
      
      console.log('✅ Removal started, job_id:', jobId);
      
      // Ajouter le job au tracking
      setActiveJobs(prev => new Map(prev).set(jobId, {
        type: 'remove',
        appName,
        status: 'running', // Démarrer directement en "running" pour l'UI
        logs: [],
      }));
      
      // Démarrer le polling du job
      startJobPolling(jobId);
      
      return jobId;
    } catch (err) {
      console.error('❌ Removal error:', err);
      addFrontendLog(`❌ Failed to start uninstall ${appName}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [startJobPolling, addFrontendLog]);
  
  /**
   * Fetch le statut de l'app en cours
   */
  const fetchCurrentAppStatus = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/current-app-status'),
        {},
        DAEMON_CONFIG.TIMEOUTS.APPS_LIST,
        { silent: true } // ⚡ Polling silencieux
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch current app: ${response.status}`);
      }
      
      const status = await response.json();
      
      // Si pas d'app en cours, l'API retourne probablement null ou un objet vide
      if (status && status.info) {
        setCurrentApp(status);
      } else {
        setCurrentApp(null);
      }
      
      return status;
    } catch (err) {
      // Pas d'erreur si pas d'app en cours
      setCurrentApp(null);
      return null;
    }
  }, []);
  
  /**
   * Lancer une app
   */
  const startApp = useCallback(async (appName) => {
    try {
      console.log('▶️ Starting app:', appName);
      
      const response = await fetchWithTimeout(
        buildApiUrl(`/api/apps/start-app/${encodeURIComponent(appName)}`),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_START,
        { label: `Start ${appName}` } // ⚡ Log automatique
      );
      
      if (!response.ok) {
        throw new Error(`Failed to start app: ${response.status}`);
      }
      
      const status = await response.json();
      console.log('✅ App started:', status);
      
      // Refresh current app status
      fetchCurrentAppStatus();
      
      return status;
    } catch (err) {
      console.error('❌ Failed to start app:', err);
      addFrontendLog(`❌ Failed to start ${appName}: ${err.message}`);
      setError(err.message);
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog]);
  
  /**
   * Arrêter l'app en cours
   */
  const stopCurrentApp = useCallback(async () => {
    try {
      console.log('⏹️ Stopping current app');
      
      const response = await fetchWithTimeout(
        buildApiUrl('/api/apps/stop-current-app'),
        { method: 'POST' },
        DAEMON_CONFIG.TIMEOUTS.APP_STOP,
        { label: 'Stop current app' } // ⚡ Log automatique
      );
      
      if (!response.ok) {
        throw new Error(`Failed to stop app: ${response.status}`);
      }
      
      const message = await response.json();
      console.log('✅ App stopped:', message);
      
      // Réinitialiser immédiatement l'état
      setCurrentApp(null);
      
      // ✅ Déverrouiller le robot pour permettre les quick actions
      useAppStore.getState().unlockApp();
      
      // Refresh pour vérifier
      setTimeout(() => fetchCurrentAppStatus(), DAEMON_CONFIG.INTERVALS.CURRENT_APP_REFRESH);
      
      return message;
    } catch (err) {
      console.error('❌ Failed to stop app:', err);
      addFrontendLog(`❌ Failed to stop app: ${err.message}`);
      setError(err.message);
      // ✅ S'assurer de déverrouiller même en cas d'erreur
      useAppStore.getState().unlockApp();
      throw err;
    }
  }, [fetchCurrentAppStatus, addFrontendLog]);
  
  /**
   * Cleanup : arrêter tous les pollings au démontage
   */
  useEffect(() => {
    return () => {
      jobPollingIntervals.current.forEach((interval) => clearInterval(interval));
      jobPollingIntervals.current.clear();
    };
  }, []);
  
  /**
   * Fetch initial + polling du statut de l'app en cours
   */
  useEffect(() => {
    if (!isActive) return;
    
    // Fetch initial
    fetchAvailableApps();
    fetchCurrentAppStatus();
    
    // Polling du statut de l'app en cours
    const interval = setInterval(fetchCurrentAppStatus, DAEMON_CONFIG.INTERVALS.APP_STATUS);
    
    return () => clearInterval(interval);
  }, [isActive, fetchAvailableApps, fetchCurrentAppStatus]);
  
  return {
    // Data
    availableApps,
    installedApps,
    currentApp,
    activeJobs, // Map de job_id -> job info
    isLoading,
    error,
    
    // Actions
    fetchAvailableApps,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchCurrentAppStatus,
  };
}

