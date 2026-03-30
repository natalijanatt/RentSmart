import React, { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import * as Linking from 'expo-linking';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../constants/theme';

SplashScreen.preventAutoHideAsync();

const prefix = Linking.createURL('/');

export const linking = {
  prefixes: [prefix, 'rentsmart://', 'https://rentsmart.app/'],
  config: {
    screens: {
      invite: 'invite/:code',
      contract: 'contract/:id',
      '(auth)': {
        screens: {
          login: 'login',
          register: 'register',
        },
      },
      '(tabs)': {
        screens: {
          index: '',
          profile: 'profile',
          'new-contract': 'new-contract',
        },
      },
    },
  },
};

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = React.useState(false);
  const { user } = useAuthStore();
  const segments = useSegments();

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
        });
        setFontsLoaded(true);
      } catch (e) {
        console.warn(e);
      } finally {
        SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      if (user) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [fontsLoaded, user]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="contract" options={{ headerShown: false }} />
      <Stack.Screen name="invite/[code]" options={{ headerShown: false }} />
    </Stack>
  );
}
