import React, { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { PathProps } from 'react-native-svg';
import i18n from '../lib/i18n';
import { femaleBodyPath, FEMALE_HAIR } from './femaleBodyGeometry';
import { normGender } from '../lib/rankLogic';
import { RANKS } from '../lib/rankLogic';
import { BASE_PATHS, MUSCLES, MUSCLE_NAMES } from './muscleBodyGeometry';

export { MUSCLE_NAMES } from './muscleBodyGeometry';
export const BODY_MAP_ASPECT_RATIO = 610 / 320;
export const DEFAULT_RANK_COLORS: Record<string, string> = Object.fromEntries(RANKS.map(rank => [rank.key, rank.color]));
const MIRROR = 'translate(320 0) scale(-1 1)';

function mix(color: string, target: string, amount: number) {
  const expand = (value: string) => value.length === 4 ? '#' + [...value.slice(1)].map(c => c + c).join('') : value;
  const hex = expand(color);
  if (!/^#[\da-f]{6}$/i.test(hex)) return color;
  return '#' + [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    const end = parseInt(target.slice(offset, offset + 2), 16);
    return Math.round(channel + (end - channel) * amount).toString(16).padStart(2, '0');
  }).join('');
}

type Props = {
  gender?: string;
  width?: number;
  view?: 'front' | 'back' | 'both';
  ranks?: Record<string, string>;
  rankColors?: Record<string, string>;
  defaultColor?: string;
  baseColor?: string;
  outlineColor?: string;
  strokeColor?: string;
  detailColor?: string;
  showLabels?: boolean;
  labelColor?: string;
  selectedMuscle?: string | null;
  onMusclePress?: (key: string) => void;
};

export default function MuscleBodyMap({
  gender, width = 340, view = 'both', ranks = {}, rankColors = DEFAULT_RANK_COLORS,
  defaultColor = '#26323F', baseColor = '#26323F', outlineColor = '#536575',
  strokeColor = 'rgba(0,0,0,0.35)', detailColor = 'rgba(0,0,0,0.25)',
  showLabels = true, labelColor = '#8a887f', selectedMuscle = null, onMusclePress,
}: Props) {
  // Every mounted map needs its own gradient IDs (trend and share render several).
  const prefix = 'body' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string) => `${prefix}-${name}`;
  const fill = (name: string) => `url(#${id(name)})`;
  const both = view === 'both';
  const canvasWidth = both ? 660 : 320;
  const canvasHeight = both && showLabels ? 638 : 610;
  const base = mix(baseColor, '#738895', .35);
  const edge = mix(baseColor, '#738895', .55);
  const light = mix(baseColor, '#DCEFFF', .55);
  const dark = mix(baseColor, '#111923', .6);
  const neutral = mix(defaultColor, '#738895', .35);
  const colors = Object.entries(rankColors);
  const rankGradient = (key: string) => `rank-${colors.findIndex(([name]) => name === key)}`;

  const female = normGender(gender) === 'female';
  const BodyPath = (props: PathProps) => <Path {...props} d={female && typeof props.d === 'string' ? femaleBodyPath(props.d) : props.d} />;
  const BodyPair = (props: PathProps) => <><BodyPath {...props} /><BodyPath {...props} transform={MIRROR} /></>;
  const renderBody = (side: 'front' | 'back', offset = 0) => (
    <G key={side} transform={offset ? `translate(${offset} 0)` : undefined}>
      {female && <Path d={FEMALE_HAIR.back} fill={fill('head')} stroke={edge} strokeWidth={.6} pointerEvents="none" />}
      <G fill={fill('base')} stroke={outlineColor} strokeWidth={.65}>
        <BodyPair d={BASE_PATHS.leg} /><BodyPath d={BASE_PATHS.torso} />
        <BodyPair d={BASE_PATHS.arm} /><BodyPair d={BASE_PATHS.hand} />
        <BodyPair d={BASE_PATHS.foot} /><BodyPath d={BASE_PATHS.head} fill={fill('head')} />
      </G>
      <G fill="none" stroke="#DCEFFF" strokeOpacity={.18} strokeWidth={1} pointerEvents="none">
        <BodyPair d="M128 526 L133 551 M121 572 L115 578 M28 302 L27 311 M34 300 L34 312 M39 298 L40 308" />
      </G>
      {side === 'front' ? <G pointerEvents="none">
        <BodyPath d="M141 45 Q148 36 160 36 L160 66 L150 71 Q143 59 141 45 Z" fill={fill('shine')} opacity={.5} />
        <BodyPath d="M144 55 Q153 58 157 55 M163 55 Q169 58 176 55 M160 55 L157 67 L163 67 M154 76 Q160 78 166 76" fill="none" stroke={dark} strokeWidth={1.1} opacity={.7} />
        <BodyPair d="M145 90 L151 108" fill="none" stroke="#DCEFFF" strokeOpacity={.18} />
        <BodyPair d="M120 430 Q129 422 138 431 L137 443 Q128 450 122 441 Z" fill={fill('head')} stroke={edge} strokeWidth={.5} />
        <BodyPair d="M134 453 Q140 475 137 505 L136 544 L132 544 L129 507 Z" fill={fill('head')} />
        <BodyPair d="M121 273 Q139 282 155 300 L153 308 Q134 290 117 286 Z" fill={fill('shine')} opacity={.4} />
      </G> : <G pointerEvents="none">
        <BodyPath d="M146 31 Q156 24 168 30 M147 73 Q160 83 173 73 M158 97 L158 206" fill="none" stroke="#DCEFFF" strokeOpacity={.2} strokeWidth={1.2} />
        <BodyPair d="M130 506 Q131 532 135 550 L138 550 L139 515" fill="none" stroke={light} strokeWidth={1.5} opacity={.65} />
      </G>}
      {female && <G pointerEvents="none"><Path d={FEMALE_HAIR.locks} fill={fill('head')} stroke={edge} strokeWidth={.4} /><Path d={side === 'front' ? FEMALE_HAIR.front : FEMALE_HAIR.rear} fill={fill('head')} stroke={edge} strokeWidth={.6} /><Path d={FEMALE_HAIR.strands} fill="none" stroke={light} strokeOpacity={.35} strokeWidth={1} /></G>}
      {MUSCLES.filter(m => m.view === side).map((muscle, index) => {
        const color = rankColors[ranks[muscle.key]];
        const selected = selectedMuscle === muscle.key;
        const Shape = muscle.paired ? BodyPair : BodyPath;
        return <G key={`${muscle.key}-${index}`} onPress={onMusclePress ? () => onMusclePress(muscle.key) : undefined}
          accessibilityLabel={i18n.t(MUSCLE_NAMES[muscle.key])}>
          {selected && <Shape d={muscle.d} fill="none" stroke={color || edge} strokeWidth={5} strokeOpacity={.1} pointerEvents="none" />}
          <Shape d={muscle.d} fill={fill(color ? rankGradient(ranks[muscle.key]) : 'neutral')}
            stroke={selected ? color || edge : color || strokeColor} strokeOpacity={selected ? 1 : .38} strokeWidth={selected ? 1.4 : .6} />
          <Shape d={muscle.d} fill="none" stroke={fill('shine')} strokeWidth={.9} pointerEvents="none" />
          {!!muscle.detail && <G pointerEvents="none">
            <Shape d={muscle.detail} fill="none" stroke={detailColor} strokeWidth={1.2} strokeOpacity={.2} />
            <Shape d={muscle.detail} fill="none" stroke="#DCEFFF" strokeOpacity={selected ? .26 : .13} strokeWidth={.75} />
          </G>}
        </G>;
      })}
    </G>
  );

  return <Svg width={width} height={width * canvasHeight / canvasWidth} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
    <Defs>
      <LinearGradient id={id('base')} x1="0%" y1="0%" x2="100%" y2="60%">
        <Stop stopColor={dark} /><Stop offset="28%" stopColor={base} /><Stop offset="47%" stopColor={light} /><Stop offset="64%" stopColor={base} /><Stop offset="100%" stopColor={dark} />
      </LinearGradient>
      <LinearGradient id={id('head')} x1="0%" y1="0%" x2="100%" y2="70%">
        <Stop stopColor={dark} /><Stop offset="38%" stopColor={light} /><Stop offset="58%" stopColor={base} /><Stop offset="100%" stopColor={dark} />
      </LinearGradient>
      <LinearGradient id={id('neutral')} x1="0%" y1="0%" x2="90%" y2="85%">
        <Stop stopColor={mix(neutral, '#111923', .6)} /><Stop offset="26%" stopColor={mix(neutral, '#DCEFFF', .27)} /><Stop offset="47%" stopColor={neutral} /><Stop offset="100%" stopColor={mix(neutral, '#111923', .7)} />
      </LinearGradient>
      <LinearGradient id={id('shine')} x1="0%" y1="0%" x2="85%" y2="100%">
        <Stop stopColor="#DCEFFF" stopOpacity={.52} /><Stop offset="50%" stopColor="#DCEFFF" stopOpacity={.03} /><Stop offset="100%" stopColor="#DCEFFF" stopOpacity={0} />
      </LinearGradient>
      {colors.map(([key, color]) => <LinearGradient key={key} id={id(rankGradient(key))} x1="0%" y1="0%" x2="90%" y2="85%">
        <Stop stopColor={mix(color, '#101622', .65)} /><Stop offset="26%" stopColor={mix(color, '#FFFFFF', .27)} /><Stop offset="47%" stopColor={color} /><Stop offset="76%" stopColor={mix(color, '#111724', .32)} /><Stop offset="100%" stopColor={mix(color, '#0A101B', .7)} />
      </LinearGradient>)}
    </Defs>
    {view !== 'back' && renderBody('front')}
    {view !== 'front' && renderBody('back', both ? 340 : 0)}
    {both && showLabels && <>
      <SvgText x={160} y={626} textAnchor="middle" fontSize={16} fill={labelColor}>{i18n.t('On gorunum')}</SvgText>
      <SvgText x={500} y={626} textAnchor="middle" fontSize={16} fill={labelColor}>{i18n.t('Arka gorunum')}</SvgText>
    </>}
  </Svg>;
}
