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
      <Stack.Screen name="[id]/index" />
      <Stack.Screen name="[id]/checkin" />
      <Stack.Screen name="[id]/checkout" />
      <Stack.Screen name="[id]/review-images" />
      <Stack.Screen name="[id]/settlement" />
      <Stack.Screen name="[id]/audit" />
    </Stack>
  );
}
