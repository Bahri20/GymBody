import { MUSCLES } from '../components/muscleBodyGeometry';
import { buildMuscleRanksMap, computeBodyAverageRank, computeMuscleRank } from './rankLogic';

export type ShareView = 'front' | 'back' | 'both';
export function strengthShareModel(lifts: Record<string, any>, bodyweight: number, gender?: string, muscle?: string | null, currentView: 'front' | 'back' = 'front') {
  const allRanks = buildMuscleRanksMap(lifts, bodyweight, gender);
  const sides = muscle ? MUSCLES.filter(shape => shape.key === muscle).map(shape => shape.view) : [];
  const view: ShareView = !muscle ? 'both' : sides.includes(currentView) ? currentView : sides[0] || currentView;
  // Selection isolates the rank map as well as the camera: other muscles stay neutral.
  const ranks = muscle ? (allRanks[muscle] ? { [muscle]: allRanks[muscle] } : {}) : allRanks;
  const rankIndex = muscle ? computeMuscleRank(muscle, lifts, bodyweight, gender) : computeBodyAverageRank(lifts, bodyweight, gender);
  return { view, ranks, rankIndex };
}

export type Size = { width: number; height: number };
export type StickerPosition = { x: number; y: number; width: number };
export const stickerRatio = (view: ShareView) => 610 / (view === 'both' ? 660 : 320) + 0.5;
export function fitPhoto(photo: Size, bounds: Size): Size {
  if (photo.width <= 0 || photo.height <= 0 || bounds.width <= 0 || bounds.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(bounds.width / photo.width, bounds.height / photo.height);
  return { width: photo.width * scale, height: photo.height * scale };
}
export function constrainSticker(position: StickerPosition, canvas: Size, view: ShareView): StickerPosition {
  const maxWidth = Math.max(0, Math.min(canvas.width, canvas.height / stickerRatio(view)));
  const minWidth = Math.min(64, maxWidth);
  const width = Math.max(minWidth, Math.min(maxWidth, position.width));
  return { width, x: Math.max(0, Math.min(canvas.width - width, position.x)), y: Math.max(0, Math.min(canvas.height - width * stickerRatio(view), position.y)) };
}
export function initialSticker(canvas: Size, view: ShareView): StickerPosition {
  const width = Math.min(canvas.width * (view === 'both' ? 0.48 : 0.31), canvas.height * 0.5 / stickerRatio(view));
  return constrainSticker({ width, x: canvas.width - width - 12, y: canvas.height - width * stickerRatio(view) - 12 }, canvas, view);
}
