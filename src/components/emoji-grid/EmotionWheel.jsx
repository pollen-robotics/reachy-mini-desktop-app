import React, { useState, useCallback, useRef } from 'react';
import useSound from 'use-sound';
import gsap from 'gsap';
import { EMOTION_EMOJIS } from '@constants/choreographies';
import diceRollSound from '@assets/sounds/dice.mp3';
import tickSound from '@assets/sounds/bite.mp3';

/**
 * DiceIcon - A dice component that shows dots (1-6)
 * Styled to match the wheel aesthetic
 */
function DiceIcon({ value = 6, size = 32, color = '#FF9500', isShaking = false }) {
  const dotSize = size * 0.16;
  
  // Dot positions for each dice value (as percentage from center)
  // Using simpler grid: 0 = 25%, 1 = 50%, 2 = 75%
  const dotPatterns = {
    1: [[1, 1]], // center
    2: [[0, 0], [2, 2]], // top-left, bottom-right
    3: [[0, 0], [1, 1], [2, 2]], // diagonal
    4: [[0, 0], [2, 0], [0, 2], [2, 2]], // corners
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], // corners + center
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]], // 2 columns of 3
  };
  
  const dots = dotPatterns[value] || dotPatterns[6];
  
  // Grid positions: 25%, 50%, 75%
  const positions = [0.25, 0.5, 0.75];
  
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.2,
        border: `1px solid ${color}`,
        position: 'relative',
        boxSizing: 'border-box',
        animation: isShaking ? 'diceShake 0.1s ease-in-out infinite' : 'none',
        pointerEvents: 'none', // Let clicks pass through to button
      }}
    >
      {dots.map(([col, row], i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: color,
            left: `calc(${positions[col] * 100}% - ${dotSize / 2}px)`,
            top: `calc(${positions[row] * 100}% - ${dotSize / 2}px)`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Curated emotions for the wheel - 12 emotions arranged in a circle
 */
const WHEEL_EMOTIONS = [
  'amazed1',
  'attentive2',
  'inquiring3',
  'anxiety1',
  'downcast1',
  'lost1',
  'sad1',
  'sad2',
  'dying1',
  'irritated1',
  'reprimand1',
  'reprimand2',
];

/**
 * Helper to create an arc path for a pie slice
 */
function createArcPath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle) {
  const startAngleRad = (startAngle - 90) * (Math.PI / 180);
  const endAngleRad = (endAngle - 90) * (Math.PI / 180);
  
  const x1Outer = centerX + Math.cos(startAngleRad) * outerRadius;
  const y1Outer = centerY + Math.sin(startAngleRad) * outerRadius;
  const x2Outer = centerX + Math.cos(endAngleRad) * outerRadius;
  const y2Outer = centerY + Math.sin(endAngleRad) * outerRadius;
  
  const x1Inner = centerX + Math.cos(endAngleRad) * innerRadius;
  const y1Inner = centerY + Math.sin(endAngleRad) * innerRadius;
  const x2Inner = centerX + Math.cos(startAngleRad) * innerRadius;
  const y2Inner = centerY + Math.sin(startAngleRad) * innerRadius;
  
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
  
  return `
    M ${x1Outer} ${y1Outer}
    A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2Outer} ${y2Outer}
    L ${x1Inner} ${y1Inner}
    A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x2Inner} ${y2Inner}
    Z
  `;
}

/**
 * EmotionWheel - A circular wheel of 12 curated emotions
 * Centered, large, and visually striking
 */
export function EmotionWheel({
  onAction,
  darkMode = false,
  disabled = false,
  isBusy = false,
}) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [pressedIndex, setPressedIndex] = useState(null);
  const [centerHovered, setCenterHovered] = useState(false);
  const [centerPressed, setCenterPressed] = useState(false);
  
  // Prevent flash on mount - hide until positioned
  const [isReady, setIsReady] = useState(false);
  React.useEffect(() => {
    // Small delay to ensure layout is complete
    const timer = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);
  
  // Spinning animation state
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeIndex, setActiveIndex] = useState(null);
  const [diceValue, setDiceValue] = useState({ dice1: 5, dice2: 3 });
  const spinTimeoutRef = useRef(null);
  
  // Refs for GSAP animations
  const dice1Ref = useRef(null);
  const dice2Ref = useRef(null);
  const diceContainerRef = useRef(null);
  const labelRef = useRef(null);
  
  // Sounds
  const [playDiceSound] = useSound(diceRollSound, { volume: 0.25 });
  const [playTick] = useSound(tickSound, { volume: 0.15 });

  // GSAP animation functions
  const showDice = useCallback(() => {
    const tl = gsap.timeline();
    
    // Show container first
    tl.to(diceContainerRef.current, {
      height: 'auto',
      duration: 0.15,
      ease: 'power2.out',
    });
    
    // Dice fall from top - staggered, like dropping onto surface
    tl.fromTo([dice1Ref.current, dice2Ref.current], 
      { y: -30, opacity: 0 },
      { 
        y: 0, 
        opacity: 1, 
        duration: 0.25, 
        stagger: 0.08,
        ease: 'bounce.out',
      },
      '-=0.05'
    );
    
    // Move label down
    tl.to(labelRef.current, {
      y: 0,
      duration: 0.15,
      ease: 'power2.out',
    }, '-=0.2');
    
    return tl;
  }, []);

  const hideDice = useCallback(() => {
    const tl = gsap.timeline();
    
    // Dice fly up and fade - staggered reverse
    tl.to([dice2Ref.current, dice1Ref.current], {
      y: -25,
      opacity: 0,
      duration: 0.18,
      stagger: 0.06,
      ease: 'power2.in',
    });
    
    // Hide container
    tl.to(diceContainerRef.current, {
      height: 0,
      duration: 0.12,
      ease: 'power2.in',
    }, '-=0.08');
    
    // Center label back up
    tl.to(labelRef.current, {
      y: -8,
      duration: 0.15,
      ease: 'power2.out',
    }, '-=0.15');
    
    return tl;
  }, []);
  
  // Ref for tick sound to use in animation closure
  const playTickRef = useRef(playTick);
  playTickRef.current = playTick;

  const wheelSize = 380;
  const centerSize = 140;
  const emojiSize = 36;
  
  // Calculate positions for 12 items in a circle
  const angleStep = 360 / WHEEL_EMOTIONS.length;
  const centerX = wheelSize / 2;
  const centerY = wheelSize / 2;
  const innerRadius = centerSize / 2; // Touching the center button
  const outerRadius = wheelSize / 2 - 2; // Small gap from edge
  const emojiRadius = (innerRadius + outerRadius) / 2; // Center of the slice

  const handleClick = useCallback((emotion) => {
    if (disabled || isSpinning || !onAction) return;
    // Set active index to show highlight during animation
    const index = WHEEL_EMOTIONS.indexOf(emotion);
    if (index !== -1) {
      setActiveIndex(index);
    }
    onAction({
      name: emotion,
      type: 'emotion',
      label: emotion.replace(/[0-9]+$/, '').replace(/_/g, ' '),
    });
  }, [disabled, isSpinning, onAction]);

  const handleRandom = useCallback(() => {
    if (disabled || isSpinning || !onAction) return;
    
    // Show dice with GSAP staggered animation
    showDice();
    
    // Play dice roll sound
    playDiceSound();
    
    setIsSpinning(true);
    
    // Generate random dice values first, then calculate final index from their sum
    const finalDice1 = Math.floor(Math.random() * 6) + 1;
    const finalDice2 = Math.floor(Math.random() * 6) + 1;
    
    // Final position = sum of dice - 1 (sum 2-12 maps to positions 1-11, with wrap for 0)
    const diceSum = finalDice1 + finalDice2;
    const finalIndex = (diceSum - 1) % WHEEL_EMOTIONS.length;
    
    // Calculate total steps: 2-3 full rotations + final position
    const fullRotations = 2 + Math.floor(Math.random() * 2); // 2 or 3 rotations
    const totalSteps = (fullRotations * WHEEL_EMOTIONS.length) + finalIndex;
    
    let currentStep = 0;
    let currentIndex = 0; // Always start from index 0
    
    const spin = () => {
      // Play tick sound for each step
      playTickRef.current();
      
      // Change dice values randomly during spin, show final values at the end
      const stepsRemaining = totalSteps - currentStep;
      if (stepsRemaining <= 3) {
        // Show final dice values for last few steps
        setDiceValue({ dice1: finalDice1, dice2: finalDice2 });
      } else {
        // Random dice during spin
        setDiceValue({ 
          dice1: Math.floor(Math.random() * 6) + 1,
          dice2: Math.floor(Math.random() * 6) + 1
        });
      }
      
      setActiveIndex(currentIndex);
      currentStep++;
      currentIndex = (currentIndex + 1) % WHEEL_EMOTIONS.length;
      
      if (currentStep <= totalSteps) {
        // Easing: start fast, slow down dramatically towards the end
        const progress = currentStep / totalSteps;
        // Cubic bezier-like easing for natural deceleration
        const baseDelay = 55;
        const maxDelay = 350;
        // Use higher exponent (4) for more dramatic slowdown at the end
        const delay = baseDelay + (maxDelay - baseDelay) * Math.pow(progress, 4);
        
        spinTimeoutRef.current = setTimeout(spin, delay);
      } else {
        // Animation finished - trigger the action
        const finalEmotion = WHEEL_EMOTIONS[finalIndex];
        
        // Small delay before triggering to let the user see the result
        setTimeout(() => {
          onAction({
            name: finalEmotion,
            type: 'emotion',
            label: finalEmotion.replace(/[0-9]+$/, '').replace(/_/g, ' '),
          });
          // Set isSpinning false after action is triggered (isBusy will take over)
          setIsSpinning(false);
          
          // Hide dice after a longer delay with GSAP staggered reverse animation
          setTimeout(() => {
            hideDice();
          }, 1500);
        }, 150);
      }
    };
    
    // Start the spin
    spin();
  }, [disabled, isSpinning, onAction, playDiceSound]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  // Clear active index when robot stops being busy
  const prevIsBusyRef = useRef(isBusy);
  React.useEffect(() => {
    // When isBusy goes from true to false, clear the active index
    if (prevIsBusyRef.current && !isBusy && activeIndex !== null) {
      setActiveIndex(null);
    }
    prevIsBusyRef.current = isBusy;
  }, [isBusy, activeIndex]);

  // Keyboard shortcut: Space for random
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        handleRandom();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRandom]);

  // Colors
  const borderColor = darkMode ? 'rgba(255,149,0,0.4)' : 'rgba(255,149,0,0.5)';
  const segmentBorder = darkMode ? 'rgba(255,149,0,0.25)' : 'rgba(255,149,0,0.3)';
  const highlightBorder = '#FF9500';
  const pressedBorder = '#FF9500';

  return (
    <div
      style={{
        position: 'relative',
        width: wheelSize,
        height: wheelSize,
        margin: '0 auto',
        opacity: isReady ? 1 : 0,
        transition: 'opacity 0.15s ease',
      }}
    >
      {/* Outer ring background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          border: `1px solid ${borderColor}`,
          background: darkMode 
            ? 'radial-gradient(circle at center, rgba(30,30,30,0.6) 0%, rgba(20,20,20,0.9) 100%)'
            : 'radial-gradient(circle at center, rgba(255,255,255,0.8) 0%, rgba(245,245,245,0.95) 100%)',
          boxShadow: darkMode
            ? '0 8px 32px rgba(0,0,0,0.25), inset 0 0 60px rgba(255,149,0,0.025)'
            : '0 8px 32px rgba(0,0,0,0.05), inset 0 0 60px rgba(255,149,0,0.015)',
        }}
      />

      {/* SVG for segments and interactions */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
        viewBox={`0 0 ${wheelSize} ${wheelSize}`}
      >
        {/* Pie slice segments - clickable areas with highlight */}
        {WHEEL_EMOTIONS.map((emotion, index) => {
          const startAngle = index * angleStep;
          const endAngle = (index + 1) * angleStep;
          const path = createArcPath(centerX, centerY, innerRadius, outerRadius, startAngle, endAngle);
          
          const isHovered = hoveredIndex === index;
          const isPressed = pressedIndex === index;
          const isActive = activeIndex === index;
          const showHighlight = isActive || (!isSpinning && isHovered);
          const label = emotion.replace(/_/g, ' ');
          
          return (
            <path
              key={`slice-${index}`}
              d={path}
              fill="transparent"
              stroke={isPressed ? pressedBorder : showHighlight ? highlightBorder : 'transparent'}
              strokeWidth={showHighlight || isPressed ? 2 : 0}
              style={{
                cursor: (disabled || isSpinning) ? 'default' : 'pointer',
                transition: isSpinning ? 'stroke 0.06s ease-out' : 'stroke 0.15s ease',
              }}
              onMouseEnter={() => !isSpinning && setHoveredIndex(index)}
              onMouseLeave={() => {
                setHoveredIndex(null);
                setPressedIndex(null);
              }}
              onMouseDown={() => !isSpinning && setPressedIndex(index)}
              onMouseUp={() => setPressedIndex(null)}
              onClick={() => handleClick(emotion)}
            >
              <title>{label}</title>
            </path>
          );
        })}
        
        {/* Segment divider lines - from inner to outer radius */}
        {WHEEL_EMOTIONS.map((_, index) => {
          const angle = (index * angleStep - 90) * (Math.PI / 180);
          
          const x1 = centerX + Math.cos(angle) * innerRadius;
          const y1 = centerY + Math.sin(angle) * innerRadius;
          const x2 = centerX + Math.cos(angle) * outerRadius;
          const y2 = centerY + Math.sin(angle) * outerRadius;
          
          return (
            <line
              key={`line-${index}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={segmentBorder}
              strokeWidth="1"
              style={{ pointerEvents: 'none' }}
            />
          );
        })}
      </svg>

      {/* Emoji labels - positioned in center of each slice */}
      {WHEEL_EMOTIONS.map((emotion, index) => {
        const angle = ((index * angleStep) + (angleStep / 2) - 90) * (Math.PI / 180);
        const x = Math.cos(angle) * emojiRadius;
        const y = Math.sin(angle) * emojiRadius;
        
        const isHovered = hoveredIndex === index;
        const isActive = activeIndex === index;
        const emoji = EMOTION_EMOJIS[emotion] || '😐';
        const showHighlight = isActive || (!isSpinning && isHovered);
        const isGhosted = (isBusy || isSpinning) && !isActive;
        
        return (
          <div
            key={`emoji-${emotion}`}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
              fontSize: emojiSize,
              lineHeight: 1,
              pointerEvents: 'none',
              opacity: isGhosted ? 0.4 : 1,
              filter: showHighlight 
                ? 'drop-shadow(0 2px 8px rgba(255,149,0,0.5)) saturate(1.2)' 
                : isGhosted 
                  ? 'saturate(0.5) grayscale(0.3)'
                  : 'saturate(0.85)',
              transition: isSpinning ? 'all 0.06s ease-out' : 'all 0.25s ease',
              zIndex: 2,
            }}
          >
            {emoji}
          </div>
        );
      })}

      {/* Center button - Random */}
      <button
        onClick={handleRandom}
        onMouseEnter={() => setCenterHovered(true)}
        onMouseLeave={() => {
          setCenterHovered(false);
          setCenterPressed(false);
        }}
        onMouseDown={() => setCenterPressed(true)}
        onMouseUp={() => setCenterPressed(false)}
        disabled={disabled || isSpinning}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: centerSize,
          height: centerSize,
          borderRadius: '50%',
          border: `1px solid ${isSpinning ? '#FF9500' : centerHovered ? 'rgba(255,149,0,0.7)' : borderColor}`,
          background: darkMode 
            ? 'rgba(25,25,25,0.95)'
            : 'rgba(255,255,255,0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: (disabled || isSpinning) ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: (centerHovered || isSpinning)
            ? '0 6px 24px rgba(255,149,0,0.35)'
            : darkMode
              ? '0 4px 20px rgba(0,0,0,0.4)'
              : '0 4px 20px rgba(0,0,0,0.08)',
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 5,
        }}
      >
        {/* Dice pair with GSAP staggered animation */}
        <div 
          ref={diceContainerRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 0,
            overflow: 'visible',
          }}
        >
          {/* First die */}
          <div ref={dice1Ref} style={{ opacity: 0 }}>
            <DiceIcon 
              value={diceValue.dice1}
              size={30}
              color="#FF9500"
              isShaking={isSpinning}
            />
          </div>
          {/* Second die */}
          <div ref={dice2Ref} style={{ opacity: 0 }}>
            <DiceIcon 
              value={diceValue.dice2}
              size={30}
              color="#FF9500"
              isShaking={isSpinning}
            />
          </div>
        </div>
        <span
          ref={labelRef}
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            transform: 'translateY(-8px)',
          }}
        >
          random
        </span>
      </button>

      {/* CSS animation for shaking dice icon */}
      <style>{`
        @keyframes diceShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
      `}</style>
    </div>
  );
}
