import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Button, Card, Badge, LoadingOverlay } from '../../../components';
import { Colors, Spacing, Typography, BorderRadius } from '../../../constants/theme';
import { useLocalSearchParams, router } from 'expo-router';
import { useContractsStore } from '../../../store/contractsStore';

interface Room {
  id: string;
  room_type: string;
  custom_name: string | null;
  is_mandatory: boolean;
}

export default function CheckinScreen() {
  const { id: contractId } = useLocalSearchParams();
  const { contracts } = useContractsStore();
  const [loading, setLoading] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);

  const contract = contracts.find(c => c.id === contractId);

  useEffect(() => {
    if (contract?.rooms) {
      setRooms(contract.rooms);
    }
  }, [contract]);

  const handleStartCheckin = async () => {
    if (!contract) {
      Alert.alert('Error', 'Contract not found');
      return;
    }

    if (contract.status !== 'accepted' && contract.status !== 'checkin_rejected') {
      Alert.alert('Invalid Status', 'Contract must be accepted before check-in');
      return;
    }

    if (rooms.length === 0) {
      Alert.alert('Error', 'No rooms found in contract');
      return;
    }

    // Start with first room
    router.push({
      pathname: '/contract/[id]/camera',
      params: {
        id: contractId as string,
        contractId: contractId as string,
        roomId: rooms[0].id,
        roomName: rooms[0].custom_name || rooms[0].room_type,
        inspectionType: 'checkin',
        currentRoomIndex: 1,
        totalRooms: rooms.length,
      },
    });
  };

  const getRoomLabel = (room: Room): string => {
    return room.custom_name || room.room_type;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>Check-in</Text>
          <Text style={[styles.subtitle, Typography.bodySmall]}>
            Document property condition upon move-in
          </Text>
        </View>

        {contract && (
          <Card style={styles.contractCard}>
            <Text style={[Typography.heading4, styles.contractCardTitle]}>
              {contract.property_address}
            </Text>
            <View style={styles.contractCMetadata}>
              <Badge label={contract.status} variant="info" size="small" />
              <Text style={[Typography.captionSmall, styles.depositText]}>
                Deposit: {contract.deposit_amount_eur}€
              </Text>
            </View>
          </Card>
        )}

        <Card style={styles.instructionCard}>
          <Text style={[Typography.heading4, styles.instructionTitle]}>Instructions</Text>
          <Text style={[Typography.bodySmall, styles.instructionText]}>
            • Take at least 3 photos of each room{'\n'}
            • Ensure good lighting and clear angles{'\n'}
            • Include all walls, floor, and fixtures{'\n'}
            • GPS location will be automatically recorded{'\n'}
            • You can add notes for each photo
          </Text>
        </Card>

        <Card style={styles.roomsCard}>
          <Text style={[Typography.heading4, styles.roomsTitle]}>Rooms to Document</Text>
          <Text style={[Typography.captionSmall, styles.roomsCount]}>
            {rooms.length} room{rooms.length !== 1 ? 's' : ''} - {rooms.filter(r => r.is_mandatory).length} mandatory
          </Text>

          {rooms.map((room, index) => (
            <View key={room.id} style={styles.roomItem}>
              <View style={styles.roomInfo}>
                <Text style={[Typography.body, styles.roomName]}>
                  {getRoomLabel(room)}
                </Text>
                {room.is_mandatory && (
                  <Badge label="Required" variant="error" size="small" />
                )}
              </View>
              <Text style={[Typography.captionSmall, styles.roomIndex]}>
                #{index + 1}
              </Text>
            </View>
          ))}
        </Card>

        <View style={styles.buttonsContainer}>
          <Button
            label="Start Check-in"
            onPress={handleStartCheckin}
            disabled={loading || rooms.length === 0}
            loading={loading}
          />
          <Button
            label="Back"
            variant="outline"
            onPress={() => router.back()}
            disabled={loading}
            style={styles.secondaryButton}
          />
        </View>
      </ScrollView>
      <LoadingOverlay visible={loading} message="Initializing camera..." />
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
  contractCard: {
    marginBottom: Spacing.md,
  },
  contractCardTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  contractCMetadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depositText: {
    color: Colors.textSecondary,
  },
  instructionCard: {
    marginBottom: Spacing.md,
    backgroundColor: Colors.backgroundSecondary,
  },
  instructionTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  instructionText: {
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  roomsCard: {
    marginBottom: Spacing.lg,
  },
  roomsTitle: {
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  roomsCount: {
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  roomItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginVertical: Spacing.xs,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  roomInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  roomName: {
    color: Colors.text,
  },
  roomIndex: {
    color: Colors.textSecondary,
  },
  buttonsContainer: {
    gap: Spacing.md,
  },
  secondaryButton: {
    marginTop: Spacing.sm,
  },
});
