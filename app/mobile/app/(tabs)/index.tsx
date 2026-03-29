import { StyleSheet } from 'react-native';
import { contractStatusSchema, type Contract, type ContractStatus, type Settlement } from '@rentsmart/contracts';

import EditScreenInfo from '@/components/EditScreenInfo';
import { Text, View } from '@/components/Themed';

const demoStatus: ContractStatus = contractStatusSchema.parse('settlement');

const demoContract: Pick<Contract, 'property_address' | 'status' | 'deposit_amount_eur'> = {
  property_address: 'Bulevar Kralja Aleksandra 73, Beograd',
  status: demoStatus,
  deposit_amount_eur: 800,
};

const demoSettlement: Pick<
  Settlement,
  'tenant_receives_eur' | 'landlord_receives_eur' | 'landlord_approved_at' | 'tenant_approved_at'
> = {
  tenant_receives_eur: 616,
  landlord_receives_eur: 184,
  landlord_approved_at: null,
  tenant_approved_at: '2026-03-29T10:00:00.000Z',
};

export default function TabOneScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>RentSmart Contract Demo</Text>
      <Text style={styles.copy}>{demoContract.property_address}</Text>
      <Text style={styles.copy}>Status: {demoContract.status}</Text>
      <Text style={styles.copy}>Deposit: {demoContract.deposit_amount_eur} EUR</Text>
      <Text style={styles.copy}>
        Split: tenant {demoSettlement.tenant_receives_eur} EUR / landlord {demoSettlement.landlord_receives_eur} EUR
      </Text>
      <Text style={styles.copy}>
        Approvals: tenant {demoSettlement.tenant_approved_at ? 'done' : 'pending'} / landlord{' '}
        {demoSettlement.landlord_approved_at ? 'done' : 'pending'}
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <EditScreenInfo path="app/(tabs)/index.tsx" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  copy: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
