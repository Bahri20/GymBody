// MuscleBodyMap.tsx — kas rank haritası (React Native / react-native-svg)
//
// Kullanim:
//   <MuscleBodyMap
//     view="front"                      // 'front' | 'back' | 'both'
//     ranks={{ gogus: 'altin', biceps: 'elmas', sirt: 'platin' }}
//     onMusclePress={(key) => console.log(key)}
//   />
//
// `ranks` objesinde olmayan kaslar defaultColor ile (notr gri) boyanir.
import React from 'react';
import Svg, { G, Path, Ellipse, Text as SvgText } from 'react-native-svg';

export const DEFAULT_RANK_COLORS: Record<string, string> = {
  baslangic: '#96948b',
  bronz: '#c97e45',
  gumus: '#aab2ba',
  altin: '#e0b23f',
  platin: '#3fc1ad',
  elmas: '#57b3f2',
  mor: '#9b7ded',
};

export const MUSCLE_NAMES: Record<string, string> = {
  trapez: 'Trapez',
  omuz: 'Omuz',
  gogus: 'Gogus',
  biceps: 'Biceps',
  onkol: 'On kol',
  karin: 'Karin',
  kuad: 'Quadriceps',
  triceps: 'Triceps',
  sirt: 'Sirt (kanat)',
  bel: 'Bel',
  kalca: 'Kalca',
  arkabacak: 'Arka bacak',
  kalf: 'Kalf',
};

// view: 'front' | 'back' — arka figur, coklu-gorunum modunda global olarak x+250 kaydirilir.
// mirror: true ise sol path cizilir, sagi x=115 eksenine gore aynalanir.
const MUSCLES: { key: string; view: 'front' | 'back'; mirror: boolean; d: string }[] = [
  { key: 'trapez', view: 'front', mirror: true, d: 'M108,54 C98,56 86,59 76,64 C86,68 98,68 107,62 Z' },
  { key: 'omuz', view: 'front', mirror: true, d: 'M70,63 C60,67 52,76 49,89 C53,98 62,101 70,98 C75,87 75,74 70,63 Z' },
  { key: 'gogus', view: 'front', mirror: true, d: 'M113,66 C98,66 86,70 80,79 C78,90 83,100 93,105 C104,109 112,107 113,100 L113,66 Z' },
  { key: 'biceps', view: 'front', mirror: true, d: 'M50,94 C44,103 41,115 40,129 C39,139 40,147 43,153 C50,151 55,144 57,133 C59,118 56,103 50,94 Z' },
  { key: 'onkol', view: 'front', mirror: true, d: 'M42,158 C38,170 35,184 33,198 C32,208 31,216 31,224 C35,226 39,224 41,219 C44,207 46,193 48,179 C49,169 47,161 42,158 Z' },
  { key: 'karin', view: 'front', mirror: false, d: 'M97,110 C92,123 90,138 92,153 C94,167 100,180 107,189 C112,193 118,193 123,189 C130,180 136,167 138,153 C140,138 138,123 133,110 C121,105 109,105 97,110 Z' },
  { key: 'kuad', view: 'front', mirror: true, d: 'M90,216 C85,236 84,258 87,278 C89,294 94,306 100,312 C106,306 110,294 111,278 C112,258 111,236 108,218 C102,212 95,212 90,216 Z' },

  { key: 'trapez', view: 'back', mirror: true, d: 'M108,54 C98,56 86,59 76,64 C86,68 98,68 107,62 Z' },
  { key: 'omuz', view: 'back', mirror: true, d: 'M70,63 C60,67 52,76 49,89 C53,98 62,101 70,98 C75,87 75,74 70,63 Z' },
  { key: 'triceps', view: 'back', mirror: true, d: 'M50,94 C44,103 41,115 40,129 C39,139 40,147 43,153 C50,151 55,144 57,133 C59,118 56,103 50,94 Z' },
  { key: 'sirt', view: 'back', mirror: false, d: 'M115,64 C104,64 90,68 82,76 C79,90 80,108 82,122 C85,140 92,154 101,162 C106,166 111,167 115,167 C119,167 124,166 129,162 C138,154 145,140 148,122 C150,108 151,90 148,76 C140,68 126,64 115,64 Z' },
  { key: 'bel', view: 'back', mirror: false, d: 'M105,164 C103,175 103,187 105,198 L125,198 C127,187 127,175 125,164 C119,170 111,170 105,164 Z' },
  { key: 'kalca', view: 'back', mirror: true, d: 'M89,200 C84,210 83,222 86,234 C90,245 99,249 107,247 C113,243 115,233 114,223 C113,211 109,203 103,199 C98,196 92,196 89,200 Z' },
  { key: 'arkabacak', view: 'back', mirror: true, d: 'M88,252 C84,272 84,292 87,310 C89,322 94,332 99,338 C104,332 108,322 109,310 C111,292 110,272 108,254 C101,248 93,248 88,252 Z' },
  { key: 'kalf', view: 'back', mirror: true, d: 'M91,344 C86,358 85,374 88,390 C90,400 94,408 98,412 C102,408 105,400 106,390 C107,374 106,358 103,346 C99,340 94,340 91,344 Z' },
];

// Kas ustu detay cizgileri (karin bolmeleri, kuad ayrimi) — tiklanamaz.
const DETAIL_LINES =
  'M115,113 L115,190 M100,128 L130,128 M99,146 L131,146 M101,164 L129,164 ' +
  'M99,224 L99,302 M131,224 L131,302';

// Arka gorunum detayi: omurga cizgisi (sirt bolgesinin ortasi).
const BACK_DETAIL_LINES = 'M115,68 L115,164';

const BASE_PATHS = {
  neck: 'M107,40 L107,56 L123,56 L123,40 C120,45 110,45 107,40 Z',
  torso:
    'M70,62 C68,84 72,106 80,126 C86,140 92,150 93,158 C94,174 90,190 88,202 L88,210 ' +
    'L142,210 L142,202 C140,190 136,174 137,158 C138,150 144,140 150,126 C158,106 162,84 160,62 ' +
    'C146,55 130,52 115,52 C100,52 84,55 70,62 Z',
  arm:
    'M69,63 C58,68 50,78 46,92 C42,108 40,124 38,140 C36,158 34,174 31,190 ' +
    'C29,202 28,212 27,220 L45,226 C48,214 50,202 52,190 C55,172 58,154 60,138 ' +
    'C62,122 64,106 66,92 C67,80 68,70 69,63 Z',
  leg:
    'M88,210 C84,234 83,258 85,280 C87,302 90,322 92,342 C94,362 95,382 96,400 L96,420 ' +
    'L110,420 L111,400 C112,380 112,360 112,340 C112,318 112,296 113,274 C114,254 114,232 115,214 L115,210 Z',
  foot: 'M94,420 L110,420 L111,432 C105,436 97,436 93,432 Z',
};

// Orijinal anime tarzi kafa (dikenli sac + kahkul + gozler).
// Arka gorunumde yuz tamamen sac rengiyle dolar, goz/kahkul cizilmez.
const HEAD = {
  face: 'M101,22 C101,11 107,5 115,5 C123,5 129,11 129,22 C129,31 124,40 115,45 C106,40 101,31 101,22 Z',
  hair: 'M115,6 C109,6 104,8 100,12 C100,5 97,-1 92,-6 C96,-4 100,-2 103,0 C103,-6 106,-12 111,-16 C111,-10 113,-6 115,-5 C117,-6 119,-10 119,-16 C124,-12 127,-6 127,0 C130,-2 134,-4 138,-6 C133,-1 130,5 130,12 C126,8 121,6 115,6 Z',
  fringe: 'M100,12 C99,17 99,21 101,26 L105,19 L108,25 L111,18 L115,24 L119,18 L122,25 L125,19 L129,26 C131,21 131,17 130,12 C125,9 105,9 100,12 Z',
};

const MIRROR = 'translate(230,0) scale(-1,1)';

function Mirrored({ d }: { d: string }) {
  return (
    <>
      <Path d={d} />
      <Path d={d} transform={MIRROR} />
    </>
  );
}

function BodyBase({ baseColor, outlineColor, hairColor, faceColor, eyeColor, back, headScale = 1.3 }: any) {
  const headTf = `translate(${115 - headScale * 115},${50 - headScale * 50}) scale(${headScale})`;
  return (
    <G fill={baseColor} stroke={outlineColor} strokeWidth={1}>
      <G transform={headTf}>
        <Path d={HEAD.face} fill={back ? hairColor : faceColor} />
        <Path d={HEAD.hair} fill={hairColor} />
        {!back && <Path d={HEAD.fringe} fill={hairColor} />}
        {!back && <Ellipse cx={109} cy={30} rx={1.7} ry={2.7} fill={eyeColor} stroke="none" />}
        {!back && <Ellipse cx={121} cy={30} rx={1.7} ry={2.7} fill={eyeColor} stroke="none" />}
      </G>
      <Path d={BASE_PATHS.neck} />
      <Path d={BASE_PATHS.torso} />
      <Mirrored d={BASE_PATHS.arm} />
      <Ellipse cx={36} cy={236} rx={9} ry={11} />
      <Ellipse cx={194} cy={236} rx={9} ry={11} />
      <Mirrored d={BASE_PATHS.leg} />
      <Mirrored d={BASE_PATHS.foot} />
    </G>
  );
}

export default function MuscleBodyMap({
  width = 340,
  view = 'both',
  ranks = {},
  rankColors = DEFAULT_RANK_COLORS,
  defaultColor = '#96948b',
  baseColor = '#ece9e2',
  outlineColor = '#c4c1b6',
  hairColor = '#4a5578',
  faceColor = '#e6d3bc',
  eyeColor = '#2c2c2a',
  headScale = 1.3,
  strokeColor = 'rgba(0,0,0,0.28)',
  detailColor = 'rgba(0,0,0,0.22)',
  showLabels = true,
  labelColor = '#8a887f',
  onMusclePress,
}: {
  width?: number;
  view?: 'front' | 'back' | 'both';
  ranks?: Record<string, string>;
  rankColors?: Record<string, string>;
  defaultColor?: string;
  baseColor?: string;
  outlineColor?: string;
  hairColor?: string;
  faceColor?: string;
  eyeColor?: string;
  headScale?: number;
  strokeColor?: string;
  detailColor?: string;
  showLabels?: boolean;
  labelColor?: string;
  onMusclePress?: (key: string) => void;
}) {
  const showFront = view !== 'back';
  const showBack = view !== 'front';
  const bothViews = showFront && showBack;
  const vbWidth = bothViews ? 480 : 230;
  const height = (width * 514) / vbWidth;
  const fillFor = (key: string) => rankColors[ranks[key]] || defaultColor;

  const bodyProps = { baseColor, outlineColor, hairColor, faceColor, eyeColor, headScale };

  const renderMuscle = (m: (typeof MUSCLES)[number], i: number) => (
    <G
      key={m.key + '-' + m.view + '-' + i}
      fill={fillFor(m.key)}
      onPress={onMusclePress ? () => onMusclePress(m.key) : undefined}
    >
      {m.mirror ? <Mirrored d={m.d} /> : <Path d={m.d} />}
    </G>
  );

  return (
    <Svg width={width} height={height} viewBox={`0 -44 ${vbWidth} 514`}>
      {showFront && <BodyBase {...bodyProps} />}
      {showBack && (
        <G transform={bothViews ? 'translate(250,0)' : undefined}>
          <BodyBase {...bodyProps} back />
        </G>
      )}

      <G stroke={strokeColor} strokeWidth={1}>
        {showFront && MUSCLES.filter((m) => m.view === 'front').map(renderMuscle)}
        {showFront && <Path d={DETAIL_LINES} fill="none" stroke={detailColor} />}
        {showBack && (
          <G transform={bothViews ? 'translate(250,0)' : undefined}>
            {MUSCLES.filter((m) => m.view === 'back').map(renderMuscle)}
            <Path d={BACK_DETAIL_LINES} fill="none" stroke={detailColor} />
          </G>
        )}
      </G>

      {showLabels && bothViews && (
        <>
          <SvgText x={115} y={462} textAnchor="middle" fontSize={13} fill={labelColor}>
            On gorunum
          </SvgText>
          <SvgText x={365} y={462} textAnchor="middle" fontSize={13} fill={labelColor}>
            Arka gorunum
          </SvgText>
        </>
      )}
    </Svg>
  );
}
