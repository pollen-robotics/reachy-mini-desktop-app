# Rapport d'Analyse : Problème de Connexion WiFi lors de la Première Configuration

**Date** : Analyse effectuée après tests utilisateur  
**Problème** : Le Reachy ne se connecte pas au WiFi configuré et reste en mode hotspot après la configuration

---

## 🔍 Problèmes Identifiés

### 1. **Connexion Asynchrone sans Vérification** ⚠️ CRITIQUE

**Fichier** : `reachy_mini/src/reachy_mini/daemon/app/routers/wifi_config.py` (lignes 108-138)

**Problème** :
- L'endpoint `/wifi/connect` lance la connexion dans un **thread séparé** (`Thread(target=connect).start()`)
- L'API retourne **immédiatement** un `200 OK` sans attendre que la connexion soit réellement établie
- Il y a un **TODO** explicite : `# TODO: wait for it to be really connected` (ligne 138)

**Impact** :
- L'UI pense que la connexion a réussi alors qu'elle est peut-être encore en cours ou a échoué
- Le flow passe à l'étape suivante (Step 4: Reconnecting) alors que le Reachy est peut-être encore en hotspot

**Code concerné** :
```python
@router.post("/connect")
def connect_to_wifi_network(ssid: str, password: str) -> None:
    def connect() -> None:
        global error
        with busy_lock:
            try:
                error = None
                setup_wifi_connection(name=ssid, ssid=ssid, password=password)
            except Exception as e:
                error = e
                logger.error(f"Failed to connect to WiFi network '{ssid}': {e}")
                logger.info("Reverting to hotspot...")
                remove_connection(name=ssid)
                setup_wifi_connection(
                    name="Hotspot",
                    ssid=HOTSPOT_SSID,
                    password=HOTSPOT_PASSWORD,
                    is_hotspot=True,
                )

    Thread(target=connect).start()  # ⚠️ Retourne immédiatement
    # TODO: wait for it to be really connected  # ⚠️ TODO non implémenté
```

---

### 2. **Revert Automatique au Hotspot en Cas d'Erreur** ⚠️ CRITIQUE

**Fichier** : `reachy_mini/src/reachy_mini/daemon/app/routers/wifi_config.py` (lignes 127-135)

**Problème** :
- Si la connexion échoue (mauvais mot de passe, réseau non trouvé, etc.), le daemon **revient automatiquement au hotspot**
- L'erreur est stockée dans une variable globale `error` mais n'est **pas retournée** à l'API
- L'UI ne sait pas que la connexion a échoué

**Impact** :
- Si le réseau "ap" n'est pas détecté par le scan ou si le mot de passe est incorrect, le Reachy revient silencieusement au hotspot
- L'utilisateur pense que la connexion a réussi alors qu'elle a échoué
- Le flow continue comme si tout allait bien

**Code concerné** :
```python
except Exception as e:
    error = e
    logger.error(f"Failed to connect to WiFi network '{ssid}': {e}")
    logger.info("Reverting to hotspot...")  # ⚠️ Revient au hotspot automatiquement
    remove_connection(name=ssid)
    setup_wifi_connection(
        name="Hotspot",
        ssid=HOTSPOT_SSID,
        password=HOTSPOT_PASSWORD,
        is_hotspot=True,
    )
```

---

### 3. **Scan WiFi Limité en Mode Hotspot** ⚠️ MAJEUR

**Fichier** : `reachy_mini/src/reachy_mini/daemon/app/routers/wifi_config.py` (lignes 141-149)

**Problème** :
- Quand le Reachy est en mode hotspot, il ne peut **pas scanner d'autres réseaux WiFi** (limitation matérielle/logique)
- Le scan utilise `nmcli.device.wifi()` qui ne peut pas voir d'autres réseaux quand `wlan0` est en mode AP
- Le réseau "ap" n'apparaît donc **pas dans la liste** même s'il existe

**Impact** :
- L'utilisateur doit taper le SSID manuellement (ce qui est possible via le champ texte)
- Mais si le réseau n'est pas visible par le scan, `nmcli.device.wifi_connect()` peut échouer silencieusement
- Le daemon revient alors au hotspot sans informer l'utilisateur

**Code concerné** :
```python
@router.post("/scan_and_list")
def scan_wifi() -> list[str]:
    """Scan for available WiFi networks ordered by signal power."""
    wifi = scan_available_wifi()  # ⚠️ Ne peut pas scanner en mode hotspot
    # ...
```

**Note** : C'est une limitation connue - quand un Raspberry Pi est en mode hotspot, il ne peut pas scanner d'autres réseaux simultanément.

---

### 4. **Pas de Vérification de l'État de Connexion** ⚠️ MAJEUR

**Fichier** : `tauri-app/src/components/wifi/WiFiConfiguration.jsx` (lignes 150-198)

**Problème** :
- Après avoir appelé `/wifi/connect`, l'UI attend 5 secondes puis refresh le status
- Mais elle ne **vérifie pas** si la connexion a réellement réussi
- Elle affiche "Successfully connected" même si le Reachy est resté en hotspot

**Impact** :
- L'utilisateur pense que la connexion a réussi
- Le flow passe à Step 4 (Reconnecting) alors que le Reachy est toujours en hotspot
- Le Reachy ne sera jamais détecté sur le réseau local car il est toujours en hotspot

**Code concerné** :
```javascript
if (response.ok) {
    setSuccessMessage(`Successfully connected to ${ssidToUse}`);  // ⚠️ Trop optimiste
    // ...
    // Refresh status after network change
    setTimeout(fetchWifiStatus, 5000);  // ⚠️ Attend 5s mais ne vérifie pas vraiment
}
```

---

### 5. **Pas de Polling de l'État de Connexion** ⚠️ MOYEN

**Fichier** : `tauri-app/src/views/first-time-wifi-setup/FirstTimeWifiSetupView.jsx`

**Problème** :
- Après Step 3 (Configure WiFi), le flow passe à Step 4 (Reconnecting)
- Step 4 attend que le Reachy soit détecté sur le réseau local via `useRobotDiscovery()`
- Mais si le Reachy est resté en hotspot, il ne sera **jamais détecté** sur le réseau local
- Il n'y a **pas de timeout** ou de message d'erreur si le Reachy n'est pas trouvé

**Impact** :
- L'utilisateur reste bloqué sur Step 4 indéfiniment
- Pas de feedback indiquant que la connexion a échoué

---

## 🔧 Solutions Proposées

### Solution 1 : Polling de l'État de Connexion (RECOMMANDÉ)

**Modifier** : `reachy_mini/src/reachy_mini/daemon/app/routers/wifi_config.py`

1. **Ajouter un endpoint pour vérifier l'état de connexion** :
```python
@router.get("/connect_status")
def get_connect_status() -> dict:
    """Get the status of the last connection attempt."""
    global error
    mode = get_current_wifi_mode()
    connections = get_wifi_connections()
    connected_network = next((c.name for c in connections if c.device != "--"), None)
    
    return {
        "mode": mode.value,
        "connected_network": connected_network,
        "error": str(error) if error else None,
        "is_connected": mode == WifiMode.WLAN and connected_network is not None,
    }
```

2. **Modifier `/wifi/connect` pour retourner un job_id** :
```python
@router.post("/connect")
def connect_to_wifi_network(ssid: str, password: str) -> dict:
    """Connect to a WiFi network. Returns a job_id to track progress."""
    if busy_lock.locked():
        raise HTTPException(status_code=409, detail="Another operation is in progress.")
    
    job_id = str(uuid.uuid4())
    
    def connect() -> None:
        global error
        with busy_lock:
            try:
                error = None
                setup_wifi_connection(name=ssid, ssid=ssid, password=password)
                # Wait a bit and verify connection
                time.sleep(3)
                if not check_if_connection_active(ssid):
                    raise Exception(f"Failed to connect to {ssid}")
            except Exception as e:
                error = e
                logger.error(f"Failed to connect to WiFi network '{ssid}': {e}")
                logger.info("Reverting to hotspot...")
                remove_connection(name=ssid)
                setup_wifi_connection(
                    name="Hotspot",
                    ssid=HOTSPOT_SSID,
                    password=HOTSPOT_PASSWORD,
                    is_hotspot=True,
                )
    
    Thread(target=connect).start()
    return {"job_id": job_id, "status": "started"}
```

3. **Modifier l'UI pour poller l'état** :
```javascript
// Dans WiFiConfiguration.jsx
const pollConnectionStatus = async () => {
    const statusUrl = `${baseUrl}/wifi/connect_status`;
    const response = await fetchWithTimeout(statusUrl, {}, 2000);
    const status = await response.json();
    
    if (status.error) {
        setWifiError(status.error);
        setIsConnecting(false);
        return false;
    }
    
    if (status.is_connected && status.connected_network === ssidToUse) {
        // ✅ Vraiment connecté !
        setSuccessMessage(`Successfully connected to ${ssidToUse}`);
        if (onConnectSuccess) {
            onConnectSuccess(ssidToUse);
        }
        return true;
    }
    
    return null; // Encore en cours
};

// Poller toutes les 2 secondes pendant 30 secondes max
let attempts = 0;
const maxAttempts = 15;
const pollInterval = setInterval(async () => {
    attempts++;
    const result = await pollConnectionStatus();
    
    if (result === true || result === false || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        if (attempts >= maxAttempts) {
            setWifiError('Connection timeout. Please check the network name and password.');
        }
    }
}, 2000);
```

---

### Solution 2 : Améliorer la Gestion d'Erreur

**Modifier** : `reachy_mini/src/reachy_mini/daemon/app/routers/wifi_config.py`

1. **Ne pas revenir automatiquement au hotspot** :
```python
except Exception as e:
    error = e
    logger.error(f"Failed to connect to WiFi network '{ssid}': {e}")
    # ⚠️ NE PAS revenir au hotspot automatiquement
    # Laisser l'utilisateur décider
    raise  # Propager l'erreur
```

2. **Ou, au minimum, logger l'erreur de manière visible** :
```python
except Exception as e:
    error = e
    logger.error(f"❌ FAILED to connect to WiFi network '{ssid}': {e}")
    logger.error(f"❌ Error type: {type(e).__name__}")
    logger.error(f"❌ Error details: {str(e)}")
    # ...
```

---

### Solution 3 : Améliorer le Feedback dans l'UI

**Modifier** : `tauri-app/src/components/wifi/WiFiConfiguration.jsx`

1. **Vérifier réellement l'état après connexion** :
```javascript
if (response.ok) {
    // Ne pas afficher "Success" immédiatement
    // Attendre et vérifier l'état réel
    setIsConnecting(true);
    setSuccessMessage(null);
    
    // Poller l'état pendant 30 secondes
    let attempts = 0;
    const checkConnection = setInterval(async () => {
        attempts++;
        await fetchWifiStatus();
        
        // Vérifier si on est vraiment connecté au bon réseau
        if (wifiStatus?.connected_network === ssidToUse && wifiStatus?.mode === 'wlan') {
            clearInterval(checkConnection);
            setSuccessMessage(`Successfully connected to ${ssidToUse}`);
            setIsConnecting(false);
            if (onConnectSuccess) {
                onConnectSuccess(ssidToUse);
            }
        } else if (attempts >= 15) {
            clearInterval(checkConnection);
            setIsConnecting(false);
            setWifiError('Connection timeout. The Reachy may still be in hotspot mode.');
        }
    }, 2000);
}
```

---

### Solution 4 : Gérer le Cas du Réseau Non Détecté

**Modifier** : `reachy_mini/src/reachy_mini/daemon/app/routers/wifi_config.py`

1. **Forcer un rescan avant connexion si le réseau n'est pas dans la liste** :
```python
def setup_wifi_connection(
    name: str, ssid: str, password: str, is_hotspot: bool = False
) -> None:
    """Set up a WiFi connection using nmcli."""
    logger.info(f"Setting up WiFi connection (ssid='{ssid}')...")
    
    if not is_hotspot:
        # Vérifier si le réseau est dans le scan
        available_networks = [w.ssid for w in scan_available_wifi()]
        if ssid not in available_networks:
            logger.warning(f"⚠️ Network '{ssid}' not found in scan. Attempting connection anyway...")
            # Forcer un rescan
            nmcli.device.wifi_rescan()
            time.sleep(2)  # Attendre que le scan se termine
    
    # ... reste du code
```

---

## 📋 Checklist de Vérification

- [ ] **Vérifier que `/wifi/connect` attend vraiment la connexion** (ou retourne un job_id)
- [ ] **Vérifier que l'erreur est retournée à l'UI** si la connexion échoue
- [ ] **Vérifier que l'UI poll l'état de connexion** après avoir appelé `/wifi/connect`
- [ ] **Vérifier que l'UI affiche une erreur** si le Reachy reste en hotspot
- [ ] **Vérifier que le flow gère le timeout** si le Reachy n'est pas trouvé sur le réseau local
- [ ] **Tester avec un réseau non détecté par le scan** (comme "ap")
- [ ] **Tester avec un mauvais mot de passe** pour vérifier le feedback d'erreur

---

## 🎯 Priorité des Correctifs

1. **URGENT** : Solution 1 (Polling de l'état de connexion) - Permet de savoir si la connexion a vraiment réussi
2. **URGENT** : Solution 3 (Améliorer le feedback dans l'UI) - Donne un feedback réel à l'utilisateur
3. **IMPORTANT** : Solution 2 (Améliorer la gestion d'erreur) - Évite les reverts silencieux
4. **MOYEN** : Solution 4 (Gérer le réseau non détecté) - Améliore les chances de succès pour les réseaux non scannés

---

## 📝 Notes Additionnelles

- Le problème du réseau "ap" non détecté est **normal** quand le Reachy est en mode hotspot (limitation matérielle)
- L'utilisateur peut taper le SSID manuellement, mais il faut s'assurer que la connexion fonctionne quand même
- Le daemon devrait **logger plus d'informations** pour faciliter le débogage
- Il faudrait peut-être **désactiver temporairement le hotspot** pour permettre un scan, puis le réactiver si la connexion échoue (mais c'est complexe)

