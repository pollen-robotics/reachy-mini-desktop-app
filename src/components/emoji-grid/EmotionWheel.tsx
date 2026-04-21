import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import useSound from 'use-sound';
import gsap from 'gsap';
import { CircularProgress } from '@mui/material';
import {
  EMOTION_EMOJIS,
  WHEEL_EMOTIONS,
  labelFromActionName,
  type EmojiGridAction,
} from '@constants/choreographies';
import diceRollSound from '@assets/sounds/dice.mp3';
import tickSound from '@assets/sounds/bite.mp3';
import { DiceIcon } from './DiceIcon';
import { ACCENT_ORANGE, accentRgba } from './theme';

/** Visual sizing for the wheel layout. */
const WHEEL_SIZE = 380;
const CENTER_SIZE = 160;
const EMOJI_SIZE = 36;
const DICE_SIZE = 30;

/** Spin animation timing parameters. */
const SPIN_BASE_DELAY_MS = 50;
const SPIN_MAX_DELAY_MS = 250;
const SPIN_EASING_EXPONENT = 4;
const SPIN_FULL_ROTATIONS_MIN = 1;
const SPIN_FULL_ROTATIONS_RANGE = 2; // 1 or 2 extra rotations
const SPIN_RESOLVE_DELAY_MS = 150;
const SPIN_HIDE_DICE_DELAY_MS = 1500;

const FALLBACK_EMOJI = '😐';

/** Helper to create an SVG arc path for a pie slice. */
function createArcPath(
  centerX: number,
  centerY: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number
): string {
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

/** Build an EmojiGridAction payload for a given emotion name. */
function actionFor(name: string): EmojiGridAction {
  return { name, type: 'emotion', label: labelFromActionName(name) };
}

export interface EmotionWheelProps {
  onAction?: (action: EmojiGridAction) => void;
  darkMode?: boolean;
  disabled?: boolean;
  isBusy?: boolean;
  activeActionName?: string | null;
  isExecuting?: boolean;
}

export interface EmotionWheelHandle {
  triggerRandom: () => void;
}

/**
 * EmotionWheel - A circular wheel of curated emotions with a random-spin center.
 *
 * Active slice resolution:
 * - While spinning, the active slice is driven by the local `spinIndex` state.
 * - Otherwise, it is derived from `activeActionName` (single source of truth),
 *   so parent-driven execution state stays in sync without a dedicated reset effect.
 */
export const EmotionWheel = forwardRef<EmotionWheelHandle, EmotionWheelProps>(function EmotionWheel(
  {
    onAction,
    darkMode = false,
    disabled = false,
    isBusy = false,
    activeActionName = null,
    isExecuting = false,
  },
  ref
) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const [centerHovered, setCenterHovered] = useState<boolean>(false);

  // Spinning animation state. `spinIndex` drives the rolling highlight; null
  // outside of a spin (highlight then comes from `activeActionName`).
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [spinIndex, setSpinIndex] = useState<number | null>(null);
  const [diceValue, setDiceValue] = useState<{ dice1: number; dice2: number }>({
    dice1: 5,
    dice2: 3,
  });

  // All timeouts created during a spin, tracked so we can flush them on unmount.
  const spinTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const trackTimeout = useCallback((id: ReturnType<typeof setTimeout>) => {
    spinTimeoutsRef.current.add(id);
    return id;
  }, []);

  // Refs for GSAP animations
  const dice1Ref = useRef<HTMLDivElement | null>(null);
  const dice2Ref = useRef<HTMLDivElement | null>(null);
  const diceContainerRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  // `useSound` returns a stable reference for the play callback, so we can
  // depend on it directly without an intermediary ref.
  const [playDiceSound] = useSound(diceRollSound, { volume: 0.25 });
  const [playTick] = useSound(tickSound, { volume: 0.035 });

  const showDice = useCallback(() => {
    const tl = gsap.timeline();
    tl.to(diceContainerRef.current, {
      height: 'auto',
      duration: 0.15,
      ease: 'power2.out',
    });
    tl.fromTo(
      [dice1Ref.current, dice2Ref.current],
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
    tl.to(labelRef.current, { y: 0, duration: 0.15, ease: 'power2.out' }, '-=0.2');
    return tl;
  }, []);

  const hideDice = useCallback(() => {
    const tl = gsap.timeline();
    tl.to([dice2Ref.current, dice1Ref.current], {
      y: -25,
      opacity: 0,
      duration: 0.18,
      stagger: 0.06,
      ease: 'power2.in',
    });
    tl.to(diceContainerRef.current, { height: 0, duration: 0.12, ease: 'power2.in' }, '-=0.08');
    tl.to(labelRef.current, { y: -8, duration: 0.15, ease: 'power2.out' }, '-=0.15');
    return tl;
  }, []);

  // Layout math - memoized so we only recompute if the sizing constants change.
  const layout = useMemo(() => {
    const angleStep = 360 / WHEEL_EMOTIONS.length;
    const centerX = WHEEL_SIZE / 2;
    const centerY = WHEEL_SIZE / 2;
    const innerRadius = CENTER_SIZE / 2;
    const outerRadius = WHEEL_SIZE / 2 - 2;
    const emojiRadius = (innerRadius + outerRadius) / 2;
    return { angleStep, centerX, centerY, innerRadius, outerRadius, emojiRadius };
  }, []);

  const handleClick = useCallback(
    (emotion: string) => {
      if (disabled || isSpinning || !onAction) return;
      onAction(actionFor(emotion));
    },
    [disabled, isSpinning, onAction]
  );

  const handleRandom = useCallback(() => {
    if (disabled || isSpinning || !onAction) return;

    showDice();
    playDiceSound();

    setIsSpinning(true);

    // Pick final dice values first, then derive the winning slice from their sum.
    const finalDice1 = Math.floor(Math.random() * 6) + 1;
    const finalDice2 = Math.floor(Math.random() * 6) + 1;
    const diceSum = finalDice1 + finalDice2;
    const finalIndex = (diceSum - 1) % WHEEL_EMOTIONS.length;

    const fullRotations =
      SPIN_FULL_ROTATIONS_MIN + Math.floor(Math.random() * SPIN_FULL_ROTATIONS_RANGE);
    const totalSteps = fullRotations * WHEEL_EMOTIONS.length + finalIndex;

    let currentStep = 0;
    let currentIndex = 0;

    const spin = (): void => {
      playTick();

      // Keep rolling random dice visuals until we land on the final step.
      if (currentStep >= totalSteps) {
        setDiceValue({ dice1: finalDice1, dice2: finalDice2 });
      } else {
        setDiceValue({
          dice1: Math.floor(Math.random() * 6) + 1,
          dice2: Math.floor(Math.random() * 6) + 1,
        });
      }

      setSpinIndex(currentIndex);
      currentStep++;
      currentIndex = (currentIndex + 1) % WHEEL_EMOTIONS.length;

      if (currentStep <= totalSteps) {
        const progress = currentStep / totalSteps;
        const delay =
          SPIN_BASE_DELAY_MS +
          (SPIN_MAX_DELAY_MS - SPIN_BASE_DELAY_MS) * Math.pow(progress, SPIN_EASING_EXPONENT);
        trackTimeout(setTimeout(spin, delay));
        return;
      }

      // Spin finished - dispatch the selected emotion and schedule the dice
      // hide animation. Both timeouts are tracked for unmount cleanup.
      trackTimeout(
        setTimeout(() => {
          onAction(actionFor(WHEEL_EMOTIONS[finalIndex]));
          setIsSpinning(false);
          trackTimeout(
            setTimeout(() => {
              hideDice();
            }, SPIN_HIDE_DICE_DELAY_MS)
          );
        }, SPIN_RESOLVE_DELAY_MS)
      );
    };

    spin();
  }, [disabled, isSpinning, onAction, playDiceSound, playTick, showDice, hideDice, trackTimeout]);

  useImperativeHandle(ref, () => ({ triggerRandom: handleRandom }), [handleRandom]);

  // Flush pending timeouts on unmount so callbacks don't fire into a dead tree.
  useEffect(() => {
    const timeouts = spinTimeoutsRef.current;
    return () => {
      timeouts.forEach(id => clearTimeout(id));
      timeouts.clear();
    };
  }, []);

  // When the robot stops being busy, ensure we don't keep a stale highlight on
  // a spin that already resolved. Handled by deriving `activeIndex` below,
  // plus a defensive reset of `spinIndex` once the parent signals it's free.
  useEffect(() => {
    if (!isBusy && !isSpinning) {
      setSpinIndex(null);
    }
  }, [isBusy, isSpinning]);

  // Derived active slice: during a spin, the rolling index; otherwise the
  // parent-driven active emotion. This removes the need for a duplicated
  // `activeIndex` local state on click.
  const activeEmotionIndex = useMemo<number | null>(() => {
    if (isSpinning) return spinIndex;
    if (activeActionName) {
      const idx = WHEEL_EMOTIONS.indexOf(activeActionName as (typeof WHEEL_EMOTIONS)[number]);
      return idx === -1 ? null : idx;
    }
    return null;
  }, [isSpinning, spinIndex, activeActionName]);

  const borderColor = accentRgba(darkMode ? 0.4 : 0.5);
  const segmentBorder = accentRgba(darkMode ? 0.25 : 0.3);

  return (
    <div
      className="emotion-wheel"
      style={{
        position: 'relative',
        width: WHEEL_SIZE,
        height: WHEEL_SIZE,
        margin: '0 auto',
      }}
    >
      <style>{`
        @keyframes diceShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-2px); }
          75% { transform: translateX(2px); }
        }
        @keyframes emotionWheelMount {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .emotion-wheel {
          animation: emotionWheelMount 0.15s ease both;
        }
      `}</style>

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
        viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
      >
        {WHEEL_EMOTIONS.map((emotion, index) => {
          const startAngle = index * layout.angleStep;
          const endAngle = (index + 1) * layout.angleStep;
          const path = createArcPath(
            layout.centerX,
            layout.centerY,
            layout.innerRadius,
            layout.outerRadius,
            startAngle,
            endAngle
          );

          const isHovered = hoveredIndex === index;
          const isPressed = pressedIndex === index;
          const isActive = activeEmotionIndex === index;
          const showHighlight = isActive || (!isSpinning && isHovered);
          const label = labelFromActionName(emotion);

          return (
            <path
              key={`slice-${emotion}`}
              d={path}
              fill="transparent"
              stroke={isPressed ? ACCENT_ORANGE : showHighlight ? ACCENT_ORANGE : 'transparent'}
              strokeWidth={showHighlight || isPressed ? 2 : 0}
              style={{
                cursor: disabled || isSpinning ? 'default' : 'pointer',
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

        {WHEEL_EMOTIONS.map((emotion, index) => {
          const angle = (index * layout.angleStep - 90) * (Math.PI / 180);
          const x1 = layout.centerX + Math.cos(angle) * layout.innerRadius;
          const y1 = layout.centerY + Math.sin(angle) * layout.innerRadius;
          const x2 = layout.centerX + Math.cos(angle) * layout.outerRadius;
          const y2 = layout.centerY + Math.sin(angle) * layout.outerRadius;

          return (
            <line
              key={`line-${emotion}`}
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

      {WHEEL_EMOTIONS.map((emotion, index) => {
        const angle = (index * layout.angleStep + layout.angleStep / 2 - 90) * (Math.PI / 180);
        const x = Math.cos(angle) * layout.emojiRadius;
        const y = Math.sin(angle) * layout.emojiRadius;

        const isHovered = hoveredIndex === index;
        const isActive = activeEmotionIndex === index;
        const isActiveAction = activeActionName === emotion;
        const showSpinner = isActiveAction && isExecuting && !isSpinning;
        const emoji = (EMOTION_EMOJIS as Record<string, string>)[emotion] || FALLBACK_EMOJI;
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
              fontSize: EMOJI_SIZE,
              lineHeight: 1,
              pointerEvents: 'none',
              opacity: isGhosted ? 0.4 : 1,
              filter: showHighlight
                ? `drop-shadow(0 2px 8px ${accentRgba(0.5)}) saturate(1.2)`
                : isGhosted
                  ? 'saturate(0.5) grayscale(0.3)'
                  : 'saturate(0.85)',
              transition: isSpinning ? 'all 0.06s ease-out' : 'all 0.25s ease',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: EMOJI_SIZE,
              height: EMOJI_SIZE,
            }}
          >
            {showSpinner ? (
              <CircularProgress size={24} thickness={3} sx={{ color: ACCENT_ORANGE }} />
            ) : (
              emoji
            )}
          </div>
        );
      })}

      {/* Center button - Random */}
      <button
        onClick={handleRandom}
        onMouseEnter={() => setCenterHovered(true)}
        onMouseLeave={() => setCenterHovered(false)}
        disabled={disabled || isSpinning}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: CENTER_SIZE,
          height: CENTER_SIZE,
          borderRadius: '50%',
          border: `1px solid ${isSpinning ? ACCENT_ORANGE : centerHovered ? accentRgba(0.7) : borderColor}`,
          background: darkMode ? 'rgba(25,25,25,0.95)' : 'rgba(255,255,255,0.95)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          cursor: disabled || isSpinning ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow:
            centerHovered || isSpinning
              ? `0 6px 24px ${accentRgba(0.35)}`
              : darkMode
                ? '0 4px 20px rgba(0,0,0,0.4)'
                : '0 4px 20px rgba(0,0,0,0.08)',
          transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
          zIndex: 5,
        }}
      >
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
          <div ref={dice1Ref} style={{ opacity: 0 }}>
            <DiceIcon value={diceValue.dice1} size={DICE_SIZE} isShaking={isSpinning} />
          </div>
          <div ref={dice2Ref} style={{ opacity: 0 }}>
            <DiceIcon value={diceValue.dice2} size={DICE_SIZE} isShaking={isSpinning} />
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
    </div>
  );
});
