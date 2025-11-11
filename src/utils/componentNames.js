/**
 * Generates readable names for robot components
 * Based on position and mesh characteristics
 */

const COMPONENT_NAMES = [
  'XL330 Motor',
  'Position Sensor',
  'Electronic Board',
  'Stewart Module',
  'Servo Motor',
  'Torque Sensor',
  'Left Antenna',
  'Right Antenna',
  'Camera Mount',
  'Main Lens',
  'Audio System',
  'Electronic Interface',
  'Control Module',
  'IMU Sensor',
  'Mechanical Support',
  'Encoder',
  'Connector',
  'Power Module',
  'Printed Circuit',
  'Regulator',
];

/**
 * Génère un nom lisible pour un composant
 * @param {THREE.Mesh} mesh - Le mesh à nommer
 * @param {number} index - Index du mesh dans la liste
 * @param {number} total - Nombre total de meshes
 * @returns {string} Nom lisible du composant
 */
export function getComponentName(mesh, index, total) {
  // Utiliser un nom de la liste basé sur l'index
  // Avec modulo pour éviter de dépasser
  const nameIndex = index % COMPONENT_NAMES.length;
  return COMPONENT_NAMES[nameIndex];
}

/**
 * Generates a short name for quick display
 */
export function getShortComponentName(mesh, index, total) {
  const names = [
    'Motor',
    'Sensor',
    'Circuit',
    'Module',
    'Servo',
    'Encoder',
    'Support',
    'Interface',
  ];
  
  const nameIndex = index % names.length;
  return `${names[nameIndex]} #${Math.floor(index / names.length) + 1}`;
}

