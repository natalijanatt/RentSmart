import { Stack } from 'expo-router';
import { Colors } from '../../../constants/theme';

export default function ContractIdLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="checkin" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="camera" />
      <Stack.Screen name="checkin-review" />
      <Stack.Screen name="checkout-review" />
      <Stack.Screen name="settlement" />
      <Stack.Screen name="audit" />
    </Stack>
  );
}
