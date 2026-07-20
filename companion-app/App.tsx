/**
 * AAWG Companion — setup, config and diagnostics for the wireless Android Auto
 * dongle. Talks to the dongle's on-board CGI API over its wifi AP.
 *
 * @format
 */

import React from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { RootStackParamList } from './src/nav';
import { colors } from './src/theme/theme';
import { loadDongle, SavedDongle } from './src/onboarding/store';
import OnboardingScreen from './src/screens/OnboardingScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ConfigScreen from './src/screens/ConfigScreen';
import LogsScreen from './src/screens/LogsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function App(): React.JSX.Element {
  const [ready, setReady] = React.useState(false);
  const [saved, setSaved] = React.useState<SavedDongle | null>(null);

  React.useEffect(() => {
    loadDongle()
      .then(setSaved)
      .finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.card} />
      {!ready ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            initialRouteName={saved ? 'Dashboard' : 'Onboarding'}
            screenOptions={{
              headerStyle: { backgroundColor: colors.card },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ title: 'Set up dongle' }}
            />
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ title: 'AA Dongle' }}
              initialParams={saved ? { dongle: saved } : undefined}
            />
            <Stack.Screen name="Config" component={ConfigScreen} options={{ title: 'Settings' }} />
            <Stack.Screen name="Logs" component={LogsScreen} options={{ title: 'Log' }} />
          </Stack.Navigator>
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});

export default App;
