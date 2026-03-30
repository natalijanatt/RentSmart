import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { File } from 'expo-file-system/next';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../../constants/theme';
import { Button } from '../../../components';
import { useContractsStore } from '../../../store/contractsStore';

interface CapturedImage {
  uri: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  deviceId: string;
  hash: string;
  note?: string;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function CameraScreen() {
  const params = useLocalSearchParams();
  const contractId = params.contractId as string;
  const roomId = params.roomId as string;
  const inspectionType = params.inspectionType as 'checkin' | 'checkout';
  const roomName = params.roomName as string;
  const totalRooms = parseInt(params.totalRooms as string) || 1;
  const currentRoomIndex = parseInt(params.currentRoomIndex as string) || 1;

  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();
  const cameraRef = useRef<any>(null);
  
  // Accumulated images from previous rooms (passed via params)
  let previousImages: CapturedImage[] = [];
  try {
    previousImages = params.previousImages ? JSON.parse(params.previousImages as string) : [];
  } catch (_) {}

  const { contracts } = useContractsStore();
  const contract = contracts.find(c => c.id === contractId);

  const [loading, setLoading] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'pending' | 'success' | 'error'>('pending');
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [lastCapturedUri, setLastCapturedUri] = useState<string | null>(null);
  const [lastCapturedHash, setLastCapturedHash] = useState<string>('');

  // Initialize permissions and location
  useEffect(() => {
    const initializeCamera = async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
      if (!locationPermission?.granted) {
        await requestLocationPermission();
      }
      await getLocation();
    };
    initializeCamera();
  }, []);

  const getLocation = async () => {
    try {
      setGpsStatus('pending');
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(loc);
      setGpsStatus('success');
    } catch (err) {
      console.error('GPS error:', err);
      setGpsStatus('error');
      Alert.alert('Location Error', 'Could not get GPS location. Photos may still be captured.');
    }
  };

  const captureImage = async () => {
    if (!cameraRef.current) return;

    try {
      setLoading(true);
      
      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      // Resize image (preporučeni 1920px max width)
      const resized = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1920 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Generate hash for integrity (best-effort, non-blocking)
      let hash = '';
      try {
        const file = new File(resized.uri);
        if (file.exists && file.size && file.size < 5 * 1024 * 1024) {
          const fileContent = await file.text();
          hash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            fileContent
          );
        }
      } catch (hashErr) {
        console.warn('Hash generation skipped:', hashErr);
      }

      setLastCapturedUri(resized.uri);
      setLastCapturedHash(hash);
      setNoteText('');
      setShowNoteModal(true);
    } catch (err) {
      Alert.alert('Camera Error', 'Failed to capture image');
      console.error('Camera error:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveImageWithNote = () => {
    if (!lastCapturedUri) return;

    const newImage: CapturedImage = {
      uri: lastCapturedUri,
      timestamp: new Date().toISOString(),
      latitude: location?.coords?.latitude || 0,
      longitude: location?.coords?.longitude || 0,
      deviceId: 'device-' + Math.random().toString(36).substring(7),
      hash: lastCapturedHash,
      note: noteText || undefined,
    };

    setCapturedImages([...capturedImages, newImage]);
    setShowNoteModal(false);
    setLastCapturedUri(null);
    setLastCapturedHash('');
  };

  const removeImage = (index: number) => {
    setCapturedImages(capturedImages.filter((_, i) => i !== index));
  };

  const handleContinue = () => {
    if (capturedImages.length < 3) {
      Alert.alert('Minimum Photos Required', 'Please capture at least 3 photos of this room.');
      return;
    }

    const allImages = [...previousImages, ...capturedImages];
    const nextRoomIndex = currentRoomIndex + 1;
    const rooms = contract?.rooms || [];

    if (nextRoomIndex <= totalRooms && rooms[nextRoomIndex - 1]) {
      const nextRoom = rooms[nextRoomIndex - 1];
      // Navigate to camera for the next room
      router.push({
        pathname: '/contract/[id]/camera',
        params: {
          id: contractId,
          contractId,
          roomId: nextRoom.id,
          roomName: nextRoom.custom_name || nextRoom.room_type,
          inspectionType,
          currentRoomIndex: nextRoomIndex,
          totalRooms,
          previousImages: JSON.stringify(allImages),
        },
      });
    } else {
      // All rooms done — go to review
      router.push({
        pathname: inspectionType === 'checkin' ? '/contract/[id]/checkin-review' : '/contract/[id]/checkout-review',
        params: {
          id: contractId,
          contractId,
          inspectionType,
          images: JSON.stringify(allImages),
        },
      });
    }
  };

  if (!permission?.granted || !locationPermission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={[styles.errorText, Typography.heading3]}>Permissions Required</Text>
          <Text style={[styles.errorDesc, Typography.body]}>
            Camera and location permissions are needed to proceed.
          </Text>
          <Button label="Request Permissions" onPress={() => {
            requestPermission();
            requestLocationPermission();
          }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera}>
        {/* Overlay Content */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <Text style={[styles.roomNameText, Typography.heading3]}>{roomName}</Text>
            <Text style={[styles.progressText, Typography.bodySmall]}>
              {currentRoomIndex}/{totalRooms}
            </Text>
          </View>

          {/* GPS Status */}
          <View style={[
            styles.gpsIndicator,
            gpsStatus === 'success' ? styles.gpsSuccess : gpsStatus === 'error' ? styles.gpsError : styles.gpsPending
          ]}>
            <Text style={[styles.gpsText, Typography.captionSmall]}>
              GPS: {gpsStatus === 'success' ? '✓' : gpsStatus === 'pending' ? '⌛' : '✗'}
            </Text>
          </View>

          {/* Image Counter */}
          <View style={styles.counterContainer}>
            <Text style={[styles.counterText, Typography.heading3]}>
              {capturedImages.length}/3
            </Text>
            <Text style={[styles.counterLabel, Typography.bodySmall]}>Minimum required</Text>
          </View>

          {/* Bottom Buttons */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.captureButton}
              onPress={captureImage}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} size="large" />
              ) : (
                <View style={styles.captureButtonInner} />
              )}
            </TouchableOpacity>
            
            <Text style={[styles.capturedCountText, Typography.bodySmall]}>
              Captured: {capturedImages.length}
            </Text>
          </View>
        </View>
      </CameraView>

      {/* Note Modal */}
      <Modal visible={showNoteModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, Typography.heading3]}>Add Note (Optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Enter any notes about this photo..."
              placeholderTextColor={Colors.textSecondary}
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <Button
                label="Skip"
                variant="outline"
                onPress={saveImageWithNote}
                style={styles.modalButton}
              />
              <Button
                label="Save with Note"
                onPress={saveImageWithNote}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Sheet for Captured Images */}
      {capturedImages.length > 0 && (
        <View style={styles.capturedImagesContainer}>
          <Text style={[Typography.bodySmall]}>
            {capturedImages.length} photo{capturedImages.length !== 1 ? 's' : ''} captured
          </Text>
          {capturedImages.length >= 3 && (
            <Button
              label="Continue"
              onPress={handleContinue}
              style={styles.continueButton}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.text,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomNameText: {
    color: Colors.white,
  },
  progressText: {
    color: Colors.white,
  },
  gpsIndicator: {
    marginTop: Spacing.md,
    marginHorizontal: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignSelf: 'flex-start',
  },
  gpsSuccess: {
    backgroundColor: 'rgba(76, 175, 80, 0.8)',
  },
  gpsError: {
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
  },
  gpsPending: {
    backgroundColor: 'rgba(255, 193, 7, 0.8)',
  },
  gpsText: {
    color: Colors.white,
  },
  counterContainer: {
    alignItems: 'center',
    marginVertical: Spacing.lg,
  },
  counterText: {
    color: Colors.white,
  },
  counterLabel: {
    color: Colors.white,
    marginTop: Spacing.xs,
  },
  bottomBar: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  captureButtonInner: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: Colors.white,
  },
  capturedCountText: {
    color: Colors.white,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  errorText: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  errorDesc: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  modalTitle: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  noteInput: {
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    marginBottom: Spacing.lg,
    minHeight: 80,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
  },
  capturedImagesContainer: {
    backgroundColor: Colors.backgroundSecondary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  continueButton: {
    marginTop: Spacing.md,
  },
});
