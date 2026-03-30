import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Image,
  Alert,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useContractsStore } from '../../../store/contractsStore';
import { contractsService } from '../../../services';
import { Button, Card, ProgressBar, ErrorMessage } from '../../../components';
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

interface CheckinImage {
  uri: string;
  room: string;
}

export default function CheckoutReviewScreen() {
  const params = useLocalSearchParams();
  const contractId = params.contractId as string;
  
  let checkoutImages: CapturedImage[] = [];
  let checkinImages: CheckinImage[] = [];
  
  try {
    checkoutImages = params.images ? JSON.parse(params.images as string) : [];
    checkinImages = params.checkinImages ? JSON.parse(params.checkinImages as string) : [];
  } catch (e) {
    console.error('Failed to parse images:', e);
  }

  const { setInspection } = useContractsStore();
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [selectedCheckinImage, setSelectedCheckinImage] = useState<CheckinImage | null>(null);

  const handleUploadImages = async () => {
    if (checkoutImages.length === 0) {
      setError('No images to upload');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    try {
      // Upload each image
      const uploadPromises = checkoutImages.map(async (image, index) => {
        const fileContent = await FileSystem.readAsStringAsync(image.uri, {
          encoding: 'base64',
        });

        // Simulate upload progress
        setUploadProgress(Math.round(((index + 1) / checkoutImages.length) * 100));

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

      // Call backend to save inspection
      await contractsService.uploadInspectionImages(
        contractId,
        'dummy-room-id',
        'checkout',
        uploadedImages as any
      );

      setInspection(contractId, { contractId, inspectionType: 'checkout', images: uploadedImages as any, roomId: null, isLoading: false });

      Alert.alert('Success', 'Checkout photos uploaded successfully!', [
        {
          text: 'View Contract',
          onPress: () => router.replace({ pathname: '/contract/[id]', params: { id: contractId } }),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload images');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const renderImageItem = ({ item, index }: { item: CapturedImage; index: number }) => (
    <TouchableOpacity
      style={[
        styles.imageThumb,
        selectedImageIndex === index && styles.imageThumbSelected,
      ]}
      onPress={() => setSelectedImageIndex(index)}
    >
      <Image source={{ uri: item.uri }} style={styles.imageThumbImage} />
      <View style={styles.imageCounter}>
        <Text style={styles.imageCounterText}>{index + 1}</Text>
      </View>
    </TouchableOpacity>
  );

  const selectedImage = selectedImageIndex !== null ? checkoutImages[selectedImageIndex] : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>Review Check-out Images</Text>
          <Text style={[styles.subtitle, Typography.bodySmall]}>
            {checkoutImages.length} photos captured
          </Text>
        </View>

        {error && <ErrorMessage message={error} />}

        {/* Checkout Images Section */}
        {/* Large Image Preview */}
        {selectedImage && (
          <Card style={styles.previewCard}>
            <Image source={{ uri: selectedImage.uri }} style={styles.largeImage} />
            <View style={styles.imageInfoContainer}>
              <Text style={[styles.imageLabel, Typography.bodySemibold]}>
                Checkout Image {selectedImageIndex! + 1} Details
              </Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, Typography.captionSmall]}>Captured:</Text>
                <Text style={[styles.infoValue, Typography.captionSmall]}>
                  {new Date(selectedImage.timestamp).toLocaleString()}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, Typography.captionSmall]}>GPS:</Text>
                <Text style={[styles.infoValue, Typography.captionSmall]}>
                  {selectedImage.latitude.toFixed(4)}, {selectedImage.longitude.toFixed(4)}
                </Text>
              </View>
              {selectedImage.note && (
                <View style={styles.noteContainer}>
                  <Text style={[styles.infoLabel, Typography.captionSmall]}>Note:</Text>
                  <Text style={[styles.noteText, Typography.body]}>{selectedImage.note}</Text>
                </View>
              )}
            </View>
          </Card>
        )}

        {/* Image Thumbnails */}
        <Card style={styles.thumbnailsCard}>
          <Text style={[Typography.heading4, styles.thumbnailsTitle]}>Checkout Photos</Text>
          <FlatList
            data={checkoutImages}
            renderItem={renderImageItem}
            keyExtractor={(_, index) => `checkout-${index}`}
            numColumns={4}
            scrollEnabled={false}
            columnWrapperStyle={styles.thumbnailsRow}
            contentContainerStyle={styles.thumbnailsList}
          />
        </Card>

        {/* Checkin Images Reference */}
        {checkinImages.length > 0 && (
          <Card style={styles.referenceCard}>
            <Text style={[Typography.heading4, styles.referenceTitle]}>
              Check-in Reference Photos
            </Text>
            <Text style={[Typography.captionSmall, styles.referenceSubtitle]}>
              Tap to see original check-in photos for comparison
            </Text>
            <FlatList
              data={checkinImages}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={styles.referenceThumb}
                  onPress={() => {
                    setSelectedCheckinImage(item);
                    setShowCheckinModal(true);
                  }}
                >
                  <Image source={{ uri: item.uri }} style={styles.referenceThumbImage} />
                  <Text style={styles.referenceThumbLabel}>{item.room}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={(_, index) => `checkin-${index}`}
              numColumns={3}
              scrollEnabled={false}
              columnWrapperStyle={styles.referenceRow}
              contentContainerStyle={styles.referenceList}
            />
          </Card>
        )}

        {/* Upload Progress */}
        {uploading && (
          <Card style={styles.progressCard}>
            <Text style={[Typography.bodySemibold, styles.progressText]}>
              Uploading... {uploadProgress}%
            </Text>
            <ProgressBar progress={uploadProgress / 100} style={styles.progressBar} />
          </Card>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonsContainer}>
          <Button
            label={uploading ? 'Uploading...' : `Upload ${checkoutImages.length} Images`}
            onPress={handleUploadImages}
            disabled={uploading || checkoutImages.length === 0}
            loading={uploading}
          />
          <Button
            label={uploading ? 'Uploading...' : 'Re-take Photos'}
            variant="outline"
            onPress={() => router.back()}
            disabled={uploading}
            style={styles.secondaryButton}
          />
        </View>
      </ScrollView>

      {/* Checkin Image Modal */}
      <Modal visible={showCheckinModal} animationType="fade" transparent>
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setShowCheckinModal(false)}
          />
          <View style={styles.modalContent}>
            {selectedCheckinImage && (
              <>
                <Image
                  source={{ uri: selectedCheckinImage.uri }}
                  style={styles.modalImage}
                />
                <Text style={[Typography.heading4, styles.modalImageLabel]}>
                  Check-in: {selectedCheckinImage.room}
                </Text>
                <Button
                  label="Close"
                  onPress={() => setShowCheckinModal(false)}
                  style={styles.modalButton}
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
  },
  title: {
    color: Colors.text,
    marginBottom: Spacing.sm,
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
  referenceCard: {
    marginBottom: Spacing.md,
  },
  referenceTitle: {
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  referenceSubtitle: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  referenceList: {
    paddingHorizontal: 0,
  },
  referenceRow: {
    justifyContent: 'flex-start',
    marginBottom: Spacing.md,
  },
  referenceThumb: {
    width: '31%',
    aspectRatio: 1,
    marginRight: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.backgroundSecondary,
  },
  referenceThumbImage: {
    width: '100%',
    height: '85%',
  },
  referenceThumbLabel: {
    height: '15%',
    color: Colors.textSecondary,
    fontSize: 10,
    padding: 4,
    textAlign: 'center',
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
  },
  secondaryButton: {
    marginTop: Spacing.sm,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    alignItems: 'center',
    padding: Spacing.md,
    zIndex: 1,
  },
  modalImage: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').width * 0.9,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  modalImageLabel: {
    color: Colors.white,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  modalButton: {
    width: 200,
  },
});
