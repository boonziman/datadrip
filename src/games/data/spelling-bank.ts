// 5 spelling words per round, easy → hard. We pick 5 deterministically per day.
// Words come from this curated list. The Free Dictionary API fills in audio + definitions live.

export const SPELLING_BANK: { word: string; difficulty: 1 | 2 | 3 | 4 | 5 }[] = [
  // Difficulty 1 - easy 4-5 letter common
  { word: 'apple', difficulty: 1 }, { word: 'ocean', difficulty: 1 },
  { word: 'pizza', difficulty: 1 }, { word: 'happy', difficulty: 1 },
  { word: 'jumps', difficulty: 1 }, { word: 'green', difficulty: 1 },
  { word: 'music', difficulty: 1 }, { word: 'water', difficulty: 1 },
  { word: 'cloud', difficulty: 1 }, { word: 'house', difficulty: 1 },
  { word: 'plant', difficulty: 1 }, { word: 'mouse', difficulty: 1 },
  { word: 'paper', difficulty: 1 }, { word: 'chair', difficulty: 1 },
  { word: 'light', difficulty: 1 }, { word: 'night', difficulty: 1 },
  { word: 'stone', difficulty: 1 }, { word: 'phone', difficulty: 1 },
  { word: 'beach', difficulty: 1 }, { word: 'smile', difficulty: 1 },
  // Difficulty 2 - intermediate
  { word: 'rhythm', difficulty: 2 }, { word: 'guitar', difficulty: 2 },
  { word: 'jungle', difficulty: 2 }, { word: 'breeze', difficulty: 2 },
  { word: 'pencil', difficulty: 2 }, { word: 'castle', difficulty: 2 },
  { word: 'forest', difficulty: 2 }, { word: 'cookie', difficulty: 2 },
  { word: 'bridge', difficulty: 2 }, { word: 'ginger', difficulty: 2 },
  { word: 'silver', difficulty: 2 }, { word: 'mirror', difficulty: 2 },
  { word: 'planet', difficulty: 2 }, { word: 'travel', difficulty: 2 },
  { word: 'window', difficulty: 2 }, { word: 'pretzel', difficulty: 2 },
  { word: 'orange', difficulty: 2 }, { word: 'rocket', difficulty: 2 },
  { word: 'dragon', difficulty: 2 }, { word: 'island', difficulty: 2 },
  // Difficulty 3 - tricky spellings
  { word: 'bouquet', difficulty: 3 }, { word: 'science', difficulty: 3 },
  { word: 'leisure', difficulty: 3 }, { word: 'kitchen', difficulty: 3 },
  { word: 'embassy', difficulty: 3 }, { word: 'jealous', difficulty: 3 },
  { word: 'caffeine', difficulty: 3 }, { word: 'mystery', difficulty: 3 },
  { word: 'quizzes', difficulty: 3 }, { word: 'rhubarb', difficulty: 3 },
  { word: 'synonym', difficulty: 3 }, { word: 'gallery', difficulty: 3 },
  { word: 'bicycle', difficulty: 3 }, { word: 'thirsty', difficulty: 3 },
  { word: 'diamond', difficulty: 3 }, { word: 'private', difficulty: 3 },
  { word: 'unicorn', difficulty: 3 }, { word: 'concert', difficulty: 3 },
  { word: 'octopus', difficulty: 3 }, { word: 'parsley', difficulty: 3 },
  // Difficulty 4 - advanced
  { word: 'February', difficulty: 4 }, { word: 'restaurant', difficulty: 4 },
  { word: 'committee', difficulty: 4 }, { word: 'parallel', difficulty: 4 },
  { word: 'separate', difficulty: 4 }, { word: 'definitely', difficulty: 4 },
  { word: 'necessary', difficulty: 4 }, { word: 'occasion', difficulty: 4 },
  { word: 'pneumonia', difficulty: 4 }, { word: 'recommend', difficulty: 4 },
  { word: 'mischief', difficulty: 4 }, { word: 'chocolate', difficulty: 4 },
  { word: 'beautiful', difficulty: 4 }, { word: 'colleague', difficulty: 4 },
  { word: 'dilemma', difficulty: 4 }, { word: 'mortgage', difficulty: 4 },
  { word: 'questionnaire', difficulty: 4 }, { word: 'guarantee', difficulty: 4 },
  { word: 'embarrass', difficulty: 4 }, { word: 'maintenance', difficulty: 4 },
  // Difficulty 5 - spelling bee level
  { word: 'onomatopoeia', difficulty: 5 }, { word: 'conscientious', difficulty: 5 },
  { word: 'archipelago', difficulty: 5 }, { word: 'connoisseur', difficulty: 5 },
  { word: 'idiosyncrasy', difficulty: 5 }, { word: 'liaison', difficulty: 5 },
  { word: 'silhouette', difficulty: 5 }, { word: 'vacuum', difficulty: 5 },
  { word: 'paraphernalia', difficulty: 5 }, { word: 'surreptitious', difficulty: 5 },
  { word: 'exhilarate', difficulty: 5 }, { word: 'nauseous', difficulty: 5 },
  { word: 'pseudonym', difficulty: 5 }, { word: 'camaraderie', difficulty: 5 },
  { word: 'chrysanthemum', difficulty: 5 }, { word: 'fluorescent', difficulty: 5 },
  { word: 'hierarchy', difficulty: 5 }, { word: 'inoculate', difficulty: 5 },
  { word: 'minuscule', difficulty: 5 }, { word: 'rendezvous', difficulty: 5 },
];

export interface SpellingRound {
  word: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  // Filled in by Free Dictionary API at runtime
  audioUrl?: string;
  definition?: string;
  example?: string;
  partOfSpeech?: string;
}
