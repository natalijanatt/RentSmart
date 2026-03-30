import React, { useState } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { useContractsStore } from '../../store/contractsStore';
import { contractsService } from '../../services';
import { Button, InputField, Card, Divider, ErrorMessage, LoadingOverlay } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';

export default function AddPropertyScreen() {
  const { user } = useAuthStore();
  const { addContract } = useContractsStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    property_address: '',
    city: '',
    postal_code: '',
    property_type: '',
    area_m2: '',
    rooms: '',
    monthly_rent_eur: '',
    deposit_amount_eur: '',
    description: '',
  });

  const handleSaveProperty = async () => {
    if (!user) {
      setError('Please login first.');
      return;
    }

    if (!formData.title || !formData.property_address || !formData.monthly_rent_eur || !formData.deposit_amount_eur) {
      setError('Please fill the required fields: title, address, monthly rent, deposit.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await contractsService.createContract(user.id, {
        property_address: formData.property_address,
        rent_monthly_eur: parseFloat(formData.monthly_rent_eur),
        deposit_amount_eur: parseFloat(formData.deposit_amount_eur),
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        notes: `Type: ${formData.property_type || 'N/A'}; city: ${formData.city}; postal: ${formData.postal_code}; area: ${formData.area_m2}; rooms: ${formData.rooms}. ${formData.description}`,
        rooms: [],
      });

      addContract(response.contract);
      Alert.alert('Success', 'Property saved as a draft contract.');
      router.push(`/contract/${response.contract.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save property');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, Typography.heading2]}>Dodaj novu nekretninu</Text>

        {error && <ErrorMessage message={error} />}

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, Typography.heading4]}>Lokacija</Text>
          <Divider />
          <InputField label="Naslov" value={formData.title} onChangeText={(text) => setFormData({ ...formData, title: text })} editable={!loading} />
          <InputField label="Adresa" value={formData.property_address} onChangeText={(text) => setFormData({ ...formData, property_address: text })} editable={!loading} />
          <InputField label="Grad" value={formData.city} onChangeText={(text) => setFormData({ ...formData, city: text })} editable={!loading} />
          <InputField label="Poštanski broj" value={formData.postal_code} onChangeText={(text) => setFormData({ ...formData, postal_code: text })} editable={!loading} keyboardType="number-pad" />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, Typography.heading4]}>Detalji</Text>
          <Divider />
          <InputField label="Tip" placeholder="stan/kuća" value={formData.property_type} onChangeText={(text) => setFormData({ ...formData, property_type: text })} editable={!loading} />
          <InputField label="Kvadratura (m²)" value={formData.area_m2} onChangeText={(text) => setFormData({ ...formData, area_m2: text })} keyboardType="decimal-pad" editable={!loading} />
          <InputField label="Broj soba" value={formData.rooms} onChangeText={(text) => setFormData({ ...formData, rooms: text })} keyboardType="number-pad" editable={!loading} />
          <InputField label="Mjesečni zakup (EUR)" value={formData.monthly_rent_eur} onChangeText={(text) => setFormData({ ...formData, monthly_rent_eur: text })} keyboardType="decimal-pad" editable={!loading} />
          <InputField label="Depozit (EUR)" value={formData.deposit_amount_eur} onChangeText={(text) => setFormData({ ...formData, deposit_amount_eur: text })} keyboardType="decimal-pad" editable={!loading} />
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.sectionTitle, Typography.heading4]}>Opis</Text>
          <Divider />
          <InputField label="Opis nekretnine" placeholder="Unesite dodatne detalje..." value={formData.description} onChangeText={(text) => setFormData({ ...formData, description: text })} multiline numberOfLines={4} editable={!loading} />
        </Card>

        <View style={styles.actions}>
          <Button label="Spremi nekretninu" onPress={handleSaveProperty} fullWidth loading={loading} />
          <Button label="Natrag" onPress={() => router.back()} variant="outline" fullWidth disabled={loading} style={styles.cancelButton} />
        </View>
      </ScrollView>
      <LoadingOverlay visible={loading} message="Spremanje..." />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md },
  title: { color: Colors.text, marginBottom: Spacing.lg, textAlign: 'center' },
  card: { marginBottom: Spacing.md },
  sectionTitle: { color: Colors.text, marginBottom: Spacing.sm },
  actions: { marginTop: Spacing.xl, gap: Spacing.md },
  cancelButton: { marginTop: Spacing.sm },
});