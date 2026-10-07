import { strengthShareModel, fitPhoto, constrainSticker, initialSticker, stickerRatio } from '../strengthShare';
import { MUSCLE_KEYS } from '../rankLogic';
import { MUSCLES } from '../../components/muscleBodyGeometry';
const lifts = { latpull: { best: 100, reps: 11 }, curl: { best: 80, reps: 1 }, bench: { best: 150, reps: 1 } };
describe('rank sticker selection', () => {
  it('back selection shows only the back and only its rank color', () => {
    const result = strengthShareModel(lifts, 95, 'male', 'sirt', 'front');
    expect(result.view).toBe('back');
    expect(result.ranks).toEqual({ sirt: 'efsane' });
  });
  it('biceps selection shows the front and hides all other rank colors', () => {
    const result = strengthShareModel(lifts, 95, 'male', 'biceps', 'back');
    expect(result.view).toBe('front');
    expect(result.ranks).toEqual({ biceps: 'efsane' });
  });
  it('without selection both bodies keep every available rank color', () => {
    const result = strengthShareModel(lifts, 95, 'male', null, 'back');
    expect(result.view).toBe('both');
    expect(Object.keys(result.ranks).sort()).toEqual(['biceps', 'gogus', 'sirt']);
  });
  it('every selected muscle is visible on the chosen single view', () => {
    for (const key of MUSCLE_KEYS) for (const side of ['front', 'back'] as const) {
      const result = strengthShareModel(lifts, 95, 'male', key, side);
      expect(result.view).not.toBe('both');
      expect(MUSCLES.some(m => m.key === key && m.view === result.view)).toBe(true);
      expect(Object.keys(result.ranks).every(k => k === key)).toBe(true);
    }
  });
  it('an unranked selected region stays neutral, without a fabricated Bronze badge', () => {
    const result = strengthShareModel({}, 95, 'female', 'sirt');
    expect(result.ranks).toEqual({});
    expect(result.rankIndex).toBe(-1);
  });
});
describe('media / sticker geometry', () => {
  it('fits portrait and landscape media without cropping', () => {
    expect(fitPhoto({ width: 1920, height: 1080 }, { width: 320, height: 500 })).toEqual({ width: 320, height: 180 });
    expect(fitPhoto({ width: 1080, height: 1920 }, { width: 320, height: 480 })).toEqual({ width: 270, height: 480 });
  });
  it('keeps the complete sticker inside tiny, portrait and landscape canvases after dragging or resizing', () => {
    for (const view of ['front', 'back', 'both'] as const) for (const canvas of [{ width: 320, height: 480 }, { width: 320, height: 180 }, { width: 40, height: 80 }]) {
      for (const source of [{ x: -100, y: -100, width: 5000 }, { x: 5000, y: 5000, width: 20 }, initialSticker(canvas, view)]) {
        const p = constrainSticker(source, canvas, view);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.width).toBeLessThanOrEqual(canvas.width + 0.001);
        expect(p.y + p.width * stickerRatio(view)).toBeLessThanOrEqual(canvas.height + 0.001);
      }
    }
  });
});
