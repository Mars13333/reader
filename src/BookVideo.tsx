import React from 'react';
import videoLayout from '../.runtime/video-layout.json';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
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
  if (!shot.isSegmentStart) return null;
  const opacity = interpolate(frame, [4, 18, 88, 108], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: videoLayout.keywordCard.top,
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
    </AbsoluteFill>
  );
};
