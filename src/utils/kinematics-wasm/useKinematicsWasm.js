/**
 * 🦀 WASM Kinematics Hook
 * 
 * Calculates passive joints locally using WebAssembly (Rust compiled).
 * 
 * ## Why?
 * The daemon with AnalyticalKinematics doesn't provide passive joints.
 * This WASM module calculates them from head_joints + head_pose.
 * 
 * ## Usage
 * ```js
 * const { isReady, calculatePassiveJoints } = useKinematicsWasm();
 * 
 * // When WASM is ready:
 * const passiveJoints = calculatePassiveJoints(headJoints, headPose);
 * // Returns: [p1_x, p1_y, p1_z, ..., p7_x, p7_y, p7_z] (21 floats)
 * ```
 * 
 * ## Performance
 * - WASM size: ~30KB
 * - Calculation time: < 1ms
 * - Runs in main thread (fast enough, no Worker needed)
 * 
 * @see kinematics-wasm/README.md for full documentation
 */

import { useState, useEffect, useRef, useCallback } from 'react';

let wasmModule = null;
let wasmLoading = false;
let wasmLoadPromise = null;

/**
 * Load the WASM module (singleton pattern - only load once)
 */
async function loadWasm() {
  if (wasmModule) return wasmModule;
  if (wasmLoading) return wasmLoadPromise;
  
  wasmLoading = true;
  wasmLoadPromise = (async () => {
    try {
      // Dynamic import of the WASM module
      const wasm = await import('./reachy_mini_kinematics_wasm.js');
      await wasm.default(); // Initialize WASM
      wasmModule = wasm;
      
      return wasm;
    } catch (err) {
      console.error('❌ Failed to load WASM Kinematics:', err);
      wasmLoading = false;
      throw err;
    }
  })();
  
  return wasmLoadPromise;
}

/**
 * Hook to use WASM kinematics for calculating passive joints
 * 
 * @returns {Object} { isReady, calculatePassiveJoints, error }
 */
export function useKinematicsWasm() {
  const [isReady, setIsReady] = useState(!!wasmModule);
  const [error, setError] = useState(null);
  const wasmRef = useRef(wasmModule);
  
  useEffect(() => {
    if (wasmModule) {
      wasmRef.current = wasmModule;
      setIsReady(true);
      return;
    }
    
    loadWasm()
      .then((wasm) => {
        wasmRef.current = wasm;
        setIsReady(true);
      })
      .catch((err) => {
        setError(err.message);
      });
  }, []);
  
  /**
   * Calculate passive joints from head joints and head pose
   * 
   * @param {number[]} headJoints - Array of 7 floats [yaw_body, stewart_1, ..., stewart_6]
   * @param {number[]} headPose - Array of 16 floats (4x4 matrix, row-major)
   * @returns {number[]|null} Array of 21 floats [p1_x, p1_y, p1_z, ..., p7_x, p7_y, p7_z] or null if not ready
   */
  const calculatePassiveJoints = useCallback((headJoints, headPose) => {
    if (!wasmRef.current || !headJoints || !headPose) {
      return null;
    }
    
    try {
      // Convert to Float64Array if needed
      const jointsArray = headJoints instanceof Float64Array 
        ? headJoints 
        : new Float64Array(headJoints);
      const poseArray = headPose instanceof Float64Array 
        ? headPose 
        : new Float64Array(headPose);
      
      // Call WASM function
      const result = wasmRef.current.calculate_passive_joints(jointsArray, poseArray);
      
      // Convert back to regular array
      return Array.from(result);
    } catch (err) {
      console.error('❌ WASM calculation error:', err);
      return null;
    }
  }, []);
  
  return {
    isReady,
    calculatePassiveJoints,
    error,
  };
}

/**
 * Standalone function to calculate passive joints (for use outside React)
 * Returns null if WASM not loaded yet
 */
export async function calculatePassiveJointsAsync(headJoints, headPose) {
  const wasm = await loadWasm();
  
  const jointsArray = headJoints instanceof Float64Array 
    ? headJoints 
    : new Float64Array(headJoints);
  const poseArray = headPose instanceof Float64Array 
    ? headPose 
    : new Float64Array(headPose);
  
  const result = wasm.calculate_passive_joints(jointsArray, poseArray);
  return Array.from(result);
}

export default useKinematicsWasm;

