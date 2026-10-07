import { requireOptionalNativeModule } from 'expo-modules-core';
type Placement = { x: number; y: number; width: number; height: number };
type RankVideo = { exportVideo(source: string, sticker: string, placement: Placement): Promise<string>; cancelExport(): Promise<void>; saveMedia(source: string): Promise<void> };
// Old installed builds can still open the app while awaiting the new native build.
export default requireOptionalNativeModule<RankVideo>('RankVideo');
