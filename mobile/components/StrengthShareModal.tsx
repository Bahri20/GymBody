import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { VideoView, useVideoPlayer } from 'expo-video';
import ViewShot from 'react-native-view-shot';
import BodyRankSticker from './BodyRankSticker';
import { constrainSticker, fitPhoto, initialSticker, Size, StickerPosition, stickerRatio, strengthShareModel } from '../lib/strengthShare';
import RankVideo from '../modules/rank-video';

type Props = { onClose(): void; gender?: string; bodyweight: number; lifts: Record<string, any>; muscle: string | null; currentView: 'front' | 'back' };
type Media = { uri: string; width: number; height: number; video: boolean };
const colors = { bg: '#0B0D12', surface: '#191D25', muted: '#A7AFBB', lime: '#C6F36B' };
const fileUri = (uri: string) => uri.startsWith('/') ? `file://${uri}` : uri;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function VideoPreview({ uri, paused, onReady, onError }: { uri: string; paused: boolean; onReady(): void; onError(): void }) {
  const player = useVideoPlayer(uri, p => { p.loop = true; p.muted = true; });
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') onReady();
      if (status === 'error') onError();
    });
    return () => subscription.remove();
  }, [player, onReady, onError]);
  useEffect(() => { if (paused) player.pause(); else player.play(); }, [paused, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} surfaceType="textureView" onFirstFrameRender={onReady} />;
}

export default function StrengthShareModal({ onClose, gender, bodyweight, lifts, muscle, currentView }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const model = useMemo(() => strengthShareModel(lifts, bodyweight, gender, muscle, currentView), [lifts, bodyweight, gender, muscle, currentView]);
  const [media, setMedia] = useState<Media | null>(null);
  const [bounds, setBounds] = useState<Size>({ width: 0, height: 0 });
  const [position, setPosition] = useState<StickerPosition>({ x: 0, y: 0, width: 100 });
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const capture = useRef<ViewShot>(null);
  const stickerCapture = useRef<ViewShot>(null);
  const locked = useRef(false);
  const cancelled = useRef(false);
  const mounted = useRef(true);
  const canvas = media ? fitPhoto(media, bounds) : { width: Math.min(bounds.width, 340), height: Math.min(bounds.height, 470) };
  const live = useRef({ position, canvas, view: model.view, busy });
  live.current = { position, canvas, view: model.view, busy };
  const gesture = useRef({ x: 0, y: 0, width: 100, startX: 0, startY: 0, distance: 0, touches: 0 });
  useEffect(() => () => { mounted.current = false; void RankVideo?.cancelExport(); }, []);
  useEffect(() => {
    if (media && canvas.width > 0 && canvas.height > 0) setPosition(initialSticker(canvas, model.view));
  }, [media?.uri, canvas.width, canvas.height, model.view]);
  const update = (p: StickerPosition) => setPosition(constrainSticker(p, live.current.canvas, live.current.view));
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !live.current.busy,
    onMoveShouldSetPanResponder: () => !live.current.busy,
    onPanResponderGrant: () => { gesture.current.touches = 0; },
    onPanResponderMove: event => {
      const touches = event.nativeEvent.touches;
      if (!touches.length) return;
      const x = touches.reduce((sum, p) => sum + p.pageX, 0) / touches.length;
      const y = touches.reduce((sum, p) => sum + p.pageY, 0) / touches.length;
      const distance = touches.length > 1 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : 0;
      if (gesture.current.touches !== touches.length) {
        gesture.current = { ...live.current.position, startX: x, startY: y, distance, touches: touches.length };
        return;
      }
      const start = gesture.current;
      const width = distance > 0 && start.distance > 0 ? start.width * distance / start.distance : start.width;
      update({ width, x: start.x + x - start.startX - (width - start.width) / 2, y: start.y + y - start.startY - (width - start.width) * stickerRatio(live.current.view) / 2 });
    },
    onPanResponderTerminationRequest: () => false,
  }), []);
  const resize = (factor: number) => {
    const p = live.current.position;
    const width = p.width * factor;
    update({ width, x: p.x - (width - p.width) / 2, y: p.y - (width - p.width) * stickerRatio(model.view) / 2 });
  };
  const pickMedia = async () => {
    if (busy || picking) return;
    setPicking(true); setNotice('');
    try {
      // The system picker grants access only to the item selected by the user.
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsEditing: false, quality: 1, videoExportPreset: ImagePicker.VideoExportPreset.H264_1920x1080 });
      const asset = !result.canceled && result.assets[0];
      if (!asset) return;
      if (!(asset.width > 0 && asset.height > 0)) throw new Error(t('Medya boyutları okunamadı.'));
      if (asset.type === 'video' && !RankVideo) throw new Error(t('Video düzenlemek için uygulamanın yeni sürümünü yükle.'));
      setReady(false); setPaused(false);
      setMedia({ uri: asset.uri, width: asset.width, height: asset.height, video: asset.type === 'video' });
    } catch (error: any) { setNotice(error.message || t('Medya açılamadı.')); }
    finally { setPicking(false); }
  };
  const savePermission = async () => {
    // Scoped storage needs no read-library permission to add our own exported file.
    if (Platform.OS === 'android' && Number(Platform.Version) >= 29) return true;
    const permission = await MediaLibrary.requestPermissionsAsync(true, []);
    if (permission.granted) return true;
    Alert.alert(t('Galeriye kaydetme izni'), t('Hazırladığın paylaşımı kaydetmek için fotoğraf ekleme izni gerekiyor.'), [
      { text: t('Vazgeç'), style: 'cancel' },
      ...(!permission.canAskAgain ? [{ text: t('Ayarları aç'), onPress: () => { void Linking.openSettings(); } }] : []),
    ]);
    return false;
  };
  const output = async (action: 'save' | 'share') => {
    if (locked.current || (media && !ready) || canvas.width <= 0) return;
    locked.current = true; cancelled.current = false; setBusy(true); setNotice('');
    let uri: string | undefined;
    let stickerUri: string | undefined;
    try {
      if (action === 'save' && !(await savePermission())) return;
      if (action === 'share' && !(await Sharing.isAvailableAsync())) throw new Error(t('Paylaşım bu cihazda desteklenmiyor.'));
      await frame();
      if (media?.video) {
        setExporting(true);
        stickerUri = await stickerCapture.current?.capture?.();
        if (!stickerUri || !RankVideo) throw new Error(t('Görsel oluşturulamadı.'));
        if (cancelled.current) return;
        uri = await RankVideo.exportVideo(fileUri(media.uri), fileUri(stickerUri), {
          x: position.x / canvas.width, y: position.y / canvas.height,
          width: position.width / canvas.width, height: position.width * stickerRatio(model.view) / canvas.height,
        });
      } else {
        const raw = await capture.current?.capture?.();
        if (!raw) throw new Error(t('Görsel oluşturulamadı.'));
        uri = `${FileSystem.cacheDirectory}gymbodyai-${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: fileUri(raw), to: uri });
      }
      if (cancelled.current) return;
      if (action === 'save') {
        if (Platform.OS === 'android' && Number(Platform.Version) >= 29 && RankVideo) await RankVideo.saveMedia(uri);
        else await MediaLibrary.saveToLibraryAsync(uri);
        setNotice(t('Galeriye kaydedildi.'));
      } else {
        await Sharing.shareAsync(uri, { mimeType: media?.video ? 'video/mp4' : 'image/jpeg', UTI: media?.video ? 'public.mpeg-4' : 'public.jpeg', dialogTitle: t('GymBodyAI Güç Rozetim') });
      }
    } catch (error: any) {
      if (!cancelled.current && mounted.current) setNotice(error.message || t('Paylaşım başarısız.'));
    } finally {
      // A receiving app may still be reading after the share sheet dismisses.
      if (uri && (action === 'save' || cancelled.current)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      if (stickerUri) await FileSystem.deleteAsync(stickerUri, { idempotent: true }).catch(() => {});
      locked.current = false;
      if (mounted.current) { setBusy(false); setExporting(false); }
    }
  };
  const stickerProps = { ...model, muscle, gender };
  const fullWidth = model.view === 'both' ? 280 : 170;
  const previewWidth = Math.min(fullWidth, Math.max(1, canvas.width - 32), Math.max(1, canvas.height - 55) / stickerRatio(model.view));
  const outputScale = media ? Math.min(2048 / Math.max(media.width, media.height), 1) : 1;
  const exportSize = media ? { width: Math.round(media.width * outputScale), height: Math.round(media.height * outputScale) } : { width: 1080, height: Math.round(1080 * canvas.height / Math.max(1, canvas.width)) };
  const button = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void, primary = false, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button, primary && { backgroundColor: colors.lime }, disabled && { opacity: 0.4 }]}>
    <Ionicons name={icon} size={19} color={primary ? colors.bg : '#fff'} /><Text style={[styles.buttonText, primary && { color: colors.bg }]}>{label}</Text>
  </TouchableOpacity>;
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!busy && !picking) onClose(); }}>
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>GYMBODYAI</Text><Text style={styles.title}>{t(media ? 'Story hazırla' : 'Gücünü paylaş')}</Text></View>
        <TouchableOpacity accessibilityLabel={t('Kapat')} disabled={busy || picking} onPress={onClose} style={styles.close}><Ionicons name="close" color="#fff" size={24} /></TouchableOpacity>
      </View>
      <View style={styles.stage} onLayout={e => setBounds(e.nativeEvent.layout)}>
        {canvas.width > 0 && canvas.height > 0 && <View style={{ width: canvas.width, height: canvas.height }}>
          <ViewShot ref={capture} options={{ format: 'jpg', quality: 0.97, ...exportSize }} style={{ width: canvas.width, height: canvas.height, overflow: 'hidden', backgroundColor: media ? '#000' : '#101722' }}>
            {media ? <>
              {media.video ? <VideoPreview key={media.uri} uri={media.uri} paused={paused || busy} onReady={() => setReady(true)} onError={() => { setReady(false); setNotice(t('Video açılamadı.')); }} />
                : <Image key={media.uri} source={{ uri: media.uri }} style={StyleSheet.absoluteFill} resizeMode="contain" onLoad={() => setReady(true)} onError={() => { setReady(false); setNotice(t('Medya açılamadı.')); }} />}
              <View {...responder.panHandlers} style={{ position: 'absolute', left: position.x, top: position.y, width: position.width, height: position.width * stickerRatio(model.view) }}>
                <ViewShot ref={stickerCapture} options={{ format: 'png', width: 800, height: Math.round(800 * stickerRatio(model.view)) }} style={{ backgroundColor: 'transparent' }}>
                  <BodyRankSticker {...stickerProps} width={position.width} />
                </ViewShot>
              </View>
            </> : <View style={styles.preview}>
              <Text style={styles.previewTitle}>{t('Gücümün haritası')}</Text>
              <BodyRankSticker {...stickerProps} width={previewWidth} />
            </View>}
          </ViewShot>
          {media && !ready && !notice && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color={colors.lime} /></View>}
        </View>}
      </View>
      <View style={styles.controls}>
        {media ? <>
          <Text style={styles.hint}>{t('Sticker’ı sürükle, iki parmakla boyutlandır.')}</Text>
          <View style={styles.row}>
            {button(t('Küçült'), 'remove', () => resize(0.85), false, busy)}
            {button(t('Büyüt'), 'add', () => resize(1.15), false, busy)}
            {button(t('Sıfırla'), 'refresh', () => setPosition(initialSticker(canvas, model.view)), false, busy)}
          </View>
          <View style={styles.row}>
            {button(t('Medyayı değiştir'), 'images-outline', pickMedia, false, busy || picking)}
            {media.video && button(t(paused ? 'Oynat' : 'Duraklat'), paused ? 'play' : 'pause', () => setPaused(!paused), false, busy)}
          </View>
          <View style={styles.row}>
            {button(t('Kaydet'), 'download-outline', () => { void output('save'); }, false, busy || !ready)}
            {button(t('Paylaş'), 'share-social-outline', () => { void output('share'); }, true, busy || !ready)}
          </View>
        </> : <>
          <Text style={styles.hint}>{t(muscle ? 'Yalnızca seçili kasın rank rengi paylaşılır.' : 'Ön ve arka vücut, tüm rank renkleriyle paylaşılır.')}</Text>
          <View style={styles.row}>
            {button(t('Foto / videoya ekle'), 'images-outline', pickMedia, false, busy || picking)}
            {button(t('Paylaş'), 'share-social-outline', () => { void output('share'); }, true, busy)}
          </View>
        </>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        {(busy || picking) && <View style={styles.row}><ActivityIndicator color={colors.lime} /><Text style={styles.hint}>{t(exporting ? 'Video hazırlanıyor…' : 'Hazırlanıyor…')}</Text>
          {exporting && button(t('İptal'), 'close', () => { cancelled.current = true; void RankVideo?.cancelExport(); })}
        </View>}
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, header: { paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.lime, fontSize: 10, fontWeight: '800', letterSpacing: 2 }, title: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 5 }, close: { padding: 10 },
  stage: { flex: 1, marginHorizontal: 16, alignItems: 'center', justifyContent: 'center' }, preview: { flex: 1, alignItems: 'center', justifyContent: 'center' }, previewTitle: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 12 },
  controls: { paddingHorizontal: 16, paddingTop: 12, gap: 8 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, button: { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 12, borderRadius: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }, notice: { color: colors.lime, textAlign: 'center', fontSize: 12 }, loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
