import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Image,
  Alert,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { useContractsStore } from '../../../store/contractsStore';
import { contractsService } from '../../../services';
import { Button, Card, Badge, ProgressBar, ErrorMessage, Divider } from '../../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../../constants/theme';
import * as FileSystem from 'expo-file-system';

interface CapturedImage {
  uri: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  deviceId: string;
  hash: string;
  note?: string;
}

export default function CheckinReviewScreen() {
  const params = useLocalSearchParams();
  const contractId = params.contractId as string || params.id as string;
  const mode = params.mode as string; // 'review' = tenant reviewing, else = landlord uploading

  const { user } = useAuthStore();
  const { contracts, setSelectedContract, setInspection } = useContractsStore();
  const contract = contracts.find(c => c.id === contractId);

  const isReviewMode = mode === 'review';
  const isLandlord = user?.id === contract?.landlord_id;
  const isTenant = user?.id === contract?.tenant_id;

  // Images from camera capture (landlord upload flow)
  let capturedImages: CapturedImage[] = [];
  try {
    capturedImages = params.images ? JSON.parse(params.images as string) : [];
  } catch (e) {}

  // Images from server (tenant review flow)
  const [serverImages, setServerImages] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [approving, setApproving] = useState(false);

  // Load server images for review mode
  useEffect(() => {
    if (isReviewMode && contractId) {
      loadCheckinImages();
    }
  }, [isReviewMode, contractId]);

  const loadCheckinImages = async () => {
    try {
      const response = await contractsService.getInspectionImages(contractId, 'checkin');
      setServerImages(response.images);
    } catch (err) {
      setError('Učitavanje slika nije uspelo');
    }
  };

  const images = isReviewMode ? serverImages : capturedImages;

  // Landlord: upload captured images
  const handleUploadImages = async () => {
    if (capturedImages.length === 0) {
      setError('Nema slika za otpremanje');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const uploadPromises = capturedImages.map(async (image, index) => {
        setUploadProgress(Math.round(((index + 1) / capturedImages.length) * 100));
        return {
          uri: image.uri,
          captured_at: image.timestamp,
          gps_lat: image.latitude,
          gps_lng: image.longitude,
          device_id: image.deviceId,
          image_hash: image.hash,
          note: image.note,
        };
      });

      const uploadedImages = await Promise.all(uploadPromises);

      await contractsService.uploadInspectionImages(
        contractId,
        'all-rooms',
        'checkin',
        uploadedImages as any
      );

      setInspection(contractId, { contractId, inspectionType: 'checkin', images: uploadedImages as any, roomId: null, isLoading: false });

      Alert.alert('Uspeh', 'Check-in slike su uspešno otpremljene!', [
        {
          text: 'Pogledaj ugovor',
          onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contractId } }),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Otpremanje slika nije uspelo');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // Tenant: approve check-in
  const handleApprove = async () => {
    Alert.alert(
      'Odobri check-in',
      'Da li ste sigurni da želite da odobrite check-in slike? Ovim potvrđujete stanje nekretnine na početku zakupa.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Odobri',
          onPress: async () => {
            setApproving(true);
            try {
              // Mock: would call contractsService.approveCheckin(contractId)
              if (contract) {
                setSelectedContract({ ...contract, status: 'active' as any });
              }
              Alert.alert('Uspeh', 'Check-in je odobren. Ugovor je sada aktivan.', [
                {
                  text: 'OK',
                  onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contractId } }),
                },
              ]);
            } catch (err) {
              Alert.alert('Greška', 'Odobravanje check-in-a nije uspelo');
            } finally {
              setApproving(false);
            }
          },
        },
      ]
    );
  };

  // Tenant: reject check-in
  const handleReject = async () => {
    if (!rejectComment.trim()) {
      setError('Morate uneti razlog odbijanja');
      return;
    }

    setRejecting(true);
    try {
      // Mock: would call contractsService.rejectCheckin(contractId, rejectComment)
      if (contract) {
        setSelectedContract({ ...contract, status: 'checkin_rejected' as any, rejection_comment: rejectComment });
      }
      setShowRejectModal(false);
      Alert.alert('Odbijeno', 'Check-in je odbijen. Stanodavac će biti obavešten.', [
        {
          text: 'OK',
          onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contractId } }),
        },
      ]);
    } catch (err) {
      Alert.alert('Greška', 'Odbijanje check-in-a nije uspelo');
    } finally {
      setRejecting(false);
    }
  };

  const renderImageItem = ({ item, index }: { item: any; index: number }) => (
    <TouchableOpacity
      style={[
        styles.imageThumb,
        selectedImageIndex === index && styles.imageThumbSelected,
      ]}
      onPress={() => setSelectedImageIndex(index)}
    >
      <Image source={{ uri: item.uri || item.image_url }} style={styles.imageThumbImage} />
      <View style={styles.imageCounter}>
        <Text style={styles.imageCounterText}>{index + 1}</Text>
      </View>
    </TouchableOpacity>
  );

  const selectedImage = selectedImageIndex !== null ? images[selectedImageIndex] : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>
            {isReviewMode ? 'Pregled check-in slika' : 'Check-in slike'}
          </Text>
          <Text style={[styles.subtitle, Typography.bodySmall]}>
            {images.length} fotografija{isReviewMode ? ' - pregledajte i odobrite ili odbijte' : ' snimljeno'}
          </Text>
          {isReviewMode && (
            <Badge label="Čeka vaše odobrenje" variant="warning" size="small" />
          )}
        </View>

        {error && <ErrorMessage message={error} />}

        {/* Selected Image Preview */}
        {selectedImage && (
          <Card style={styles.previewCard}>
            <Image source={{ uri: selectedImage.uri || selectedImage.image_url }} style={styles.largeImage} />
            <View style={styles.imageInfoContainer}>
              <Text style={[styles.imageLabel, Typography.bodySemibold]}>
                Slika {selectedImageIndex! + 1}
              </Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, Typography.captionSmall]}>Snimljeno:</Text>
                <Text style={[styles.infoValue, Typography.captionSmall]}>
                  {new Date(selectedImage.timestamp || selectedImage.captured_at).toLocaleString()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, Typography.captionSmall]}>GPS:</Text>
                <Text style={[styles.infoValue, Typography.captionSmall]}>
                  {(selectedImage.latitude || selectedImage.gps_lat || 0).toFixed(4)}, {(selectedImage.longitude || selectedImage.gps_lng || 0).toFixed(4)}
                </Text>
              </View>
              {(selectedImage.note) && (
                <View style={styles.noteContainer}>
                  <Text style={[styles.infoLabel, Typography.captionSmall]}>Napomena:</Text>
                  <Text style={[styles.noteText, Typography.body]}>{selectedImage.note}</Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Image Grid */}
        <Card style={styles.thumbnailsCard}>
          <Text style={[Typography.heading4, styles.thumbnailsTitle]}>Sve slike</Text>
          <FlatList
            data={images}
            renderItem={renderImageItem}
            keyExtractor={(_, index) => index.toString()}
            numColumns={4}
            scrollEnabled={false}
            columnWrapperStyle={styles.thumbnailsRow}
            contentContainerStyle={styles.thumbnailsList}
          />
        </Card>

        {/* Upload Progress (landlord upload mode) */}
        {uploading && (
          <Card style={styles.progressCard}>
            <Text style={[Typography.bodySemibold, styles.progressText]}>
              Otpremanje... {uploadProgress}%
            </Text>
            <ProgressBar progress={uploadProgress} style={styles.progressBar} />
          </Card>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          {isReviewMode ? (
            <>
              {/* Tenant review actions */}
              <Button
                label="Odobri check-in"
                onPress={handleApprove}
                loading={approving}
                disabled={approving || rejecting}
                fullWidth
              />
              <Button
                label="Odbij check-in"
                onPress={() => setShowRejectModal(true)}
                variant="danger"
                disabled={approving || rejecting}
                fullWidth
                style={styles.secondaryButton}
              />
              <Button
                label="Nazad"
                variant="outline"
                onPress={() => router.back()}
                disabled={approving || rejecting}
                fullWidth
                style={styles.secondaryButton}
              />
            </>
          ) : (
            <>
              {/* Landlord upload actions */}
              <Button
                label={uploading ? 'Otpremanje...' : `Otpremi ${images.length} slika`}
                onPress={handleUploadImages}
                disabled={uploading || images.length === 0}
                loading={uploading}
                fullWidth
              />
              <Button
                label="Ponovo fotografiši"
                variant="outline"
                onPress={() => router.back()}
                disabled={uploading}
                fullWidth
                style={styles.secondaryButton}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* Reject Modal */}
      <Modal visible={showRejectModal} animationType="slide" transparent>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, Typography.heading3]}>Odbij check-in</Text>
            <Text style={[styles.modalSubtitle, Typography.bodySmall]}>
              Navedite razlog odbijanja. Stanodavac će morati ponovo da fotografiše nekretninu.
            </Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="Unesite razlog odbijanja..."
              placeholderTextColor={Colors.textSecondary}
              value={rejectComment}
              onChangeText={setRejectComment}
              multiline
              numberOfLines={4}
            />
            <View style={styles.modalButtons}>
              <Button
                label="Otkaži"
                variant="outline"
                onPress={() => { setShowRejectModal(false); setRejectComment(''); }}
                style={styles.modalButton}
              />
              <Button
                label="Potvrdi odbijanje"
                variant="danger"
                onPress={handleReject}
                loading={rejecting}
                disabled={!rejectComment.trim()}
                style={styles.modalButton}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  header: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
  },
  subtitle: {
    color: Colors.textSecondary,
  },
  previewCard: {
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  largeImage: {
    width: '100%',
    height: 300,
    backgroundColor: Colors.backgroundSecondary,
  },
  imageInfoContainer: {
    padding: Spacing.md,
  },
  imageLabel: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: Spacing.xs,
  },
  infoLabel: {
    color: Colors.textSecondary,
    flex: 0.4,
  },
  infoValue: {
    color: Colors.text,
    flex: 0.6,
    textAlign: 'right',
  },
  noteContainer: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  noteText: {
    color: Colors.text,
    marginTop: Spacing.sm,
    lineHeight: 20,
  },
  thumbnailsCard: {
    marginBottom: Spacing.md,
  },
  thumbnailsTitle: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  thumbnailsList: {
    paddingHorizontal: 0,
  },
  thumbnailsRow: {
    justifyContent: 'flex-start',
    marginBottom: Spacing.md,
  },
  imageThumb: {
    width: '23%',
    aspectRatio: 1,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundSecondary,
  },
  imageThumbSelected: {
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  imageThumbImage: {
    width: '100%',
    height: '100%',
  },
  imageCounter: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageCounterText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressCard: {
    marginBottom: Spacing.md,
  },
  progressText: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 8,
  },
  buttonsContainer: {
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  secondaryButton: {
    marginTop: Spacing.xs,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  modalTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  modalSubtitle: {
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  rejectInput: {
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.text,
    marginBottom: Spacing.lg,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  modalButton: {
    flex: 1,
  },
});
