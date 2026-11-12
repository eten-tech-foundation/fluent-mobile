import React, { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { CoverArtSpec } from './coverArt/generator';

const pct = (fraction: number) => `${fraction * 100}%`;

/** Draws a cover's generated art to fill its parent. */
export const CoverArt = React.memo(function CoverArt({
  spec,
}: {
  spec: CoverArtSpec;
}) {
  const id = `cover${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { ground, gradient, blobs } = spec;

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        {gradient ? (
          <LinearGradient
            id={`${id}g`}
            x1={pct(gradient.from.x)}
            y1={pct(gradient.from.y)}
            x2={pct(gradient.to.x)}
            y2={pct(gradient.to.y)}
          >
            {gradient.stops.map(s => (
              <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
        ) : null}
        {blobs.map((b, i) => (
          <RadialGradient key={i} id={`${id}b${i}`}>
            {b.stops.map(s => (
              <Stop
                key={s.offset}
                offset={s.offset}
                stopColor={s.color}
                stopOpacity={s.opacity}
              />
            ))}
          </RadialGradient>
        ))}
      </Defs>
      <Rect width={100} height={100} fill={ground} />
      {gradient ? (
        <Rect width={100} height={100} fill={`url(#${id}g)`} />
      ) : null}
      {blobs.map((b, i) => (
        <Ellipse
          key={i}
          cx={b.cx}
          cy={b.cy}
          rx={b.rx}
          ry={b.ry}
          fill={`url(#${id}b${i})`}
          transform={`rotate(${b.rotation} ${b.cx} ${b.cy})`}
        />
      ))}
    </Svg>
  );
});
