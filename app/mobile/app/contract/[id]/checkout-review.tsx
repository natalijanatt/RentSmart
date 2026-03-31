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

interface CapturedImage {
  uri: string;
  timestamp: string;
  latitude: number;
  longitude: number;
  deviceId: string;
  hash: string;
  note?: string;
}

export default function CheckoutReviewScreen() {
  const params = useLocalSearchParams();
  const contractId = params.contractId as string || params.id as string;
  const mode = params.mode as string; // 'review' = landlord reviewing, else = tenant uploading

  const { user } = useAuthStore();
  const { contracts, setSelectedContract, setInspection } = useContractsStore();
  const contract = contracts.find(c => c.id === contractId);

  const isReviewMode = mode === 'review';
  const isLandlord = user?.id === contract?.landlord_id;

  // Images from camera capture (tenant upload flow)
  let capturedImages: CapturedImage[] = [];
  try {
    capturedImages = params.images ? JSON.parse(params.images as string) : [];
  } catch (e) {}

  // Images from server (landlord review flow)
  const [checkoutImages, setCheckoutImages] = useState<any[]>([]);
  const [checkinImages, setCheckinImages] = useState<any[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareCheckinImage, setCompareCheckinImage] = useState<any>(null);

  // Load server images for review mode
  useEffect(() => {
    if (isReviewMode && contractId) {
      loadImages();
    }
  }, [isReviewMode, contractId]);

  const loadImages = async () => {
    try {
      const [checkoutResp, checkinResp] = await Promise.all([
        contractsService.getInspectionImages(contractId, 'checkout'),
        contractsService.getInspectionImages(contractId, 'checkin'),
      ]);
      setCheckoutImages(checkoutResp.images);
      setCheckinImages(checkinResp.images);
    } catch (err) {
      setError('Učitavanje slika nije uspelo');
    }
  };

  const displayImages = isReviewMode ? checkoutImages : capturedImages;

  // Tenant: upload captured images
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
        'checkout',
        uploadedImages as any
      );

      setInspection(contractId, { contractId, inspectionType: 'checkout', images: uploadedImages as any, roomId: null, isLoading: false });

      Alert.alert('Uspeh', 'Check-out slike su uspešno otpremljene!', [
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

  // Landlord: approve check-out → triggers analysis
  const handleApprove = async () => {
    Alert.alert(
      'Odobri check-out',
      'Da li ste sigurni? Odobravanjem check-out-a pokreće se AI analiza poređenja slika.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Odobri',
          onPress: async () => {
            setApproving(true);
            try {
              if (contract) {
                setSelectedContract({ ...contract, status: 'pending_analysis' as any });
              }
              Alert.alert('Uspeh', 'Check-out je odobren. AI analiza je pokrenuta.', [
                {
                  text: 'OK',
                  onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contractId } }),
                },
              ]);
            } catch (err) {
              Alert.alert('Greška', 'Odobravanje check-out-a nije uspelo');
            } finally {
              setApproving(false);
            }
          },
        },
      ]
    );
  };

  // Landlord: reject check-out
  const handleReject = async () => {
    if (!rejectComment.trim()) {
      setError('Morate uneti razlog odbijanja');
      return;
    }

    setRejecting(true);
    try {
      if (contract) {
        setSelectedContract({ ...contract, status: 'checkout_rejected' as any, rejection_comment: rejectComment });
      }
      setShowRejectModal(false);
      Alert.alert('Odbijeno', 'Check-out je odbijen. Zakupac će biti obavešten.', [
        {
          text: 'OK',
          onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contractId } }),
        },
      ]);
    } catch (err) {
      Alert.alert('Greška', 'Odbijanje check-out-a nije uspelo');
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

  const selectedImage = selectedImageIndex !== null ? displayImages[selectedImageIndex] : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>
            {isReviewMode ? 'Pregled check-out slika' : 'Check-out slike'}
          </Text>
          <Text style={[styles.subtitle, Typography.bodySmall]}>
            {displayImages.length} fotografija{isReviewMode ? ' - pregledajte i odobrite ili odbijte' : ' snimljeno'}
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
                Check-out slika {selectedImageIndex! + 1}
              </Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, Typography.captionSmall]}>Snimljeno:</Text>
                <Text style={[styles.infoValue, Typography.captionSmall]}>
                  {new Date(selectedImage.timestamp || selectedImage.captured_at).toLocaleString()}
                </Text>
              </View>
              {(selectedImage.note) && (
                <View style={styles.noteContainer}>
                  <Text style={[styles.noteText, Typography.body]}>{selectedImage.note}</Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Checkout Image Grid */}
        <Card style={styles.thumbnailsCard}>
          <Text style={[Typography.heading4, styles.thumbnailsTitle]}>Check-out fotografije</Text>
          <FlatList
            data={displayImages}
            renderItem={renderImageItem}
            keyExtractor={(_, index) => `checkout-${index}`}
            numColumns={4}
            scrollEnabled={false}
            columnWrapperStyle={styles.thumbnailsRow}
            contentContainerStyle={styles.thumbnailsList}
          />
        </Card>

        {/* Check-in Reference (review mode) */}
        {isReviewMode && checkinImages.length > 0 && (
          <Card style={styles.referenceCard}>
            <Text style={[Typography.heading4, styles.referenceTitle]}>
              Check-in referentne slike
            </Text>
            <Text style={[Typography.captionSmall, styles.referenceSubtitle]}>
              Uporedite sa check-out slikama iznad
            </Text>
            <FlatList
              data={checkinImages}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.referenceThumb}
                  onPress={() => {
                    setCompareCheckinImage(item);
                    setShowCompareModal(true);
                  }}
                >
                  <Image source={{ uri: item.image_url }} style={styles.referenceThumbImage} />
                </TouchableOpacity>
              )}
              keyExtractor={(_, index) => `checkin-ref-${index}`}
              numColumns={4}
              scrollEnabled={false}
              columnWrapperStyle={styles.thumbnailsRow}
              contentContainerStyle={styles.thumbnailsList}
            />
          </Card>
        )}

        {/* Upload Progress */}
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
              <Button
                label="Odobri check-out"
                onPress={handleApprove}
                loading={approving}
                disabled={approving || rejecting}
                fullWidth
              />
              <Button
                label="Odbij check-out"
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
              <Button
                label={uploading ? 'Otpremanje...' : `Otpremi ${displayImages.length} slika`}
                onPress={handleUploadImages}
                disabled={uploading || displayImages.length === 0}
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
            <Text style={[styles.modalTitle, Typography.heading3]}>Odbij check-out</Text>
            <Text style={[styles.modalSubtitle, Typography.bodySmall]}>
              Navedite razlog odbijanja. Zakupac će morati ponovo da fotografiše nekretninu.
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

      {/* Compare Check-in Image Modal */}
      <Modal visible={showCompareModal} animationType="fade" transparent>
        <View style={styles.compareModalContainer}>
          <TouchableOpacity
            style={styles.compareBackdrop}
            onPress={() => setShowCompareModal(false)}
          />
          <View style={styles.compareContent}>
            {compareCheckinImage && (
              <>
                <Image
                  source={{ uri: compareCheckinImage.image_url }}
                  style={styles.compareImage}
                />
                <Text style={[Typography.heading4, styles.compareLabel]}>
                  Check-in referentna slika
                </Text>
                <Button
                  label="Zatvori"
                  onPress={() => setShowCompareModal(false)}
                  style={styles.compareButton}
                />
              </>
            )}
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
  referenceCard: {
    marginBottom: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.info,
  },
  referenceTitle: {
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  referenceSubtitle: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  referenceThumb: {
    width: '23%',
    aspectRatio: 1,
    marginRight: Spacing.xs,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundSecondary,
  },
  referenceThumbImage: {
    width: '100%',
    height: '100%',
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
  compareModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  compareContent: {
    alignItems: 'center',
    padding: Spacing.md,
    zIndex: 1,
  },
  compareImage: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').width * 0.9,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  compareLabel: {
    color: Colors.white,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  compareButton: {
    width: 200,
  },
});
