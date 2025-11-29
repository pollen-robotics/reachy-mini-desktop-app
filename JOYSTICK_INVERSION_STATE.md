# État des Inversions des Joysticks - Tous les Niveaux

## 📊 Vue d'ensemble

Ce document décrit l'état actuel de toutes les inversions et mappings des joysticks à travers toute la chaîne : Gamepad → InputManager → useRobotPosition → Affichage → Robot.

---

## 1️⃣ InputManager (Gamepad → Inputs)

### Left Stick (Position X/Y)
```javascript
// axes[0] = left stick horizontal (left = -1, right = +1)
// axes[1] = left stick vertical (up = -1, down = +1)

this.gamepadInputs.moveRight = leftStickX;        // Pas d'inversion
this.gamepadInputs.moveForward = -leftStickY;     // ✅ INVERSION Y (up = forward)
```

**Résultat :**
- Stick horizontal gauche → `moveRight = -1`
- Stick horizontal droite → `moveRight = +1`
- Stick vertical haut → `moveForward = +1` (inversé)
- Stick vertical bas → `moveForward = -1` (inversé)

### Right Stick (Pitch/Yaw)
```javascript
// axes[2] = right stick horizontal (left = -1, right = +1)
// axes[3] = right stick vertical (up = -1, down = +1)

this.gamepadInputs.lookHorizontal = rightStickX;                    // Pas d'inversion
this.gamepadInputs.lookVertical = -rightStickY;                      // ✅ INVERSION Y (up = pitch up)
```

**Résultat :**
- Stick horizontal gauche → `lookHorizontal = -1`
- Stick horizontal droite → `lookHorizontal = +1`
- Stick vertical haut → `lookVertical = +1` (inversé)
- Stick vertical bas → `lookVertical = -1` (inversé)

---

## 2️⃣ useRobotPosition (Inputs → Robot Values)

### Position X/Y
```javascript
// Mapping: moveForward (vertical) → X (robot forward/backward)
//          moveRight (horizontal) → Y (robot left/right)

const newX = inputs.moveForward * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
const newY = inputs.moveRight * EXTENDED_ROBOT_RANGES.POSITION.max * POSITION_SENSITIVITY_FACTOR;
```

**Résultat :**
- `moveForward = +1` → `newX = +max` (robot avance)
- `moveForward = -1` → `newX = -max` (robot recule)
- `moveRight = +1` → `newY = +max` (robot droite)
- `moveRight = -1` → `newY = -max` (robot gauche)

### Pitch/Yaw
```javascript
// Pitch: stick up = pitch positive (look up)
const newPitch = inputs.lookVertical * EXTENDED_ROBOT_RANGES.PITCH.max * ROTATION_SENSITIVITY_FACTOR;

// Yaw: stick right = yaw positive (turn right)
const newYaw = -inputs.lookHorizontal * EXTENDED_ROBOT_RANGES.YAW.max * ROTATION_SENSITIVITY_FACTOR;  // ✅ INVERSION
```

**Résultat :**
- `lookVertical = +1` → `newPitch = +max` (regarde en haut)
- `lookVertical = -1` → `newPitch = -max` (regarde en bas)
- `lookHorizontal = +1` → `newYaw = -max` (tourne à gauche) ⚠️ INVERSÉ
- `lookHorizontal = -1` → `newYaw = +max` (tourne à droite) ⚠️ INVERSÉ

---

## 3️⃣ RobotPositionControl (Affichage)

### Position X/Y Joystick
```javascript
<Joystick2D
  valueX={localValues.headPose.y}      // ✅ SWAP: Y → X visuel
  valueY={localValues.headPose.x}      // ✅ SWAP: X → Y visuel
  onChange={(x, y, continuous) => handleChange({ x: y, y: x }, continuous)}  // ✅ SWAP inverse
/>
```

**Résultat :**
- Robot X (forward/backward) → Affiché sur l'axe Y (vertical)
- Robot Y (left/right) → Affiché sur l'axe X (horizontal)
- Le swap est compensé dans `onChange` : `{ x: y, y: x }`

### Pitch/Yaw Joystick
```javascript
<Joystick2D
  valueX={localValues.headPose.yaw}    // Pas de swap
  valueY={localValues.headPose.pitch}  // Pas de swap
  onChange={(yaw, pitch, continuous) => handleChange({ yaw, pitch }, continuous)}  // Pas de swap
/>
```

**Résultat :**
- Robot Yaw → Affiché sur l'axe X (horizontal)
- Robot Pitch → Affiché sur l'axe Y (vertical)
- Pas de swap, mapping direct

---

## 4️⃣ Joystick2D (Mouse → Values)

### Conversion Mouse → Normalized
```javascript
// Mouse X: left = negative, right = positive
// Mouse Y: top = negative, bottom = positive

const normalizedX = dx / maxRadius;  // Left = -1, Right = +1
const normalizedY = dy / maxRadius; // Top = -1, Bottom = +1

// Conversion to actual range
const newX = minX + (normalizedX + 1) / 2 * (maxX - minX);
const newY = minY + (normalizedY + 1) / 2 * (maxY - minY);
```

**Résultat :**
- Souris gauche → `normalizedX = -1` → `newX = minX`
- Souris droite → `normalizedX = +1` → `newX = maxX`
- Souris haut → `normalizedY = -1` → `newY = minY`
- Souris bas → `normalizedY = +1` → `newY = maxY`

**Note :** Pas d'inversion dans Joystick2D, les valeurs sont directes.

---

## 5️⃣ useRobotSmoothing → useRobotAPI (Envoi au Robot)

### Pas d'inversion supplémentaire
```javascript
// useRobotSmoothing.js
const apiClampedHeadPose = {
  x: clamp(smoothedValues.headPose.x, ...),
  y: clamp(smoothedValues.headPose.y, ...),
  pitch: clamp(smoothedValues.headPose.pitch, ...),  // Direct
  yaw: clamp(smoothedValues.headPose.yaw, ...),      // Direct
  ...
};

// useRobotAPI.js
const requestBody = {
  target_head_pose: {
    x: clamp(headPose.x, ...),
    y: clamp(headPose.y, ...),
    pitch: clamp(headPose.pitch, ...),  // Direct
    yaw: clamp(headPose.yaw, ...),        // Direct
    ...
  },
  ...
};
```

**Résultat :** Les valeurs sont envoyées directement au robot, sans inversion supplémentaire.

---

## 📋 Résumé des Inversions

| Niveau | Composant | Inversion | Détails |
|--------|-----------|-----------|---------|
| **1. InputManager** | Left Stick Y | ✅ Oui | `moveForward = -leftStickY` (up = forward) |
| **1. InputManager** | Right Stick Y | ✅ Oui | `lookVertical = -rightStickY` (up = pitch up) |
| **2. useRobotPosition** | Yaw | ✅ Oui | `newYaw = -lookHorizontal` (right = yaw positive) |
| **3. RobotPositionControl** | Position X/Y | ✅ Swap | `valueX={y}`, `valueY={x}`, `onChange({x:y, y:x})` |
| **4. Joystick2D** | Mouse | ❌ Non | Conversion directe, pas d'inversion |
| **5. useRobotSmoothing/API** | Envoi | ❌ Non | Envoi direct, pas d'inversion |

---

## 🎮 Comportement Final (Gamepad)

### Left Stick (Position)
- **Stick haut** → Robot avance (X positif) ✅
- **Stick bas** → Robot recule (X négatif) ✅
- **Stick droite** → Robot va à droite (Y positif) ✅
- **Stick gauche** → Robot va à gauche (Y négatif) ✅

### Right Stick (Rotation)
- **Stick haut** → Robot regarde en haut (Pitch positif) ✅
- **Stick bas** → Robot regarde en bas (Pitch négatif) ✅
- **Stick droite** → Robot tourne à droite (Yaw positif) ✅
- **Stick gauche** → Robot tourne à gauche (Yaw négatif) ✅

---

## 🖱️ Comportement Final (Souris)

### Position X/Y Joystick
- **Souris haut** → Robot avance (X positif) ✅
- **Souris bas** → Robot recule (X négatif) ✅
- **Souris droite** → Robot va à droite (Y positif) ✅
- **Souris gauche** → Robot va à gauche (Y négatif) ✅

### Pitch/Yaw Joystick
- **Souris haut** → Robot regarde en haut (Pitch positif) ✅
- **Souris bas** → Robot regarde en bas (Pitch négatif) ✅
- **Souris droite** → Robot tourne à droite (Yaw positif) ✅
- **Souris gauche** → Robot tourne à gauche (Yaw négatif) ✅

---

## ✅ État Actuel

Toutes les inversions sont **cohérentes** et **alignées** :
- Le gamepad et la souris ont le même comportement
- L'affichage correspond au mouvement du robot
- Les inversions sont nécessaires pour l'intuition (up = forward, up = pitch up, right = yaw right)

**Aucune correction nécessaire** - le système est correctement configuré.

