/**
 * Liste complète des chorégraphies et mouvements disponibles dans le daemon Reachy Mini
 * Référence: http://localhost:8000/docs quand le daemon est actif
 * 
 * Les datasets sont hébergés comme des bibliothèques :
 * - API endpoint: /api/move/play/recorded-move-dataset/{dataset}/{move}
 * - Liste datasets: /api/move/recorded-move-datasets/list/pollen-robotics/{library}
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
];

// Mouvements de base (via l'API directe)
export const BASIC_MOVES = {
  WAKE_UP: '/api/move/play/wake_up',
  GOTO_SLEEP: '/api/move/play/goto_sleep',
};

