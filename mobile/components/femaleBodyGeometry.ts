// Absolute M/L/Q/C paths only. Warp every control point together so hit areas,
// contours and muscle details remain aligned with the female silhouette.
export function femaleBodyPath(d: string): string {
  let axis = 0;
  let x = 0;
  return d.replace(/-?\d*\.?\d+/g, value => {
    if (axis++ % 2 === 0) { x = Number(value); return '@'; }
    const y = Number(value);
    const anchors = [[0, .94], [80, .94], [120, .82], [175, .84], [235, .84], [280, 1.16], [330, 1.17], [420, 1.02], [610, .96]];
    let scale = .96;
    for (let i = 1; i < anchors.length; i++) {
      if (y <= anchors[i][0]) {
        const [ya, a] = anchors[i - 1];
        const [yb, b] = anchors[i];
        scale = a + (b - a) * Math.max(0, (y - ya) / (yb - ya));
        break;
      }
    }
    // Only hips widen; forearms and hands keep their natural taper.
    if (y > 235 && y < 420 && Math.abs(x - 160) > 75) scale = .9;
    return `${(160 + (x - 160) * scale).toFixed(2)},${y}`;
  }).replace(/@\s*/g, '');
}

// Long hair swept to the sides keeps the back's ranked muscles visible.
export const FEMALE_HAIR = {
  locks: 'M137 73 Q128 100 111 145 Q101 177 103 214 L111 242 Q96 229 96 210 Q93 177 104 143 Q123 100 130 69 Z M183 73 Q192 100 209 145 Q219 177 217 214 L209 242 Q224 229 224 210 Q227 177 216 143 Q197 100 190 69 Z',
  back: 'M135 34 C132 12 174 8 187 32 C198 55 187 86 198 111 Q209 137 202 171 Q193 190 193 213 Q177 203 183 174 Q194 150 181 118 L176 78 L144 78 Q137 102 132 128 Q120 153 127 176 Q120 171 117 154 Q112 132 124 106 Q134 83 130 62 Z',
  front: 'M136 52 Q128 28 143 20 Q171 7 183 29 Q191 45 181 65 L176 42 Q163 44 152 30 Q145 47 136 52 Z',
  rear: 'M136 30 Q159 12 183 32 L181 69 Q175 84 160 88 Q141 80 137 65 Z',
  strands: 'M143 26 Q127 65 138 84 M178 31 Q192 70 183 100 Q177 129 195 153 Q196 179 189 197 M135 82 Q115 142 123 161',
};
