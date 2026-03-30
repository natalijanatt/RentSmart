import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useContractsStore } from '../../store/contractsStore';
import { contractsService } from '../../services';
import { Button, InputField, Card, Badge, Divider, ErrorMessage, LoadingOverlay } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function NewContractScreen() {
  const { user } = useAuthStore();
  const { addContract } = useContractsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    property_address: '',
    rent_monthly_eur: '',
    deposit_amount_eur: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  const [rooms, setRooms] = useState([
    { room_type: 'dnevna_soba', custom_name: '', is_mandatory: true },
    { room_type: 'spavaca_soba', custom_name: '', is_mandatory: true },
    { room_type: 'kupatilo', custom_name: '', is_mandatory: true },
    { room_type: 'kuhinja', custom_name: '', is_mandatory: true },
  ]);

  const handleCreateContract = async () => {
    if (!user) {
      setError('User not logged in');
      return;
    }

    if (!formData.property_address || !formData.rent_monthly_eur || !formData.deposit_amount_eur) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await contractsService.createContract(user.id, {
        property_address: formData.property_address,
        rent_monthly_eur: parseFloat(formData.rent_monthly_eur),
        deposit_amount_eur: parseFloat(formData.deposit_amount_eur),
        start_date: formData.start_date || new Date().toISOString(),
        end_date: formData.end_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        notes: formData.notes || undefined,
        rooms: rooms.map((r) => ({
          room_type: r.room_type as any,
          custom_name: r.custom_name || undefined,
          is_mandatory: r.is_mandatory,
        })),
      });

      addContract(response.contract);
      Alert.alert('Success', 'Contract created! Invite code: ' + response.contract.invite_code);
      router.push({ pathname: '/contract/[id]', params: { id: response.contract.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create contract');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, Typography.heading2]}>Create Contract</Text>
        </View>

        {error && <ErrorMessage message={error} />}

        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Property Details</Text>
          <Divider />

          <InputField
            label="Property Address"
            placeholder="e.g., Kneza Milo�a 1, Beograd"
            value={formData.property_address}
            onChangeText={(text) => setFormData({ ...formData, property_address: text })}
            editable={!loading}
          />

          <InputField
            label="Monthly Rent (EUR)"
            placeholder="500"
            value={formData.rent_monthly_eur}
            onChangeText={(text) => setFormData({ ...formData, rent_monthly_eur: text })}
            keyboardType="decimal-pad"
            editable={!loading}
          />

          <InputField
            label="Deposit Amount (EUR)"
            placeholder="1000"
            value={formData.deposit_amount_eur}
            onChangeText={(text) => setFormData({ ...formData, deposit_amount_eur: text })}
            keyboardType="decimal-pad"
            editable={!loading}
          />

          <InputField
            label="Start Date"
            placeholder="YYYY-MM-DD"
            value={formData.start_date}
            onChangeText={(text) => setFormData({ ...formData, start_date: text })}
            editable={!loading}
          />

          <InputField
            label="End Date"
            placeholder="YYYY-MM-DD"
            value={formData.end_date}
            onChangeText={(text) => setFormData({ ...formData, end_date: text })}
            editable={!loading}
          />

          <InputField
            label="Additional Notes"
            placeholder="Contract-specific notes"
            value={formData.notes}
            onChangeText={(text) => setFormData({ ...formData, notes: text })}
            multiline
            numberOfLines={3}
            editable={!loading}
          />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Rooms</Text>
          <Divider />
          {rooms.map((room, index) => (
            <View key={index}>
              <View style={styles.roomItem}>
                <View style={styles.roomInfo}>
                  <Text style={[styles.roomType, Typography.body]}>{room.room_type.replace(/_/g, ' ')}</Text>
                  {room.is_mandatory && <Badge label="Mandatory" variant="primary" size="small" />}
                </View>
              </View>
              {index < rooms.length - 1 && <Divider />}
            </View>
          ))}
        </Card>

        <View style={styles.actions}>
          <Button label="Create Contract" onPress={handleCreateContract} loading={loading} fullWidth />
          <Button label="Cancel" onPress={() => router.push('/')} variant="outline" fullWidth disabled={loading} style={styles.cancelButton} />
        </View>
      </ScrollView>

      <LoadingOverlay visible={loading} message="Creating contract..." />
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
  },
  header: {
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.text,
    textAlign: 'center',
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  roomItem: {
    paddingVertical: Spacing.sm,
  },
  roomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomType: {
    color: Colors.text,
    textTransform: 'capitalize',
  },
  actions: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  cancelButton: {
    marginTop: Spacing.sm,
  },
});
