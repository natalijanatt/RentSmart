import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Contract } from '@rentsmart/contracts';
import { useContractsStore } from '../../store/contractsStore';
import { contractsService } from '../../services';
import { Button, Card, Badge, Divider, LoadingSpinner } from '../../components';
import { Colors, Spacing, Typography } from '../../constants/theme';
import { formatCurrency, formatDate, getContractStatusLabel } from '../../utils/formatters';
import { shortenAddress } from '../../utils/solana';

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { addContract } = useContractsStore();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [depositTx, setDepositTx] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    contractsService.getContractByInviteCode(code)
      .then((res) => setContract(res.contract))
      .catch(() => Alert.alert('Error', 'Invalid or expired invite code', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]))
      .finally(() => setLoadingPreview(false));
  }, [code]);

  const handleAccept = async () => {
    if (!contract) return;
    setAccepting(true);
    try {
      const res = await contractsService.acceptContract(contract.id, code as string);
      addContract(res.contract);
      setDepositTx(res.solana_lock_deposit_tx);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to accept contract');
      setAccepting(false);
    }
  };

  const handleContinueAfterAccept = () => {
    if (!contract) return;
    router.replace(`/contract/${contract.id}`);
  };

  const handleDecline = () => {
    router.replace('/(tabs)');
  };

  if (loadingPreview) {
    return <LoadingSpinner />;
  }

  if (!contract) return null;

  if (depositTx) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.heading, Typography.heading2]}>Contract Accepted</Text>
          <Text style={[styles.subheading, Typography.body]}>
            Your deposit lock transaction has been prepared on Solana Devnet.
          </Text>

          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Deposit Lock Transaction</Text>
            <Divider />
            <Text style={[styles.label, Typography.caption]}>Transaction payload</Text>
            <Text style={[styles.txValue, Typography.caption]}>
              {shortenAddress(depositTx, 8)}
            </Text>
            <Text style={[styles.txNote, Typography.caption]}>
              In a production deployment this transaction would be signed by your Solana wallet to lock the deposit on-chain.
            </Text>
          </Card>

          <Button
            label="Continue to Contract"
            onPress={handleContinueAfterAccept}
            fullWidth
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, Typography.heading2]}>Contract Invite</Text>
        <Text style={[styles.subheading, Typography.body]}>
          Review the contract before accepting.
        </Text>

        <Card style={styles.card}>
          <Text style={[styles.address, Typography.heading3]}>{contract.property_address}</Text>
          <Badge label={getContractStatusLabel(contract.status)} variant="info" />
          <Text style={[styles.period, Typography.body]}>
            {formatDate(contract.start_date)} — {formatDate(contract.end_date)}
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={[styles.cardTitle, Typography.heading4]}>Financial Terms</Text>
          <Divider />
          <View style={styles.row}>
            <Text style={[styles.label, Typography.body]}>Monthly Rent</Text>
            <Text style={[styles.value, Typography.heading4]}>{formatCurrency(contract.rent_monthly_eur)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, Typography.body]}>Deposit</Text>
            <Text style={[styles.value, Typography.heading4]}>{formatCurrency(contract.deposit_amount_eur)}</Text>
          </View>
        </Card>

        {contract.deposit_rules && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Deposit Rules</Text>
            <Divider />
            <Text style={[styles.label, Typography.body]}>{contract.deposit_rules}</Text>
          </Card>
        )}

        {contract.notes && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Notes</Text>
            <Divider />
            <Text style={[styles.label, Typography.body]}>{contract.notes}</Text>
          </Card>
        )}

        {contract.rooms && contract.rooms.length > 0 && (
          <Card style={styles.card}>
            <Text style={[styles.cardTitle, Typography.heading4]}>Rooms</Text>
            <Divider />
            {contract.rooms.map((room) => (
              <View key={room.id} style={styles.row}>
                <Text style={[styles.label, Typography.body]}>
                  {room.custom_name || room.room_type.replace(/_/g, ' ')}
                </Text>
                {room.is_mandatory && <Badge label="Mandatory" variant="primary" size="small" />}
              </View>
            ))}
          </Card>
        )}

        <View style={styles.actions}>
          <Button
            label="Accept Contract"
            onPress={handleAccept}
            loading={accepting}
            fullWidth
            style={styles.actionButton}
          />
          <Button
            label="Decline"
            onPress={handleDecline}
            variant="outline"
            fullWidth
            disabled={accepting}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  heading: {
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subheading: {
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  card: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  address: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  period: {
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  cardTitle: {
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  label: {
    color: Colors.textSecondary,
    flex: 1,
  },
  value: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  actions: {
    marginTop: Spacing.lg,
  },
  actionButton: {
    marginBottom: Spacing.md,
  },
  txValue: {
    color: Colors.primary,
    fontFamily: 'monospace',
    marginVertical: Spacing.sm,
  },
  txNote: {
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
});
