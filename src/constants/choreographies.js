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

