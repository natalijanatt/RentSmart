import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function ContractLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="new" />
      <Stack.Screen name="property" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
