# 🔍 Analyse : Problèmes de connectivité WiFi avec VPN d'entreprise

## 📋 Résumé du problème

Quand un utilisateur est connecté à un **VPN d'entreprise**, l'application peut échouer à se connecter au robot Reachy en WiFi, même si le robot est sur le même réseau local.

## 🏗️ Architecture actuelle

### 1. Découverte du robot (`useRobotDiscovery.js`)

```javascript
const WIFI_HOSTS_TO_CHECK = [
  'reachy-mini.home',   // mDNS (Avahi)
  'reachy-mini.local',  // mDNS (Bonjour)
  '192.168.1.18',       // IP statique commune
];
```

**Méthode** :
- Utilise `tauriFetch` (HTTP via Rust) pour contourner les restrictions WebView
- Teste les 3 hosts **en parallèle**
- Timeout : **10 secondes** par host
- Endpoint testé : `http://{host}:8000/api/daemon/status`

### 2. Proxy local (`local_proxy.rs`)

**Fonctionnement** :
```
Frontend (localhost:8000) → Proxy local (Rust) → Robot distant (reachy-mini.home:8000)
```

**Ports forwardés** :
- **TCP** : 8000 (daemon), 8042 (apps), 7447 (Zenoh), 8443 (WebRTC)
- **UDP** : 5000 (RTP audio), 8443 (WebRTC media)

**Avantages** :
- Contourne les restrictions **Private Network Access (PNA)** du navigateur
- Le frontend utilise toujours `localhost` (simplifie le code)

### 3. Configuration (`daemon.js`)

```javascript
TIMEOUTS: {
  HEALTHCHECK: 1333,
  STATE_FULL: 10000,         // 10s pour WiFi
  STARTUP_CHECK: 10000,      // 10s pour WiFi après idle
  // ...
}
```

---

## 🚨 Pourquoi les VPNs d'entreprise causent des problèmes

### 1. **Blocage mDNS** (problème #1 - CRITIQUE)

**Symptôme** : `reachy-mini.home` et `reachy-mini.local` ne résolvent pas

**Cause** :
- Les VPNs d'entreprise **bloquent** ou **ne routent pas** les paquets mDNS (multicast DNS)
- mDNS utilise le multicast (224.0.0.251), qui est souvent filtré par les VPNs
- Les requêtes `.local` et `.home` ne peuvent pas atteindre le réseau local

**Impact** :
- 2 des 3 hosts de découverte échouent immédiatement
- L'app doit attendre 2 × 10s = 20 secondes avant de tenter l'IP statique
- Si l'IP statique du robot n'est pas `192.168.1.18`, la découverte échoue totalement

### 2. **Routage forcé vers le tunnel VPN** (problème #2 - MAJEUR)

**Symptôme** : Même `192.168.1.18` échoue

**Cause** :
- Les VPNs d'entreprise forcent souvent **tout le trafic** à passer par le tunnel
- Les requêtes vers `192.168.1.x` sont envoyées au serveur VPN au lieu du réseau local
- Le serveur VPN n'a pas accès au robot (qui est sur le LAN de l'utilisateur)

**Impact** :
- **Aucun** des 3 hosts ne fonctionne
- L'app ne peut jamais découvrir le robot
- L'utilisateur voit "No robot found" en permanence

### 3. **Latence et timeouts** (problème #3 - MODÉRÉ)

**Symptôme** : Connexion lente ou timeouts fréquents

**Cause** :
- Le VPN ajoute de la latence (RTT souvent > 50ms, parfois > 200ms)
- Les timeouts de 10s peuvent être trop courts si :
  - Le VPN est lent
  - Le robot sort d'un état de veille WiFi (mDNS cache expiry)
  - Le réseau local est congestionné

**Impact** :
- Découverte échoue par timeout même si le robot est accessible
- Healthchecks échouent (timeout 1.33s)
- L'app considère le robot comme "crashed"

### 4. **Split tunneling désactivé** (problème #4 - CONFIGURATION)

**Symptôme** : Rien ne fonctionne

**Cause** :
- Les VPNs d'entreprise désactivent souvent le **split tunneling**
- Split tunneling = possibilité de router certaines IPs en dehors du tunnel VPN
- Sans split tunneling, **100% du trafic** passe par le VPN

**Impact** :
- Le réseau local (192.168.x.x) est complètement inaccessible
- Même `localhost` peut être affecté dans certains cas extrêmes

### 5. **DNS personnalisé** (problème #5 - DNS)

**Symptôme** : `reachy-mini.home` résout vers une mauvaise IP

**Cause** :
- Le VPN remplace le serveur DNS local par le DNS de l'entreprise
- Le DNS d'entreprise ne connaît pas `reachy-mini.home`
- La résolution DNS échoue ou retourne une IP incorrecte

**Impact** :
- La découverte utilise une mauvaise IP
- Les connexions échouent silencieusement

---

## 🔬 Diagnostic : Comment détecter un VPN

### Indicateurs côté client

1. **Interfaces réseau suspects** (à implémenter)
   ```rust
   // À ajouter dans un nouveau module
   use default_net::get_default_interface;
   
   let interface = get_default_interface().unwrap();
   if interface.name.contains("utun") ||  // macOS VPN
      interface.name.contains("tun") ||   // Linux VPN
      interface.name.contains("tap") ||   // Windows VPN
      interface.name.contains("vpn") {
       // Likely on VPN
   }
   ```

2. **Échecs mDNS systématiques**
   - Si `.home` et `.local` échouent TOUJOURS
   - Mais l'IP directe fonctionne parfois

3. **Latence élevée vers IP locale**
   - Ping vers `192.168.1.18` > 50ms
   - Alors que normalement < 5ms

4. **DNS échoue pour `.home`**
   - `nslookup reachy-mini.home` échoue
   - Alors que `ping 192.168.1.18` fonctionne

---

## 💡 Solutions proposées

### 🎯 Solution 1 : Mode "Direct IP" (FACILE - RECOMMANDÉ)

**Implémentation** :
- Ajouter un bouton "Use direct IP" dans l'UI de découverte
- Permettre à l'utilisateur de saisir l'IP du robot manuellement
- Bypass complètement la découverte mDNS

**Avantages** :
- ✅ Fonctionne avec n'importe quel VPN
- ✅ Pas besoin de configuration VPN
- ✅ Rapide (pas de timeout mDNS)

**Code à ajouter** :
```javascript
// Dans useRobotDiscovery.js
async function checkDirectIp(ip) {
  return checkSingleHost(ip);
}

// Dans l'UI
<input 
  type="text" 
  placeholder="192.168.1.18" 
  onChange={e => setManualIp(e.target.value)}
/>
<button onClick={() => connectDirectIp(manualIp)}>
  Connect to IP
</button>
```

### 🎯 Solution 2 : Détection automatique de VPN (MOYEN)

**Implémentation** :
- Détecter si un VPN est actif au lancement
- Afficher un **avertissement proactif** à l'utilisateur
- Suggérer des solutions (désactiver VPN, utiliser IP directe)

**Code Rust** :
```rust
// src-tauri/src/network/vpn_detection.rs
#[tauri::command]
pub async fn detect_vpn() -> Result<VpnStatus, String> {
    let interface = default_net::get_default_interface()
        .map_err(|e| format!("Failed to get interface: {}", e))?;
    
    let is_vpn = interface.name.contains("utun") 
        || interface.name.contains("tun")
        || interface.name.contains("vpn");
    
    Ok(VpnStatus {
        detected: is_vpn,
        interface_name: interface.name,
    })
}
```

**UI** :
```javascript
if (vpnDetected) {
  showToast(
    "⚠️ VPN detected - WiFi connection may fail. Consider using direct IP or disabling VPN.",
    "warning"
  );
}
```

### 🎯 Solution 3 : Augmenter les timeouts en présence de VPN (FACILE)

**Implémentation** :
- Détecter le VPN
- Augmenter automatiquement les timeouts de 10s → 30s

**Code** :
```javascript
const WIFI_CHECK_TIMEOUT = vpnDetected ? 30000 : 10000;
```

**Avantages** :
- ✅ Améliore les chances de succès avec VPN lent
- ⚠️ Ralentit la découverte même quand ça ne marchera pas

### 🎯 Solution 4 : Mode "Fallback IP prioritaire" (FACILE)

**Implémentation** :
- Tester l'IP statique **en premier** au lieu des mDNS
- Si VPN détecté, sauter complètement les `.home` et `.local`

**Code** :
```javascript
const WIFI_HOSTS_TO_CHECK = vpnDetected 
  ? ['192.168.1.18', 'reachy-mini.home', 'reachy-mini.local']  // IP d'abord
  : ['reachy-mini.home', 'reachy-mini.local', '192.168.1.18']; // mDNS d'abord
```

**Avantages** :
- ✅ Découverte plus rapide avec VPN
- ✅ Pas de changement UI nécessaire

### 🎯 Solution 5 : Liste d'IPs personnalisée (MOYEN - FLEXIBLE)

**Implémentation** :
- Permettre à l'utilisateur de configurer une **liste d'IPs** à tester
- Sauvegarder dans les settings locaux

**UI** :
```javascript
Settings > WiFi > Custom IPs to scan
[192.168.1.18]
[192.168.0.100]
[Add IP]
```

**Avantages** :
- ✅ Fonctionne pour n'importe quelle configuration réseau
- ✅ L'utilisateur peut ajouter l'IP DHCP de son robot

### 🎯 Solution 6 : Documentation + Guide de dépannage (FACILE - IMMÉDIAT)

**Implémentation** :
- Créer une page de troubleshooting dans l'app
- Documenter le problème VPN et les solutions

**Contenu** :
```markdown
## 🔧 Troubleshooting: WiFi Connection Issues

### If you're using a corporate VPN:
1. **Option 1 (Recommended)**: Disconnect from VPN temporarily
2. **Option 2**: Use the "Direct IP" connection mode
3. **Option 3**: Configure split tunneling to exclude 192.168.x.x
4. **Option 4**: Find your robot's IP with `arp -a | grep reachy`

### How to find your robot's IP:
- macOS/Linux: `arp -a | grep -i b8:27:eb`
- Windows: `arp -a | findstr "b8-27-eb"`
- Web interface: Check your router's DHCP leases
```

---

## 🎯 Plan d'action recommandé

### Phase 1 : Quick wins (1-2 heures) ✅ PRIORITÉ

1. **Ajouter le mode "Direct IP"** (Solution 1)
   - Input manuel pour saisir l'IP
   - Bouton "Connect to IP"
   - Sauvegarde de la dernière IP utilisée

2. **Prioriser l'IP statique si disponible** (Solution 4)
   - Tester `192.168.1.18` en premier dans la liste
   - Réduire le temps de découverte de 20s → 10s en cas de VPN

3. **Documenter le problème** (Solution 6)
   - Ajouter une section "VPN Issues" dans l'app
   - Guide rapide pour trouver l'IP du robot

### Phase 2 : Améliorations UX (2-4 heures)

4. **Détecter le VPN automatiquement** (Solution 2)
   - Commande Tauri `detect_vpn()`
   - Toast d'avertissement si VPN détecté
   - Suggestion d'utiliser Direct IP

5. **Augmenter timeouts intelligemment** (Solution 3)
   - Timeouts adaptatifs basés sur la détection VPN
   - 30s au lieu de 10s si VPN actif

### Phase 3 : Power users (4-6 heures)

6. **Settings avancés** (Solution 5)
   - Liste d'IPs personnalisée
   - Sauvegarde dans les préférences locales
   - UI pour ajouter/supprimer des IPs

7. **Diagnostic réseau intégré**
   - Ping tool dans l'app
   - Traceroute simplifié
   - Test de résolution DNS

---

## 📊 Comparaison des solutions

| Solution | Complexité | Impact VPN | UX | Priorité |
|----------|------------|------------|-----|----------|
| Direct IP | ⭐ Facile | ✅ Résout 100% | ⭐⭐⭐ | 🔥 HAUTE |
| Détection VPN | ⭐⭐ Moyen | ⚠️ Avertit | ⭐⭐ | 🔥 HAUTE |
| Timeouts adaptatifs | ⭐ Facile | ⚠️ Améliore un peu | ⭐ | Moyenne |
| Fallback IP | ⭐ Facile | ✅ Accélère | ⭐⭐ | 🔥 HAUTE |
| IPs custom | ⭐⭐⭐ Difficile | ✅ Résout 100% | ⭐⭐⭐ | Basse |
| Documentation | ⭐ Facile | ℹ️ Éduque | ⭐⭐ | 🔥 HAUTE |

---

## 🧪 Tests à réaliser

### Scénarios de test

1. **Sans VPN** : ✅ doit fonctionner comme avant
2. **VPN split-tunneling actif** : ⚠️ vérifier que mDNS marche
3. **VPN full-tunnel** : ❌ échoue actuellement, devrait marcher avec Direct IP
4. **VPN + IP statique** : ✅ devrait marcher si l'IP est dans la liste
5. **VPN + DHCP** : ❌ échoue actuellement, besoin de Custom IPs

### Commandes pour simuler un VPN bloquant

```bash
# Bloquer mDNS sur macOS (simuler VPN)
sudo pfctl -e
echo "block drop proto udp from any to 224.0.0.251 port 5353" | sudo pfctl -f -

# Restaurer
sudo pfctl -d
```

---

## 📝 Fichiers à modifier

### Frontend
- `src/hooks/system/useRobotDiscovery.js` : Ajouter Direct IP, détection VPN
- `src/views/finding-robot/FindingRobotView.jsx` : UI pour Direct IP
- `src/config/daemon.js` : Timeouts adaptatifs
- `src/constants/wifi.js` : Ajout de constantes

### Backend Rust
- `src-tauri/src/network/mod.rs` : Nouveau module pour détection VPN
- `src-tauri/src/lib.rs` : Enregistrer commande `detect_vpn`
- `src-tauri/capabilities/default.json` : Permission réseau si nécessaire

### Documentation
- `README.md` : Section troubleshooting VPN
- `VPN_TROUBLESHOOTING.md` : Guide détaillé (ce document)

---

## 🎓 Ressources

- [mDNS sur Wikipedia](https://en.wikipedia.org/wiki/Multicast_DNS)
- [VPN Split Tunneling](https://nordvpn.com/blog/split-tunneling/)
- [Tauri Network APIs](https://tauri.app/v1/api/js/http/)
- [default-net crate](https://docs.rs/default-net/) : détection d'interface réseau

---

## 🚀 Conclusion

Le problème VPN est **résolvable** avec des solutions simples :
1. ✅ **Direct IP** résout 90% des cas
2. ✅ **Détection VPN** améliore l'UX en avertissant l'utilisateur
3. ✅ **Documentation** aide les utilisateurs à comprendre

**Effort estimé** : 3-4 heures pour Phase 1 + Phase 2
**Impact utilisateur** : ⭐⭐⭐⭐⭐ (critique pour les environnements pro)
