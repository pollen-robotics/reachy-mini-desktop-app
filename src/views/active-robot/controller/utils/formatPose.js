/**
 * Helper to format pose values for logging
 */
export const formatPoseForLog = (headPose, bodyYaw) => {
  const parts = [];
  
  // Position (only if non-zero)
  if (Math.abs(headPose.x) > 0.001 || Math.abs(headPose.y) > 0.001 || Math.abs(headPose.z) > 0.001) {
    parts.push(`pos(${headPose.x.toFixed(3)}, ${headPose.y.toFixed(3)}, ${headPose.z.toFixed(3)})`);
  }
  
  // Rotation (only if non-zero) - in radians
  if (Math.abs(headPose.pitch) > 0.01 || Math.abs(headPose.yaw) > 0.01 || Math.abs(headPose.roll) > 0.01) {
    const pitchRad = headPose.pitch.toFixed(3);
    const yawRad = headPose.yaw.toFixed(3);
    const rollRad = headPose.roll.toFixed(3);
    parts.push(`rot(p:${pitchRad}rad, y:${yawRad}rad, r:${rollRad}rad)`);
  }
  
  // Body yaw (only if non-zero) - in radians
  if (Math.abs(bodyYaw) > 0.01) {
    const bodyYawRad = bodyYaw.toFixed(3);
    parts.push(`body:${bodyYawRad}rad`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'reset';
};

/**
 * Helper to check if pose changed significantly (for logging)
 */
export const hasSignificantChange = (pose1, pose2, threshold = 0.01) => {
  if (!pose1 || !pose2) return true;
  
  const posDiff = Math.sqrt(
    Math.pow(pose1.headPose.x - pose2.headPose.x, 2) +
    Math.pow(pose1.headPose.y - pose2.headPose.y, 2) +
    Math.pow(pose1.headPose.z - pose2.headPose.z, 2)
  );
  
  const rotDiff = Math.sqrt(
    Math.pow(pose1.headPose.pitch - pose2.headPose.pitch, 2) +
    Math.pow(pose1.headPose.yaw - pose2.headPose.yaw, 2) +
    Math.pow(pose1.headPose.roll - pose2.headPose.roll, 2)
  );
  
  const bodyYawDiff = Math.abs((pose1.bodyYaw || 0) - (pose2.bodyYaw || 0));
  
  return posDiff > threshold || rotDiff > 0.1 || bodyYawDiff > 0.1;
};

