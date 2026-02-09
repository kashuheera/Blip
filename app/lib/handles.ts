type HandleWordlist = {
  adjectives: string[];
  nouns: string[];
};

const GEN_Z_YEARS = { from: 1997, to: 2012 } as const;

const WORDLISTS: Record<'genz' | 'general', HandleWordlist> = {
  genz: {
    adjectives: [
      'vibey',
      'glitchy',
      'lowkey',
      'noisy',
      'neon',
      'drippy',
      'snappy',
      'cosmic',
      'pixel',
      'hyper',
      'minty',
      'stellar',
      'silly',
      'swift',
      'breezy',
      'sunset',
      'midnight',
      'dreamy',
      'holo',
      'spark',
    ],
    nouns: [
      'runner',
      'garden',
      'doodle',
      'comet',
      'byte',
      'orbit',
      'sprite',
      'sketch',
      'echo',
      'atlas',
      'spark',
      'basil',
      'mango',
      'tiger',
      'panda',
      'lilac',
      'mochi',
      'noodle',
      'biryani',
      'cafe',
    ],
  },
  general: {
    adjectives: [
      'steady',
      'gentle',
      'quiet',
      'brave',
      'swift',
      'golden',
      'silver',
      'amber',
      'cobalt',
      'velvet',
      'lunar',
      'stellar',
      'breezy',
      'sunny',
      'rainy',
      'midnight',
      'glassy',
      'witty',
      'clever',
      'calm',
    ],
    nouns: [
      'garden',
      'sparrow',
      'nomad',
      'river',
      'pioneer',
      'atlas',
      'lantern',
      'harbor',
      'orchid',
      'baker',
      'tinker',
      'voyager',
      'saffron',
      'cinnamon',
      'basil',
      'tiger',
      'falcon',
      'studio',
      'cafe',
      'market',
    ],
  },
};

const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
};

export const getHandleWordlistKey = (birthYear?: number | null): 'genz' | 'general' => {
  if (typeof birthYear === 'number' && birthYear >= GEN_Z_YEARS.from && birthYear <= GEN_Z_YEARS.to) {
    return 'genz';
  }
  return 'general';
};

export const generateHandleCandidate = ({
  userId,
  birthYear,
  bucket,
  attempt,
}: {
  userId: string;
  birthYear?: number | null;
  bucket: number;
  attempt: number;
}): string => {
  const wordlist = WORDLISTS[getHandleWordlistKey(birthYear)];
  const seed = fnv1a32(`${userId}:${bucket}:${attempt}`);
  const adjective = wordlist.adjectives[seed % wordlist.adjectives.length] ?? 'steady';
  const noun = wordlist.nouns[Math.floor(seed / 101) % wordlist.nouns.length] ?? 'garden';
  const digits = String((seed % 900) + 100); // 100-999
  return `${adjective}${noun}${digits}`.toLowerCase();
};

