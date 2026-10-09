import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The screen behind the orb, as in the reference video: a deep navy field, a
 * fine technical grid, a soft light in the middle, a notched bracket along the
 * top edge and a row of small ticks under it. One SVG, drawn once per size.
 */
export function HudBackdrop() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const cell = 34;
  const top = 10;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <Pattern id="grid" width={cell} height={cell} patternUnits="userSpaceOnUse">
              <Path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="#1C2636" strokeWidth={1} />
            </Pattern>
            <RadialGradient id="light" cx="50%" cy="38%" r="65%">
              <Stop offset="0" stopColor="#16203A" stopOpacity={0.9} />
              <Stop offset="1" stopColor="#0A0D14" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={width} height={height} fill="#0A0D14" />
          <Rect width={width} height={height} fill="url(#grid)" opacity={0.7} />
          <Rect width={width} height={height} fill="url(#light)" />
          {/* The notched bracket along the top edge. */}
          <Path
            d={`M ${width * 0.18} ${top} L ${width * 0.34} ${top} L ${width * 0.38} ${top + 8} L ${width * 0.62} ${top + 8} L ${width * 0.66} ${top} L ${width * 0.82} ${top}`}
            fill="none"
            stroke="#8EA2BA"
            strokeOpacity={0.55}
            strokeWidth={1.2}
          />
          {/* The tick row under it. */}
          {Array.from({ length: Math.floor(width / 22) }, (_, index) => (
            <Line
              key={index}
              x1={11 + index * 22}
              y1={top + 20}
              x2={11 + index * 22}
              y2={top + 23}
              stroke="#8EA2BA"
              strokeOpacity={0.35}
              strokeWidth={1}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
