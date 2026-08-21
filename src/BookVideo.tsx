import React from 'react';
import cover from '../.runtime/cover.json';
import videoLayout from '../.runtime/video-layout.json';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type {PreparedShot, PreparedVideo} from './types';

const COLORS = {
  ink: '#07131a',
  paper: '#efe2c1',
  cinnabar: '#d54132',
  gold: '#c7a867',
};

const visualTreatment =
  (videoLayout as {
    visualTreatment?: {
      brightness?: number;
      saturation?: number;
      contrast?: number;
      topShade?: number;
      bottomShade?: number;
      backgroundColor?: string;
    };
  }).visualTreatment ?? {};
const imageBrightness = visualTreatment.brightness ?? 0.9;
const imageSaturation = visualTreatment.saturation ?? 0.94;
const imageContrast = visualTreatment.contrast ?? 1.04;
const topShade = visualTreatment.topShade ?? 0.42;
const bottomShade = visualTreatment.bottomShade ?? 0.68;
const sceneBackground = visualTreatment.backgroundColor ?? COLORS.ink;
const keywordCardLayout = (
  videoLayout as {
    keywordCard: {
      top: number;
      minimumVisibleSeconds?: number;
      secondsPerCharacter?: number;
    };
  }
).keywordCard;
const bookPickerIntro = (
  videoLayout as {
    bookPickerIntro?: {
      enabled?: boolean;
      standard?: string;
      durationSeconds?: number;
      seed?: string;
      candidateLabels?: string[];
      selectedLabel?: string;
    };
  }
).bookPickerIntro;

const BOOK_PICKER_PALETTE = [
  ['#163a59', '#6fa6c9'],
  ['#5a2d2d', '#c77861'],
  ['#315444', '#86ad85'],
  ['#51416a', '#a58bc3'],
  ['#6a5327', '#cfad58'],
] as const;

const seedNumber = (value: string) =>
  Array.from(value).reduce(
    (total, character) => (total * 31 + character.codePointAt(0)!) >>> 0,
    2166136261,
  );

const BookPickerIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!bookPickerIntro?.enabled) return null;

  const durationFrames = Math.max(
    1,
    Math.round((bookPickerIntro.durationSeconds ?? 3.8) * fps),
  );
  const currentTitle = String(cover.bookTitle ?? '');
  const labels = (bookPickerIntro.candidateLabels ?? []).filter(
    (label) => label && label !== currentTitle,
  );
  const rotation = labels.length
    ? seedNumber(bookPickerIntro.seed ?? String(cover.bookTitle ?? '')) % labels.length
    : 0;
  const rotated = [...labels.slice(rotation), ...labels.slice(0, rotation)];
  const candidates = [...rotated, ...rotated, currentTitle];
  const selectedIndex = candidates.length - 1;
  const cardWidth = 360;
  const cardHeight = 600;
  const step = 404;
  const startIndex = Math.min(2, Math.max(0, selectedIndex - 1));
  const settleFrame = Math.round(durationFrames * 0.72);
  const rawProgress = Math.min(1, frame / Math.max(1, settleFrame));
  const progress = 1 - (1 - rawProgress) ** 3;
  const centerX = 540;
  const startX = centerX - (startIndex * step + cardWidth / 2);
  const endX = centerX - (selectedIndex * step + cardWidth / 2);
  const trackX = startX + (endX - startX) * progress;
  const selectedProgress = Math.max(
    0,
    Math.min(1, (frame - settleFrame + 8) / Math.max(1, durationFrames - settleFrame - 12)),
  );
  const selectedLift =
    -12 * selectedProgress - 28 * Math.sin(selectedProgress * Math.PI);
  const opacity = interpolate(
    frame,
    [0, 10, Math.max(11, durationFrames - 18), durationFrames],
    [0, 1, 1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill
      style={{
        zIndex: 20,
        opacity,
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 50% 40%, rgba(199,168,103,.19), transparent 42%), #050505',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 250,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'rgba(255,248,233,.78)',
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: 34,
          letterSpacing: 10,
          fontWeight: 700,
        }}
      >
        {selectedProgress > 0.55
          ? bookPickerIntro.selectedLabel ?? '本期阅读'
          : '正在选书'}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 390,
          left: 0,
          height: cardHeight,
          transform: `translateX(${trackX}px)`,
          display: 'flex',
          gap: step - cardWidth,
        }}
      >
        {candidates.map((title, index) => {
          const selected = index === selectedIndex;
          const [dark, light] = BOOK_PICKER_PALETTE[
            (seedNumber(`${bookPickerIntro.seed}-${title}-${index}`)) %
              BOOK_PICKER_PALETTE.length
          ];
          return (
            <div
              key={`${title}-${index}`}
              style={{
                position: 'relative',
                flex: `0 0 ${cardWidth}px`,
                height: cardHeight,
                overflow: 'hidden',
                borderRadius: 16,
                border: selected
                  ? `6px solid rgba(239,226,193,${0.35 + selectedProgress * 0.65})`
                  : '3px solid rgba(255,255,255,.16)',
                boxShadow: selected
                  ? `0 0 ${40 + selectedProgress * 65}px rgba(199,168,103,.62), 0 35px 80px rgba(0,0,0,.6)`
                  : '0 24px 55px rgba(0,0,0,.52)',
                transform: selected
                  ? `scale(${1 + selectedProgress * 0.08}) translateY(${selectedLift}px)`
                  : 'scale(.94)',
                background: `linear-gradient(145deg, ${light}, ${dark})`,
              }}
            >
              {selected ? (
                <Img
                  src={staticFile(String(cover.image ?? ''))}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: `brightness(${0.72 + selectedProgress * 0.15}) saturate(1.02)`,
                  }}
                />
              ) : null}
              <AbsoluteFill
                style={{
                  background: selected
                    ? 'linear-gradient(180deg, rgba(0,0,0,.16), rgba(0,0,0,.62))'
                    : 'linear-gradient(150deg, rgba(255,255,255,.12), transparent 48%, rgba(0,0,0,.32))',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 70,
                  left: 38,
                  right: 38,
                  height: 5,
                  backgroundColor: selected ? COLORS.gold : 'rgba(255,255,255,.55)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 145,
                  left: 32,
                  right: 32,
                  color: '#fff8e9',
                  textAlign: 'center',
                  fontFamily: 'Microsoft YaHei, sans-serif',
                  fontWeight: 900,
                  fontSize: selected ? 58 : 46,
                  lineHeight: 1.28,
                  textShadow: '0 5px 18px rgba(0,0,0,.72)',
                }}
              >
                {selected ? `《${title}》` : title}
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 52,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  color: 'rgba(255,248,233,.76)',
                  fontFamily: 'Microsoft YaHei, sans-serif',
                  fontSize: 24,
                  letterSpacing: 6,
                }}
              >
                {selected ? '陪你进入原著' : '翻开一本书'}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const StoryboardPanel: React.FC<{
  shot: PreparedShot;
  index: number;
}> = ({shot, index}) => {
  const frame = useCurrentFrame();
  const row = Math.floor(shot.panel / 2);
  const column = shot.panel % 2;
  const drift = index % 2 === 0 ? 1 : -1;
  const scale = interpolate(frame, [0, shot.durationInFrames], [1.035, 1.105], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const translateX = interpolate(
    frame,
    [0, shot.durationInFrames],
    [-8 * drift, 10 * drift],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const translateY = interpolate(
    frame,
    [0, shot.durationInFrames],
    [5, -5],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );
  const entrance = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: sceneBackground, opacity: entrance}}>
      <AbsoluteFill style={{overflow: 'hidden'}}>
        <AbsoluteFill
          style={{
            transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          }}
        >
          <Img
            src={staticFile(shot.image)}
            style={{
              position: 'absolute',
              width: '200%',
              height: '200%',
              left: `${-column * 100}%`,
              top: `${-row * 100}%`,
              objectFit: 'fill',
              filter: `saturate(${imageSaturation}) contrast(${imageContrast}) brightness(${imageBrightness})`,
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            `linear-gradient(180deg, rgba(4,12,17,${topShade}) 0%, rgba(4,12,17,.02) 25%, rgba(4,12,17,.04) 65%, rgba(4,12,17,${bottomShade}) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.16,
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(239,226,193,.25) 0 1px, transparent 1px)',
          backgroundSize: '7px 7px',
          mixBlendMode: 'soft-light',
        }}
      />
    </AbsoluteFill>
  );
};

const KeywordCard: React.FC<{shot: PreparedShot}> = ({shot}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!shot.isSegmentStart) return null;
  const legacyTiming = keywordCardLayout.minimumVisibleSeconds === undefined;
  const requestedReadableFrames = Math.round(
    Math.max(
      keywordCardLayout.minimumVisibleSeconds ?? 3.6,
      shot.kicker.length * (keywordCardLayout.secondsPerCharacter ?? 0),
    ) * fps,
  );
  const fadeOutStart = legacyTiming
    ? 88
    : Math.max(
        18,
        Math.min(shot.durationInFrames - 22, 18 + requestedReadableFrames),
      );
  const fadeOutEnd = legacyTiming
    ? 108
    : Math.min(shot.durationInFrames - 4, fadeOutStart + 18);
  const opacity = interpolate(frame, [4, 18, fadeOutStart, fadeOutEnd], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: keywordCardLayout.top,
        left: 72,
        right: 72,
        opacity,
      }}
    >
      <div
        style={{
          color: COLORS.gold,
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: 31,
          fontWeight: 700,
          letterSpacing: 7,
          marginBottom: 22,
        }}
      >
        {shot.section}
      </div>
      <div
        style={{
          color: COLORS.paper,
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: shot.kicker.length > 12 ? 70 : 84,
          lineHeight: 1.18,
          fontWeight: 900,
          textShadow: '0 8px 30px rgba(0,0,0,.55)',
          borderLeft: `10px solid ${COLORS.cinnabar}`,
          paddingLeft: 30,
        }}
      >
        {shot.kicker}
      </div>
    </div>
  );
};

const ShotScene: React.FC<{shot: PreparedShot; index: number}> = ({
  shot,
  index,
}) => {
  return (
    <AbsoluteFill>
      <StoryboardPanel shot={shot} index={index} />
      <KeywordCard shot={shot} />
    </AbsoluteFill>
  );
};

export const BookVideo: React.FC<PreparedVideo> = (props) => {
  const transitionFrames = 12;

  return (
    <AbsoluteFill style={{backgroundColor: sceneBackground}}>
      <Audio src={staticFile(props.audioFile)} />
      {props.shots.map((shot, index) => (
        <Sequence
          key={shot.id}
          from={shot.startFrame}
          durationInFrames={
            shot.durationInFrames +
            (index === props.shots.length - 1 ? 0 : transitionFrames)
          }
          premountFor={30}
        >
          <ShotScene shot={shot} index={index} />
        </Sequence>
      ))}
      <div
        style={{
          position: 'absolute',
          top: videoLayout.header.top,
          left: videoLayout.header.sideMargin,
          right: videoLayout.header.sideMargin,
          textAlign: 'center',
          color: 'rgba(255,248,233,.94)',
          fontFamily: 'Microsoft YaHei, sans-serif',
          fontSize: videoLayout.header.fontSize,
          fontWeight: 600,
          lineHeight: 1.3,
          letterSpacing: 1.5,
          textShadow: '0 2px 8px rgba(0,0,0,.95), 0 1px 2px rgba(0,0,0,.95)',
        }}
      >
        {videoLayout.header.text}
      </div>
      {bookPickerIntro?.enabled ? (
        <Sequence
          from={0}
          durationInFrames={Math.round(
            (bookPickerIntro.durationSeconds ?? 3.8) * props.fps,
          )}
        >
          <BookPickerIntro />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
