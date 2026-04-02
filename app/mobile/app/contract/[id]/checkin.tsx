import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { CameraView, Camera } from 'expo-camera';
import * as Location from 'expo-location';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Room } from '@rentsmart/contracts';
import { useAuthStore } from '../../../store/authStore';
import { useContractsStore } from '../../../store/contractsStore';
import { contractsService } from '../../../services';
import { Button, Card, Badge, Divider, LoadingOverlay } from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';

type UiState = 'permissions' | 'starting' | 'room_select' | 'camera' | 'completing';

interface CapturedImage {
  uri: string;
  timestamp: number;
  gps: { lat: number; lng: number };
}

export default function CheckinScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { selectedContract, setSelectedContract } = useContractsStore();

  const [uiState, setUiState] = useState<UiState>('permissions');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomImages, setRoomImages] = useState<Record<string, CapturedImage[]>>({});
  // uploadedCounts tracks images confirmed uploaded to server (used to gate Complete)
  const [uploadedCounts, setUploadedCounts] = useState<Record<string, number>>({});
  const [flashOn, setFlashOn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const contract = selectedContract;
  const rooms = contract?.rooms ?? [];

  // Load contract if not in store
  useEffect(() => {
    if (!contract && id) {
      contractsService.getContract(id).then((res) => setSelectedContract(res.contract));
    }
  }, [id, contract]);

  // Step 1: Request permissions
  useEffect(() => {
    (async () => {
      const cam = await Camera.requestCameraPermissionsAsync();
      const loc = await Location.requestForegroundPermissionsAsync();
      if (cam.status === 'granted' && loc.status === 'granted') {
        setUiState('starting');
      } else {
        setPermissionError(
          [
            cam.status !== 'granted' ? 'Camera permission denied.' : null,
            loc.status !== 'granted' ? 'Location permission denied.' : null,
          ]
            .filter(Boolean)
            .join(' ')
        );
      }
    })();
  }, []);

  // Step 2: Start inspection (only if status is 'accepted')
  useEffect(() => {
    if (uiState !== 'starting' || !contract) return;
    const start = async () => {
      try {
        if (contract.status === 'accepted') {
          const res = await contractsService.startCheckin(id);
          setSelectedContract(res.contract);
        }
        setUiState('room_select');
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start check-in');
        router.replace(`/contract/${id}`);
      }
    };
    start();
  }, [uiState, contract]);

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    setUiState('camera');
  };

  const handleCapture = async () => {
    if (!cameraRef.current || !selectedRoom) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      const resized = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 1920 } }],
        { compress: 0.85, format: SaveFormat.JPEG }
      );
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const captured: CapturedImage = {
        uri: resized.uri,
        timestamp: Date.now(),
        gps: { lat: location.coords.latitude, lng: location.coords.longitude },
      };
      setRoomImages((prev) => ({
        ...prev,
        [selectedRoom.id]: [...(prev[selectedRoom.id] ?? []), captured],
      }));
    } catch (err) {
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  const handleDoneWithRoom = async () => {
    if (!selectedRoom) return;
    const images = roomImages[selectedRoom.id] ?? [];
    if (images.length === 0) {
      Alert.alert('No photos', 'Take at least one photo before continuing.');
      return;
    }
    setUploading(true);
    try {
      await contractsService.uploadInspectionImages(
        id,
        selectedRoom.id,
        'checkin',
        images.map((img) => ({
          uri: img.uri,
          timestamp: img.timestamp,
          gps: img.gps,
          deviceId: user?.device_id ?? 'unknown',
        }))
      );
      setUploadedCounts((prev) => ({ ...prev, [selectedRoom.id]: images.length }));
      setUiState('room_select');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Upload failed';
      Alert.alert('Upload failed', msg);
    } finally {
      setUploading(false);
    }
  };

  const allMandatoryDone = rooms
    .filter((r) => r.is_mandatory)
    .every((r) => (uploadedCounts[r.id] ?? 0) >= 3);

  const handleComplete = async () => {
    setUiState('completing');
    try {
      await contractsService.completeCheckin(id);
      router.replace(`/contract/${id}`);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Failed to complete check-in';
      Alert.alert('Error', msg);
      setUiState('room_select');
    }
  };

  // ── Permissions denied ──────────────────────────────────────────────────────
  if (uiState === 'permissions' && permissionError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={[styles.errorText, Typography.body]}>{permissionError}</Text>
          <Text style={[styles.hint, Typography.bodySmall]}>
            Enable camera and location access in your device settings.
          </Text>
          <Button label="← Back" onPress={() => router.replace(`/contract/${id}`)} style={styles.mt} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading / starting ──────────────────────────────────────────────────────
  if (uiState === 'permissions' || uiState === 'starting' || uiState === 'completing') {
    const message =
      uiState === 'completing' ? 'Completing check-in…' : 'Starting check-in…';
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={[styles.hint, Typography.body]}>{message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Camera ──────────────────────────────────────────────────────────────────
  if (uiState === 'camera' && selectedRoom) {
    const captured = roomImages[selectedRoom.id] ?? [];
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flashOn ? 'on' : 'off'} />

        {/* Top bar */}
        <SafeAreaView style={styles.cameraTopBar}>
          <TouchableOpacity
            onPress={() => {
              const pending = roomImages[selectedRoom.id]?.length ?? 0;
              if (pending > 0) {
                Alert.alert('Unsaved photos', 'Tap "Done" to upload your photos first, or they will be lost.', [
                  { text: 'Stay' },
                  { text: 'Discard & go back', style: 'destructive', onPress: () => {
                    setRoomImages((prev) => { const next = { ...prev }; delete next[selectedRoom.id]; return next; });
                    setUiState('room_select');
                  }},
                ]);
              } else {
                setUiState('room_select');
              }
            }}
            style={styles.cameraTopBtn}
          >
            <Text style={styles.cameraTopBtnText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.roomLabel} numberOfLines={1}>
            {selectedRoom.custom_name || selectedRoom.room_type.replace(/_/g, ' ')}
          </Text>
          <TouchableOpacity onPress={() => setFlashOn((f) => !f)} style={styles.cameraTopBtn}>
            <Text style={styles.cameraTopBtnText}>{flashOn ? '⚡ On' : '⚡ Off'}</Text>
          </TouchableOpacity>
        </SafeAreaView>

        {/* Thumbnail strip */}
        {captured.length > 0 && (
          <View style={styles.thumbnailStrip}>
            <FlatList
              data={captured}
              horizontal
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item, index }) => (
                <View style={styles.thumbnailWrapper}>
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                  <TouchableOpacity
                    style={styles.thumbnailRemove}
                    onPress={() =>
                      setRoomImages((prev) => ({
                        ...prev,
                        [selectedRoom.id]: prev[selectedRoom.id].filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Text style={styles.thumbnailRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              contentContainerStyle={styles.thumbnailList}
            />
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.cameraBottomBar}>
          <TouchableOpacity style={styles.captureBtn} onPress={handleCapture} />
          <Button
            label={uploading ? 'Uploading…' : `Done (${captured.length})`}
            onPress={handleDoneWithRoom}
            disabled={uploading || captured.length === 0}
            style={styles.doneBtn}
          />
        </View>

        <LoadingOverlay visible={uploading} message="Uploading photos…" />
      </View>
    );
  }

  // ── Room select ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Button
          label="← Back"
          onPress={() => router.replace(`/contract/${id}`)}
          variant="outline"
          size="small"
          style={styles.backButton}
        />
        <Text style={[styles.title, Typography.heading2]}>Check-in</Text>
        <Text style={[styles.subtitle, Typography.bodySmall]}>
          Photograph each mandatory room (min 3 photos each).
        </Text>

        {rooms
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((room) => {
            const uploaded = uploadedCounts[room.id] ?? 0;
            const captured = roomImages[room.id]?.length ?? 0;
            const count = uploaded > 0 ? uploaded : captured;
            const done = !room.is_mandatory || uploaded >= 3;
            return (
              <TouchableOpacity key={room.id} onPress={() => handleSelectRoom(room)}>
                <Card style={[styles.roomCard, done && styles.roomCardDone]}>
                  <View style={styles.roomRow}>
                    <View style={styles.roomInfo}>
                      <Text style={[styles.roomName, Typography.body]}>
                        {room.custom_name || room.room_type.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[styles.imageCount, Typography.caption]}>
                        {count} photo{count !== 1 ? 's' : ''}{room.is_mandatory ? ` / 3 required` : ''}
                      </Text>
                    </View>
                    <View style={styles.roomBadges}>
                      {room.is_mandatory && <Badge label="Mandatory" variant="primary" size="small" />}
                      {done && <Badge label="✓" variant="success" size="small" />}
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}

        <Divider />
        <Button
          label="Complete Check-in"
          onPress={handleComplete}
          fullWidth
          disabled={!allMandatoryDone}
          style={styles.mt}
        />
        {!allMandatoryDone && (
          <Text style={[styles.hint, Typography.caption]}>
            All mandatory rooms need at least 3 photos.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.lg },
  title: { color: Colors.text, marginBottom: Spacing.sm, textAlign: 'center' },
  subtitle: { color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  roomCard: { marginBottom: Spacing.md, padding: Spacing.md },
  roomCardDone: { borderColor: Colors.success, borderWidth: 1 },
  roomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomInfo: { flex: 1 },
  roomName: { color: Colors.text, textTransform: 'capitalize' },
  imageCount: { color: Colors.textSecondary, marginTop: Spacing.xs },
  roomBadges: { flexDirection: 'row', gap: Spacing.xs },
  mt: { marginTop: Spacing.md },
  hint: { color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
  errorText: { color: Colors.error, textAlign: 'center', marginBottom: Spacing.md },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  cameraTopBtn: { padding: Spacing.sm },
  cameraTopBtnText: { color: '#fff', fontSize: 14 },
  roomLabel: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, textAlign: 'center', textTransform: 'capitalize' },
  thumbnailStrip: { position: 'absolute', bottom: 120, left: 0, right: 0 },
  thumbnailList: { paddingHorizontal: Spacing.md },
  thumbnailWrapper: { position: 'relative', marginRight: Spacing.sm },
  thumbnail: { width: 60, height: 60, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  thumbnailRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' as const },
  cameraBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  doneBtn: { minWidth: 120 },
});
