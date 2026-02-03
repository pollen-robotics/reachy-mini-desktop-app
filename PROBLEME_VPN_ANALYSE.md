# 🔍 Problème de connexion WiFi avec VPN d'entreprise

## 🚨 Symptôme

Quand un utilisateur est connecté à un **VPN d'entreprise**, l'app ne peut pas découvrir le robot Reachy en WiFi, même si le robot est sur le même réseau local.

## 🔬 Cause racine

### 1. **Blocage mDNS** (problème principal)

```javascript
// useRobotDiscovery.js - lignes 16-23
const WIFI_HOSTS_TO_CHECK = [
  'reachy-mini.home',   // ❌ Bloqué par VPN (mDNS)
  'reachy-mini.local',  // ❌ Bloqué par VPN (mDNS)  
  '192.168.1.18',       // ⚠️  Fonctionne seulement si c'est l'IP du robot
];
```

**Pourquoi** :
- Les VPNs d'entreprise **bloquent mDNS** (multicast DNS sur 224.0.0.251:5353)
- Les noms `.home` et `.local` ne peuvent pas être résolus
- L'app attend 2 × 10s = **20 secondes** avant de tester l'IP statique
- Si l'IP du robot n'est pas `192.168.1.18` (souvent différente en DHCP), la découverte échoue

### 2. **Routage forcé vers le tunnel VPN**

Les VPNs d'entreprise forcent souvent **tout le trafic** à passer par le tunnel, même les requêtes vers des IPs locales (`192.168.x.x`). Le serveur VPN n'a pas accès au robot sur le LAN de l'utilisateur.

### 3. **Latence et timeouts**

Le VPN ajoute de la latence (RTT > 50ms vs < 5ms normalement). Les timeouts de 10s peuvent être trop courts.

---

## ✅ Solutions proposées

### 🎯 Solution 1 : Mode "Connexion IP directe" ⭐ **RECOMMANDÉ**

**Implémentation** : Ajouter un bouton dans l'UI pour saisir l'IP manuellement.

```javascript
// Dans FindingRobotView.jsx
<div className="direct-ip-mode">
  <input 
    type="text" 
    placeholder="Exemple: 192.168.1.100" 
    value={manualIp}
    onChange={e => setManualIp(e.target.value)}
  />
  <button onClick={() => connectToIp(manualIp)}>
    Se connecter à cette IP
  </button>
</div>

// Dans useRobotDiscovery.js
export async function connectToDirectIp(ip) {
  const result = await checkSingleHost(ip);
  if (result.available) {
    return { available: true, host: ip };
  }
  throw new Error(`Robot not found at ${ip}`);
}
```

**Avantages** :
- ✅ Fonctionne avec **n'importe quel VPN**
- ✅ Pas besoin de désactiver le VPN
- ✅ Rapide (pas d'attente mDNS)
- ✅ Simple à implémenter (1-2 heures)

**UX** :
- Afficher "Connexion VPN détectée ?" dans l'UI
- Lien "Trouver l'IP de votre robot" → guide rapide

---

### 🎯 Solution 2 : Détection automatique de VPN

**Implémentation** : Détecter le VPN et avertir l'utilisateur proactivement.

**Code Rust** :
```rust
// src-tauri/src/network/vpn_detection.rs
use serde::Serialize;

#[derive(Serialize)]
pub struct VpnStatus {
    pub detected: bool,
    pub interface_name: String,
}

#[tauri::command]
pub async fn detect_vpn() -> Result<VpnStatus, String> {
    let interface = default_net::get_default_interface()
        .map_err(|e| format!("Failed to get interface: {}", e))?;
    
    let is_vpn = interface.name.contains("utun")   // macOS
        || interface.name.contains("tun")          // Linux
        || interface.name.contains("tap")          // Windows TAP
        || interface.name.contains("vpn");
    
    Ok(VpnStatus {
        detected: is_vpn,
        interface_name: interface.name,
    })
}
```

**Frontend** :
```javascript
// Dans FindingRobotView.jsx
useEffect(() => {
  invoke('detect_vpn').then(({ detected }) => {
    if (detected) {
      showToast(
        "⚠️ VPN d'entreprise détecté - La connexion WiFi peut échouer. Utilisez l'IP directe ou désactivez le VPN.",
        "warning"
      );
    }
  });
}, []);
```

**Dépendances** :
```toml
# src-tauri/Cargo.toml
[dependencies]
default-net = "0.20"
```

---

### 🎯 Solution 3 : Prioriser l'IP statique

**Implémentation** : Tester l'IP statique **en premier** au lieu des mDNS.

```javascript
// useRobotDiscovery.js
const WIFI_HOSTS_TO_CHECK = [
  '192.168.1.18',       // IP d'abord (rapide)
  'reachy-mini.home',   // Puis mDNS
  'reachy-mini.local',
];
```

**Avantages** :
- ✅ Découverte plus rapide avec VPN (10s au lieu de 20s)
- ✅ Aucun changement UI
- ✅ 5 minutes à implémenter

---

### 🎯 Solution 4 : Timeouts adaptatifs

**Implémentation** : Augmenter les timeouts si VPN détecté.

```javascript
// useRobotDiscovery.js
const WIFI_CHECK_TIMEOUT = vpnDetected ? 30000 : 10000;
```

---

### 🎯 Solution 5 : Liste d'IPs personnalisée (pour power users)

**Implémentation** : Permettre de configurer des IPs supplémentaires dans Settings.

**UI** :
```
⚙️ Settings > WiFi > IPs personnalisées
[192.168.1.18]  ❌
[192.168.0.100] ❌
[+ Ajouter une IP]
```

---

## 📊 Comparaison des solutions

| Solution | Temps | Impact | Priorité |
|----------|-------|--------|----------|
| **IP directe** | 1-2h | ✅ Résout 100% | 🔥 **HAUTE** |
| **Détection VPN** | 2-3h | ⚠️ Avertit | 🔥 **HAUTE** |
| **Prioriser IP** | 5min | ⚠️ Accélère | 🔥 **HAUTE** |
| **Timeouts adaptatifs** | 30min | ⚠️ Améliore un peu | Moyenne |
| **IPs custom** | 4-6h | ✅ Résout 100% | Basse |

---

## 🎯 Plan d'action recommandé

### Phase 1 : Quick wins (2-3 heures)

1. ✅ **Prioriser l'IP statique** (Solution 3) - 5 minutes
   ```diff
   const WIFI_HOSTS_TO_CHECK = [
   +  '192.168.1.18',
     'reachy-mini.home',
     'reachy-mini.local',
   -  '192.168.1.18',
   ];
   ```

2. ✅ **Ajouter mode IP directe** (Solution 1) - 1-2 heures
   - Input + bouton dans FindingRobotView
   - Fonction `connectToDirectIp()` dans useRobotDiscovery
   - Sauvegarde de la dernière IP dans localStorage

3. ✅ **Détection VPN** (Solution 2) - 2 heures
   - Commande Tauri `detect_vpn()`
   - Toast d'avertissement si VPN détecté

### Phase 2 : Nice to have (2-3 heures)

4. ⚠️ **Timeouts adaptatifs** (Solution 4) - 30 minutes
5. ⚠️ **IPs personnalisées** (Solution 5) - 4-6 heures

---

## 📝 Fichiers à modifier

### Phase 1

**Frontend** :
- `src/hooks/system/useRobotDiscovery.js` :
  - Inverser l'ordre de `WIFI_HOSTS_TO_CHECK`
  - Ajouter `connectToDirectIp(ip)`
  - Utiliser `detect_vpn()` via `invoke()`

- `src/views/finding-robot/FindingRobotView.jsx` :
  - Ajouter section "Connexion manuelle" avec input IP
  - Afficher warning si VPN détecté

**Backend Rust** :
- `src-tauri/src/network/mod.rs` : Nouveau module
- `src-tauri/src/network/vpn_detection.rs` : Commande `detect_vpn()`
- `src-tauri/src/lib.rs` : Enregistrer commande
- `src-tauri/Cargo.toml` : Ajouter `default-net = "0.20"`

---

## 🧪 Comment trouver l'IP du robot

### macOS / Linux
```bash
# Méthode 1 : ARP (Raspberry Pi MAC address)
arp -a | grep -i "b8:27:eb\|dc:a6:32"

# Méthode 2 : nmap (scan du réseau)
nmap -sn 192.168.1.0/24 | grep -B 2 "Raspberry Pi"
```

### Windows
```powershell
# Méthode 1 : ARP
arp -a | findstr "b8-27-eb dc-a6-32"

# Méthode 2 : Interface web du routeur
# Ouvrir http://192.168.1.1 → DHCP Leases
```

### Interface web du routeur
1. Ouvrir `http://192.168.1.1` (ou `192.168.0.1`)
2. Se connecter (admin/admin ou voir étiquette du routeur)
3. Aller dans "DHCP" ou "Clients connectés"
4. Chercher "reachy-mini" ou "raspberry"

---

## 🎓 Documentation à ajouter

**Dans l'app** :
- Section "Troubleshooting WiFi" dans Settings
- Bouton "?" à côté du champ IP qui ouvre un guide

**Dans README.md** :
```markdown
### 🔧 Problèmes de connexion WiFi avec VPN

Si vous utilisez un VPN d'entreprise :

1. **Solution rapide** : Utilisez le mode "Connexion IP directe"
2. **Alternative** : Désactivez temporairement le VPN
3. **Configuration avancée** : Activez le split tunneling pour exclure 192.168.x.x

Pour trouver l'IP de votre robot :
- macOS/Linux : `arp -a | grep -i b8:27:eb`
- Windows : `arp -a | findstr "b8-27-eb"`
- Interface web de votre routeur (souvent 192.168.1.1)
```

---

## 💡 Pourquoi c'est important

**Impact utilisateur** :
- ⚠️ Les VPNs d'entreprise sont **très courants** dans les environnements professionnels
- ⚠️ Actuellement, l'app est **inutilisable** avec un VPN actif
- ✅ La solution "IP directe" est **simple** et **universelle**

**ROI** :
- ⏱️ 2-3 heures d'implémentation
- 📈 Débloquer tous les utilisateurs en VPN
- 🎯 Amélioration critique pour adoption en entreprise

---

## 🚀 Conclusion

Le mode **"Connexion IP directe"** est la solution la plus efficace :
- ✅ Résout 100% des cas
- ✅ Simple à implémenter
- ✅ Pas besoin de configuration VPN
- ✅ Fonctionne pour tous les environnements réseau

**Prochaine étape** : Créer une PR avec Phase 1 (2-3 heures de dev).
