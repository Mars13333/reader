import React from 'react';
import {AbsoluteFill, Img, staticFile} from 'remotion';
import type {CoverRenderProps} from './types';

const textShadow = '0 5px 0 rgba(7,19,26,.9), 0 12px 30px rgba(0,0,0,.8)';

export const BookCover: React.FC<CoverRenderProps> = ({
  image,
  eyebrow,
  headline,
  badge,
  treatment,
  variant,
  layout,
}) => {
  const isBright = treatment === 'bright';
  const isLandscape = variant === 'landscape4x3';
  const isPortrait3x4 = variant === 'portrait3x4';
  const typography = isLandscape
    ? {eyebrow: 34, first: 78, emphasis: 112, last: 114, badge: 34}
    : isPortrait3x4
      ? {eyebrow: 32, first: 76, emphasis: 112, last: 114, badge: 34}
      : {eyebrow: 37, first: 88, emphasis: 136, last: 138, badge: 40};
  const coverTextShadow = isBright
    ? '0 4px 0 rgba(7,19,26,.72), 0 9px 22px rgba(0,0,0,.55)'
    : textShadow;

  return (
    <AbsoluteFill style={{backgroundColor: '#07131a', overflow: 'hidden'}}>
      <Img
        src={staticFile(image)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: layout.artObjectPosition,
          filter: isBright ? 'brightness(1.06) saturate(1.03) contrast(.98)' : undefined,
        }}
      />

      <AbsoluteFill
        style={{
          background: isBright
            ? isLandscape
              ? 'linear-gradient(90deg, rgba(3,10,15,.60) 0%, rgba(3,10,15,.38) 38%, rgba(3,10,15,.10) 62%, rgba(3,10,15,0) 100%)'
              : 'linear-gradient(180deg, rgba(3,10,15,.48) 0%, rgba(3,10,15,.24) 24%, rgba(3,10,15,0) 47%, rgba(3,10,15,0) 70%, rgba(3,10,15,.20) 100%)'
            : isLandscape
              ? 'linear-gradient(90deg, rgba(3,10,15,.98) 0%, rgba(3,10,15,.86) 38%, rgba(3,10,15,.30) 62%, rgba(3,10,15,.08) 100%)'
              : 'linear-gradient(180deg, rgba(3,10,15,.96) 0%, rgba(3,10,15,.72) 24%, rgba(3,10,15,.06) 47%, rgba(3,10,15,.04) 70%, rgba(3,10,15,.88) 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          boxShadow: isBright
            ? 'inset 0 0 90px 24px rgba(0,0,0,.16)'
            : 'inset 0 0 150px 45px rgba(0,0,0,.52)',
          border: '14px solid rgba(199,168,103,.18)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: layout.eyebrowTop,
          left: layout.left,
          padding: '14px 25px 15px',
          borderLeft: '8px solid #d54132',
          background: 'rgba(7,19,26,.72)',
          color: '#efe2c1',
          fontFamily: 'Microsoft YaHei, Noto Sans CJK SC, sans-serif',
          fontWeight: 700,
          fontSize: typography.eyebrow,
          letterSpacing: 2,
        }}
      >
        {eyebrow}
      </div>

      <div
        style={{
          position: 'absolute',
          top: layout.headlineTop,
          left: layout.left,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          fontFamily: 'Microsoft YaHei, Noto Sans CJK SC, sans-serif',
          fontWeight: 900,
          letterSpacing: 3,
          lineHeight: 0.98,
        }}
      >
        <div
          style={{fontSize: typography.first, color: '#efe2c1', textShadow: coverTextShadow}}
        >
          {headline[0]}
        </div>
        <div
          style={{
            marginTop: 16,
            padding: '5px 24px 13px',
            fontSize: typography.emphasis,
            color: '#fff4d6',
            background: '#b93428',
            boxShadow: '10px 12px 0 rgba(7,19,26,.9)',
            textShadow: '0 4px 0 rgba(92,17,14,.72)',
          }}
        >
          {headline[1]}
        </div>
        <div
          style={{
            marginTop: isLandscape ? 14 : 20,
            fontSize: typography.last,
            color: '#f4d48b',
            textShadow: coverTextShadow,
          }}
        >
          {headline[2]}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: layout.left,
          top: layout.badgeTop,
          padding: '17px 28px 19px',
          color: '#fff8e9',
          background: 'rgba(7,19,26,.88)',
          border: '2px solid rgba(239,226,193,.72)',
          borderRadius: 999,
          fontFamily: 'Microsoft YaHei, Noto Sans CJK SC, sans-serif',
          fontSize: typography.badge,
          fontWeight: 800,
          letterSpacing: 3,
          boxShadow: '0 10px 28px rgba(0,0,0,.55)',
        }}
      >
        {badge}
      </div>

      {isLandscape && !isBright ? (
        <div
          style={{
            position: 'absolute',
            right: 74,
            bottom: 54,
            width: 250,
            height: 250,
            overflow: 'hidden',
            borderRadius: '50%',
            border: '5px solid rgba(239,226,193,.78)',
            boxShadow: '0 12px 34px rgba(0,0,0,.72)',
          }}
        >
          <Img
            src={staticFile(image)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 88%',
            }}
          />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
