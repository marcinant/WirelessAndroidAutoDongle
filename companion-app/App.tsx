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
import { loadDongles } from './src/onboarding/store';
import { t } from './src/i18n';
import OnboardingScreen from './src/screens/OnboardingScreen';
import DevicesScreen from './src/screens/DevicesScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ConfigScreen from './src/screens/ConfigScreen';
import LogsScreen from './src/screens/LogsScreen';
import ObdScreen from './src/screens/ObdScreen';

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
  const [hasDongles, setHasDongles] = React.useState(false);

  React.useEffect(() => {
    loadDongles()
      .then(list => setHasDongles(list.length > 0))
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
            initialRouteName={hasDongles ? 'Devices' : 'Onboarding'}
            screenOptions={{
              headerStyle: { backgroundColor: colors.card },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen name="Devices" component={DevicesScreen} options={{ title: t('title.devices') }} />
            <Stack.Screen
              name="Onboarding"
              component={OnboardingScreen}
              options={{ title: t('title.setup') }}
            />
            <Stack.Screen
              name="Dashboard"
              component={DashboardScreen}
              options={{ title: t('title.dashboard') }}
            />
            <Stack.Screen name="Config" component={ConfigScreen} options={{ title: t('title.settings') }} />
            <Stack.Screen name="Logs" component={LogsScreen} options={{ title: t('title.log') }} />
            <Stack.Screen name="Obd" component={ObdScreen} options={{ title: t('title.obd') }} />
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
