import * as THREE from 'three';

/**
 * Convert a row-major 4x4 matrix (C-style, as sent by daemon) to column-major (Three.js format)
 * 
 * Row-major format (daemon): [m11, m12, m13, m14, m21, m22, m23, m24, ...]
 * Column-major format (Three.js): [m11, m21, m31, m41, m12, m22, m32, m42, ...]
 * 
 * @param {Array<number>|Float32Array} rowMajorArray - 16-element array in row-major order
 * @returns {Float32Array} - 16-element array in column-major order
 */
export function convertRowMajorToColumnMajor(rowMajorArray) {
  if (!rowMajorArray || rowMajorArray.length !== 16) {
    throw new Error('Matrix must be a 16-element array');
  }
  
  const columnMajorArray = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      columnMajorArray[col * 4 + row] = rowMajorArray[row * 4 + col];
    }
  }
  return columnMajorArray;
}

/**
 * Extract position directly from a row-major 4x4 matrix
 * 
 * @param {Array<number>|Float32Array} rowMajorArray - 16-element array in row-major order
 * @returns {{x: number, y: number, z: number}} - Position vector
 */
export function extractPositionFromRowMajorMatrix(rowMajorArray) {
  if (!rowMajorArray || rowMajorArray.length !== 16) {
    return { x: 0, y: 0, z: 0 };
  }
  
  return {
    x: rowMajorArray[3],  // tx (translation X) - row 0, col 3
    y: rowMajorArray[7],  // ty (translation Y) - row 1, col 3
    z: rowMajorArray[11], // tz (translation Z) - row 2, col 3
  };
}

/**
 * Create a Three.js Matrix4 from a row-major array (daemon format)
 * 
 * @param {Array<number>|Float32Array} rowMajorArray - 16-element array in row-major order
 * @returns {THREE.Matrix4} - Three.js matrix
 */
export function matrix4FromRowMajor(rowMajorArray) {
  const columnMajorArray = convertRowMajorToColumnMajor(rowMajorArray);
  const matrix = new THREE.Matrix4();
  matrix.fromArray(columnMajorArray);
  return matrix;
}

