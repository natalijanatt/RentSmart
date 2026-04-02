import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  FlatList,
  Image,
  Alert,
  TextInput,
  Modal,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { InspectionImage } from '@rentsmart/contracts';
import { useContractsStore } from '../../../store/contractsStore';
import { contractsService } from '../../../services';
import { Button, Card, Divider, LoadingSpinner, ConfirmModal } from '../../../components';
import { Colors, Spacing, Typography } from '../../../constants/theme';
import { formatDate } from '../../../utils/formatters';

export default function ReviewImagesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedContract, setSelectedContract } = useContractsStore();

  const [images, setImages] = useState<InspectionImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [approveModalVisible, setApproveModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const contract = selectedContract;
  // Determine inspection type from contract status
  const inspectionType = contract?.status === 'checkout_pending_approval' ? 'checkout' : 'checkin';

  useEffect(() => {
    const load = async () => {
      try {
        if (!contract) {
          const res = await contractsService.getContract(id);
          setSelectedContract(res.contract);
        }
        const res = await contractsService.getInspectionImages(id, inspectionType);
        setImages(res.images);
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.error ?? err?.message ?? 'Failed to load images');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  // Group images by room_id
  const imagesByRoom = images.reduce<Record<string, InspectionImage[]>>((acc, img) => {
    if (!acc[img.room_id]) acc[img.room_id] = [];
    acc[img.room_id].push(img);
    return acc;
  }, {});

  const rooms = contract?.rooms ?? [];

  const handleApproveConfirm = async () => {
    setApproveModalVisible(false);
    setSubmitting(true);
    try {
      const res = inspectionType === 'checkin'
        ? await contractsService.approveCheckin(id)
        : await contractsService.approveCheckout(id);
      setSelectedContract(res.contract);
      router.replace(`/contract/${id}`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? err?.message ?? 'Failed to approve');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectComment.trim()) {
      Alert.alert('Required', 'Please enter a reason for rejection.');
      return;
    }
    setSubmitting(true);
    setRejectModalVisible(false);
    try {
      const res = inspectionType === 'checkin'
        ? await contractsService.rejectCheckin(id, rejectComment.trim())
        : await contractsService.rejectCheckout(id, rejectComment.trim());
      setSelectedContract(res.contract);
      router.replace(`/contract/${id}`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? err?.message ?? 'Failed to reject');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

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

        <Text style={[styles.title, Typography.heading2]}>
          {inspectionType === 'checkin' ? 'Review Check-in' : 'Review Check-out'}
        </Text>
        <Text style={[styles.subtitle, Typography.bodySmall]}>
          {images.length} photo{images.length !== 1 ? 's' : ''} across {Object.keys(imagesByRoom).length} room{Object.keys(imagesByRoom).length !== 1 ? 's' : ''}
        </Text>

        {rooms
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((room) => {
            const roomImgs = imagesByRoom[room.id] ?? [];
            if (roomImgs.length === 0) return null;
            return (
              <Card key={room.id} style={styles.card}>
                <Text style={[styles.roomName, Typography.heading4]}>
                  {room.custom_name || room.room_type.replace(/_/g, ' ')}
                </Text>
                <Text style={[styles.roomCount, Typography.caption]}>
                  {roomImgs.length} photo{roomImgs.length !== 1 ? 's' : ''}
                </Text>
                <Divider />
                <FlatList
                  data={roomImgs}
                  horizontal
                  keyExtractor={(item) => item.id}
                  scrollEnabled
                  renderItem={({ item }) => (
                    <TouchableOpacity onPress={() => setLightboxUri(item.image_url)}>
                      <View style={styles.imageContainer}>
                        <Image source={{ uri: item.image_url }} style={styles.image} />
                        <Text style={[styles.imageMeta, Typography.caption]}>
                          {formatDate(item.captured_at)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={styles.imageList}
                />
              </Card>
            );
          })}

        {/* Images for rooms not in contract.rooms (fallback) */}
        {Object.entries(imagesByRoom)
          .filter(([roomId]) => !rooms.find((r) => r.id === roomId))
          .map(([roomId, roomImgs]) => (
            <Card key={roomId} style={styles.card}>
              <Text style={[styles.roomName, Typography.heading4]}>Room</Text>
              <Divider />
              <FlatList
                data={roomImgs}
                horizontal
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => setLightboxUri(item.image_url)}>
                    <View style={styles.imageContainer}>
                      <Image source={{ uri: item.image_url }} style={styles.image} />
                    </View>
                  </TouchableOpacity>
                )}
                contentContainerStyle={styles.imageList}
              />
            </Card>
          ))}

        <View style={styles.actions}>
          <Button
            label="Approve"
            onPress={() => setApproveModalVisible(true)}
            fullWidth
            disabled={submitting || images.length === 0}
            style={styles.actionButton}
          />
          <Button
            label="Reject"
            onPress={() => setRejectModalVisible(true)}
            variant="outline"
            fullWidth
            disabled={submitting}
          />
        </View>
      </ScrollView>

      {/* Lightbox */}
      <Modal visible={!!lightboxUri} transparent animationType="fade" statusBarTranslucent>
        <StatusBar hidden />
        <TouchableOpacity style={styles.lightboxOverlay} activeOpacity={1} onPress={() => setLightboxUri(null)}>
          <Image source={{ uri: lightboxUri ?? '' }} style={styles.lightboxImage} resizeMode="contain" />
          <Text style={styles.lightboxHint}>Tap to close</Text>
        </TouchableOpacity>
      </Modal>

      {/* Approve modal */}
      <ConfirmModal
        visible={approveModalVisible}
        title={inspectionType === 'checkin' ? 'Approve check-in' : 'Approve check-out'}
        message={`This will mark the ${inspectionType === 'checkin' ? 'check-in' : 'check-out'} as approved.`}
        confirmLabel="Approve"
        onConfirm={handleApproveConfirm}
        onCancel={() => setApproveModalVisible(false)}
      />

      {/* Reject modal */}
      <Modal visible={rejectModalVisible} transparent animationType="slide" statusBarTranslucent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setRejectModalVisible(false); setRejectComment(''); }}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <Text style={[styles.modalTitle, Typography.heading3]}>
                {inspectionType === 'checkin' ? 'Reject Check-in' : 'Reject Check-out'}
              </Text>
              <Text style={[styles.modalSubtitle, Typography.body]}>
                {inspectionType === 'checkin'
                  ? 'Provide a reason so the landlord knows what to fix.'
                  : 'Provide a reason so the tenant knows what to fix.'}
              </Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Missing photos for kitchen, images blurry..."
                placeholderTextColor={Colors.textTertiary}
                value={rejectComment}
                onChangeText={setRejectComment}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
              <Text style={[styles.charCount, Typography.caption]}>
                {rejectComment.length}/500
              </Text>
              <Button
                label="Submit Rejection"
                onPress={handleRejectSubmit}
                variant="danger"
                fullWidth
                style={styles.actionButton}
              />
              <Button
                label="Cancel"
                onPress={() => { setRejectModalVisible(false); setRejectComment(''); }}
                variant="outline"
                fullWidth
              />
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.lg },
  title: { color: Colors.text, textAlign: 'center', marginBottom: Spacing.sm },
  subtitle: { color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  card: { marginBottom: Spacing.lg, padding: Spacing.md },
  roomName: { color: Colors.text, textTransform: 'capitalize', marginBottom: Spacing.xs },
  roomCount: { color: Colors.textSecondary, marginBottom: Spacing.sm },
  imageList: { paddingVertical: Spacing.md },
  imageContainer: { marginRight: Spacing.md },
  image: { width: 160, height: 120, borderRadius: 8, backgroundColor: Colors.surface },
  imageMeta: { color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
  actions: { marginTop: Spacing.lg },
  actionButton: { marginBottom: Spacing.md },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: { color: Colors.text, marginBottom: Spacing.sm },
  modalSubtitle: { color: Colors.textSecondary, marginBottom: Spacing.lg },
  textInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    color: Colors.text,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: Spacing.xs,
  },
  charCount: { color: Colors.textTertiary, textAlign: 'right', marginBottom: Spacing.lg },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '90%',
  },
  lightboxHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: Spacing.md,
  },
});
