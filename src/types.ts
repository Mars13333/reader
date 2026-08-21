export type SourceReference = {
  label: string;
  lines: string;
};

export type ScriptSegment = {
  id: string;
  section: string;
  kicker: string;
  narration: string;
  sourceRefs: SourceReference[];
};

export type PreparedSegment = ScriptSegment & {
  narrationDurationSeconds: number;
  narrationStartFrame: number;
  narrationEndFrame: number;
  startFrame: number;
  durationInFrames: number;
};

export type PreparedShot = {
  id: string;
  segmentId: string;
  section: string;
  kicker: string;
  image: string;
  panel: number;
  label: string;
  isSegmentStart: boolean;
  startFrame: number;
  durationInFrames: number;
};

export type PreparedVideo = {
  bookId: string;
  scriptSha256: string;
  title: string;
  author: string;
  angle: string;
  deliveryMode: 'audio-master';
  fps: number;
  width: number;
  height: number;
  totalFrames: number;
  totalDurationSeconds: number;
  audioFile: string;
  voice: {
    engine: string;
    name: string;
    speaker: string;
    speechRate: number;
  };
  segments: PreparedSegment[];
  shots: PreparedShot[];
};

export type CoverLayout = {
  left: number;
  eyebrowTop: number;
  headlineTop: number;
  badgeTop: number;
  artObjectPosition: string;
};

export type CoverConfig = {
  design?: 'legacy-poster' | 'book-jacket-v2';
  image: string;
  bookTitle?: string;
  eyebrow: string;
  headline?: [string, string, string];
  subtitle?: string;
  badge: string;
  treatment?: 'standard' | 'bright';
  layouts: {
    vertical9x16?: CoverLayout;
    portrait3x4: CoverLayout;
    landscape4x3: CoverLayout;
  };
};

export type CoverRenderProps = Omit<CoverConfig, 'layouts'> & {
  variant: 'vertical9x16' | 'portrait3x4' | 'landscape4x3';
  layout: CoverLayout;
};
