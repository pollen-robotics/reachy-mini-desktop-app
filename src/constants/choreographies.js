/**
 * Complete list of choreographies and movements available in the Reachy Mini daemon
 * Reference: http://localhost:8000/docs when the daemon is active
 * 
 * Datasets are hosted as libraries:
 * - API endpoint: /api/move/play/recorded-move-dataset/{dataset}/{move}
 * - Dataset list: /api/move/recorded-move-datasets/list/pollen-robotics/{library}
 */

export const CHOREOGRAPHY_DATASETS = {
  DANCES: 'pollen-robotics/reachy-mini-dances-library',
  EMOTIONS: 'pollen-robotics/reachy-mini-emotions-library',
};

export const DANCES = [
  'stumble_and_recover',
  'chin_lead',
  'head_tilt_roll',
  'jackson_square',
  'pendulum_swing',
  'side_glance_flick',
  'grid_snap',
  'simple_nod',
  'side_to_side_sway',
  'polyrhythm_combo',
  'interwoven_spirals',
  'uh_huh_tilt',
  'chicken_peck',
  'yeah_nod',
  'headbanger_combo',
  'side_peekaboo',
  'dizzy_spin',
  'neck_recoil',
  'groovy_sway_and_roll',
  'sharp_side_tilt',
];

// Complete list of all available emotions in the library
export const EMOTIONS = [
  'fear1',
  'exhausted1',
  'loving1',
  'dance3',
  'boredom2',
  'relief1',
  'anxiety1',
  'disgusted1',
  'welcoming1',
  'impatient1',
  'sad1',
  'helpful2',
  'resigned1',
  'amazed1',
  'thoughtful2',
  'lost1',
  'surprised1',
  'serenity1',
  'displeased1',
  'incomprehensible2',
  'irritated2',
  'yes_sad1',
  'dance2',
  'understanding1',
  'contempt1',
  'inquiring1',
  'rage1',
  'attentive2',
  'no1',
  'oops1',
  'proud3',
  'reprimand3',
  'reprimand2',
  'scared1',
  'no_excited1',
  'come1',
  'proud2',
  'success1',
  'enthusiastic2',
  'laughing1',
  'dying1',
  'success2',
  'enthusiastic1',
  'curious1',
  'laughing2',
  'tired1',
  'reprimand1',
  'proud1',
  'grateful1',
  'frustrated1',
  'calming1',
  'attentive1',
  'furious1',
  'oops2',
  'irritated1',
  'yes1',
  'confused1',
  'understanding2',
  'dance1',
  'shy1',
  'inquiring2',
  'uncertain1',
  'thoughtful1',
  'surprised2',
  'displeased2',
  'impatient2',
  'welcoming2',
  'indifferent1',
  'sad2',
  'helpful1',
  'lonely1',
  'cheerful1',
  'inquiring3',
  'downcast1',
  'sleep1',
  'boredom1',
  'uncomfortable1',
  'go_away1',
  'electric1',
  'relief2',
  'no_sad1',
];

// Selection of 15 main emotions with characteristic emojis
export const QUICK_EMOTIONS = [
  { name: 'loving1', emoji: '🥰', label: 'Love' },
  { name: 'sad1', emoji: '😢', label: 'Sad' },
  { name: 'surprised1', emoji: '😲', label: 'Surprised' },
  { name: 'cheerful1', emoji: '😊', label: 'Cheerful' },
  { name: 'rage1', emoji: '😠', label: 'Angry' },
  { name: 'fear1', emoji: '😨', label: 'Fear' },
  { name: 'tired1', emoji: '😴', label: 'Tired' },
  { name: 'laughing1', emoji: '😂', label: 'Laughing' },
  { name: 'confused1', emoji: '😕', label: 'Confused' },
  { name: 'proud1', emoji: '😎', label: 'Proud' },
  { name: 'grateful1', emoji: '🙏', label: 'Grateful' },
  { name: 'thoughtful1', emoji: '🤔', label: 'Thoughtful' },
  { name: 'welcoming1', emoji: '👋', label: 'Welcoming' },
  { name: 'curious1', emoji: '🤨', label: 'Curious' },
  { name: 'relief1', emoji: '😌', label: 'Relief' },
];

// Complete emoji mapping for all emotions
// Carefully curated for maximum expressiveness and distinction
export const EMOTION_EMOJIS = {
  // Fear & Anxiety
  'fear1': '😨',           // Fearful face
  'scared1': '😱',         // Screaming in fear
  'anxiety1': '😟',        // Worried face
  
  // Sadness & Melancholy
  'sad1': '😭',            // Loudly crying
  'sad2': '😢',            // Crying face
  'lonely1': '🥺',         // Pleading, lonely eyes
  'downcast1': '😔',       // Pensive, head down
  'resigned1': '😞',       // Disappointed, resigned
  'yes_sad1': '🥹',        // Holding back tears
  'no_sad1': '😥',         // Sad but relieved
  
  // Joy & Happiness
  'cheerful1': '😊',       // Smiling with closed eyes
  'loving1': '🥰',         // Smiling with hearts
  'laughing1': '😂',       // Tears of joy
  'laughing2': '🤣',       // Rolling on floor laughing
  'amazed1': '🤩',         // Star-struck, wow!
  'enthusiastic1': '🎊',   // Celebration
  'enthusiastic2': '🥳',   // Party face
  
  // Pride & Success
  'proud1': '😎',          // Cool with sunglasses
  'proud2': '🏆',          // Trophy winner
  'proud3': '💪',          // Strong, accomplished
  'success1': '✨',        // Sparkles of success
  'success2': '🌟',        // Glowing star
  
  // Anger & Frustration
  'rage1': '😡',           // Angry red face
  'furious1': '🤬',        // Symbols on mouth
  'irritated1': '😠',      // Angry face
  'irritated2': '😤',      // Steam from nose (variation)
  'frustrated1': '😫',     // Tired and frustrated
  'impatient1': '⏳',      // Waiting impatiently
  'impatient2': '🙄',      // Eye roll impatient
  
  // Surprise & Shock
  'surprised1': '😲',      // Astonished
  'surprised2': '😯',      // Hushed, surprised
  
  // Confusion & Uncertainty
  'confused1': '😕',       // Confused
  'lost1': '😵‍💫',          // Dizzy, disoriented
  'uncertain1': '🤨',      // Raised eyebrow
  'incomprehensible2': '🤷', // Shrug
  
  // Thought & Curiosity
  'thoughtful1': '🤔',     // Thinking face
  'thoughtful2': '💭',     // Thought bubble
  'curious1': '🧐',        // Monocle, investigating
  'inquiring1': '❓',      // Question
  'inquiring2': '🔍',      // Searching
  'inquiring3': '🤨',      // Raised eyebrow, questioning
  'attentive1': '👂',      // Listening
  'attentive2': '🦉',      // Owl - vigilant
  
  // Tiredness & Exhaustion
  'tired1': '😴',          // Sleeping
  'exhausted1': '😩',      // Weary face
  'sleep1': '💤',          // Zzz sleeping
  'boredom1': '🥱',        // Yawning
  'boredom2': '😑',        // Expressionless
  
  // Calm & Relief
  'relief1': '😌',         // Relieved
  'relief2': '😮‍💨',        // Exhaling
  'serenity1': '🧘',       // Meditation, peace
  'calming1': '☮️',        // Peace symbol
  
  // Disgust & Displeasure
  'disgusted1': '🤢',      // Nauseated
  'displeased1': '😒',     // Unamused
  'displeased2': '😑',     // Expressionless displeasure
  'contempt1': '🙄',       // Eye roll
  
  // Social & Interactive
  'welcoming1': '👋',      // Waving hello
  'welcoming2': '🤗',      // Hugging face
  'helpful1': '🙋',        // Raising hand
  'helpful2': '🤝',        // Handshake
  'grateful1': '🙏',       // Folded hands
  'understanding1': '💡',  // Light bulb moment
  'understanding2': '🤝',  // Mutual understanding
  
  // Negative Responses
  'no1': '🙅',             // No gesture
  'no_excited1': '🙅‍♂️',    // Emphatic no
  'go_away1': '👉',        // Pointing away
  'reprimand1': '😤',      // Stern disapproval
  'reprimand2': '😡',      // Angry red face
  'reprimand3': '🚫',      // Prohibited
  
  // Positive Responses
  'yes1': '👍',            // Thumbs up
  'come1': '🫴',           // Palm up, come here
  
  // Shyness & Discomfort
  'shy1': '😳',            // Flushed, embarrassed
  'uncomfortable1': '😬',  // Grimacing
  'oops1': '🫣',           // Peeking through fingers
  'oops2': '😅',           // Sweat smile
  
  // Special & Expressive
  'indifferent1': '😐',    // Neutral face
  'dying1': '😵',          // Knocked out, dramatic
  'electric1': '⚡',       // Electric energy
  
  // Dance emotions (in emotion library)
  'dance1': '💃',          // Dancing woman
  'dance2': '🕺',          // Dancing man
  'dance3': '🪩',          // Disco ball
};

// Complete emoji mapping for all dances
// Each dance has a unique, evocative emoji
export const DANCE_EMOJIS = {
  'stumble_and_recover': '🫨',   // Shaking, stumbling effect
  'chin_lead': '🎭',             // Theatrical, leading with chin
  'head_tilt_roll': '🔃',        // Rotating arrows
  'jackson_square': '🕴️',        // Levitating man (MJ style)
  'pendulum_swing': '🎐',        // Wind chime swinging
  'side_glance_flick': '👁️',     // Side eye flick
  'grid_snap': '🤖',             // Robotic precision
  'simple_nod': '😌',            // Gentle agreeing nod
  'side_to_side_sway': '🌊',     // Wave motion
  'polyrhythm_combo': '🥁',      // Drums, complex rhythm
  'interwoven_spirals': '🌀',    // Spiral pattern
  'uh_huh_tilt': '😏',           // Knowing smirk tilt
  'chicken_peck': '🐓',          // Rooster pecking
  'yeah_nod': '🙌',              // Celebration nod
  'headbanger_combo': '🤘',      // Rock on
  'side_peekaboo': '🙈',         // Peek-a-boo hiding
  'dizzy_spin': '💫',            // Dizzy stars
  'neck_recoil': '⚡',           // Quick electric snap
  'groovy_sway_and_roll': '🪩',  // Disco ball groove
  'sharp_side_tilt': '📐',       // Sharp angle
};

// Curated selection of emotions and dances for Quick Actions
// Avoids redundancy and provides a representative mix
export const QUICK_ACTIONS = [
  // Core emotions - diverse emotional range
  { name: 'loving1', emoji: '🥰', label: 'Love', type: 'emotion' },
  { name: 'cheerful1', emoji: '😊', label: 'Cheerful', type: 'emotion' },
  { name: 'laughing1', emoji: '😂', label: 'Laughing', type: 'emotion' },
  { name: 'surprised1', emoji: '😲', label: 'Surprised', type: 'emotion' },
  { name: 'curious1', emoji: '🤨', label: 'Curious', type: 'emotion' },
  { name: 'thoughtful1', emoji: '🤔', label: 'Thoughtful', type: 'emotion' },
  { name: 'proud1', emoji: '😎', label: 'Proud', type: 'emotion' },
  { name: 'grateful1', emoji: '🙏', label: 'Grateful', type: 'emotion' },
  { name: 'welcoming1', emoji: '👋', label: 'Welcoming', type: 'emotion' },
  { name: 'relief1', emoji: '😌', label: 'Relief', type: 'emotion' },
  { name: 'sad1', emoji: '😢', label: 'Sad', type: 'emotion' },
  { name: 'rage1', emoji: '😠', label: 'Angry', type: 'emotion' },
  { name: 'fear1', emoji: '😨', label: 'Fear', type: 'emotion' },
  { name: 'confused1', emoji: '😕', label: 'Confused', type: 'emotion' },
  
  // Dances - dynamic movements
  { name: 'jackson_square', emoji: '🎵', label: 'Jackson', type: 'dance' },
  { name: 'headbanger_combo', emoji: '🤘', label: 'Headbang', type: 'dance' },
  { name: 'groovy_sway_and_roll', emoji: '🎶', label: 'Groovy', type: 'dance' },
  { name: 'dizzy_spin', emoji: '🌀', label: 'Dizzy', type: 'dance' },
  { name: 'polyrhythm_combo', emoji: '🎹', label: 'Polyrhythm', type: 'dance' },
  { name: 'side_to_side_sway', emoji: '↔️', label: 'Sway', type: 'dance' },
  { name: 'pendulum_swing', emoji: '⏰', label: 'Pendulum', type: 'dance' },
  { name: 'stumble_and_recover', emoji: '🤸', label: 'Stumble', type: 'dance' },
  
  // Special actions
  { name: 'goto_sleep', emoji: '😴', label: 'Sleep', type: 'action' },
];

// Basic movements (via direct API)
export const BASIC_MOVES = {
  WAKE_UP: '/api/move/play/wake_up',
  GOTO_SLEEP: '/api/move/play/goto_sleep',
};

