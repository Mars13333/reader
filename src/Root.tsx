import React from 'react';
import {Composition} from 'remotion';
import cover from '../.runtime/cover.json';
import prepared from '../.runtime/prepared.json';
import {BookCover} from './BookCover';
import {BookVideo} from './BookVideo';
import type {CoverConfig, PreparedVideo} from './types';

const video = prepared as PreparedVideo;
const bookCover = cover as CoverConfig;
const coverBase = {
  image: bookCover.image,
  eyebrow: bookCover.eyebrow,
  headline: bookCover.headline,
  badge: bookCover.badge,
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="BookVideo"
        component={BookVideo}
        durationInFrames={video.totalFrames}
        fps={video.fps}
        width={video.width}
        height={video.height}
        defaultProps={video}
      />
      <Composition
        id="BookCover"
        component={BookCover}
        durationInFrames={1}
        fps={video.fps}
        width={1080}
        height={1920}
        defaultProps={{
          ...coverBase,
          variant: 'vertical9x16',
          layout: bookCover.layouts.vertical9x16,
        }}
      />
      <Composition
        id="BookCover3x4"
        component={BookCover}
        durationInFrames={1}
        fps={video.fps}
        width={1080}
        height={1440}
        defaultProps={{
          ...coverBase,
          variant: 'portrait3x4',
          layout: bookCover.layouts.portrait3x4,
        }}
      />
      <Composition
        id="BookCover4x3"
        component={BookCover}
        durationInFrames={1}
        fps={video.fps}
        width={1440}
        height={1080}
        defaultProps={{
          ...coverBase,
          variant: 'landscape4x3',
          layout: bookCover.layouts.landscape4x3,
        }}
      />
    </>
  );
};
