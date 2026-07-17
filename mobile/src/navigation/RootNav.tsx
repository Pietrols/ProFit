import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { LoginScreen } from '../features/auth/LoginScreen';
import { RegisterScreen } from '../features/auth/RegisterScreen';
import { useAuth } from '../features/auth/AuthContext';
import { OnboardingContext } from '../features/onboarding/OnboardingContext';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { CommunityStack } from '../features/community/CommunityStack';
import { HomeStack } from '../features/home/HomeStack';
import { LibraryStack } from '../features/library/LibraryStack';
import { ChatScreen } from '../features/chat/ChatScreen';
import { NutritionScreen } from '../features/nutrition/NutritionScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { useAppTheme } from '../theme/ThemeContext';
import { LoadingView, Screen } from '../ui';

export type MainTabParamList = {
  Home: undefined;
  Library: undefined;
  Community: undefined;
  Progress: undefined;
  Nutrition: undefined;
  Coach: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Home: 'home-variant',
  Library: 'dumbbell',
  Community: 'earth',
  Progress: 'chart-line',
  Nutrition: 'food-apple',
  Coach: 'chat-processing',
  Profile: 'account',
};

export function RootNav() {
  const t = useAppTheme();
  const { restoring, session } = useAuth();
  const [authScreen, setAuthScreen] = useState<'login' | 'register'>('login');
  // First-run onboarding (Piece 2): shown when the account has never seen it
  // (server-tracked), dismissible, and reopenable from Profile.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [onboardingReopened, setOnboardingReopened] = useState(false);
  const onboardingValue = useMemo(
    () => ({ open: () => setOnboardingReopened(true) }),
    [],
  );

  if (restoring) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  if (!session) {
    return authScreen === 'login' ? (
      <LoginScreen onRegister={() => setAuthScreen('register')} />
    ) : (
      <RegisterScreen onLogin={() => setAuthScreen('login')} />
    );
  }

  const showOnboarding =
    onboardingReopened || (!session.user.onboardedAt && !onboardingDismissed);
  if (showOnboarding) {
    return (
      <OnboardingScreen
        onDone={() => {
          setOnboardingDismissed(true);
          setOnboardingReopened(false);
        }}
      />
    );
  }

  const navTheme = {
    ...(t.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.mode === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: t.colors.bg,
      card: t.colors.tab,
      text: t.colors.tx,
      border: t.colors.line,
      primary: t.colors.green,
    },
  };

  return (
    <OnboardingContext.Provider value={onboardingValue}>
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: t.colors.green,
          tabBarInactiveTintColor: t.colors.tx3,
          tabBarStyle: { backgroundColor: t.colors.tab, borderTopColor: t.colors.line },
          tabBarLabelStyle: { fontFamily: t.typography.label, fontSize: 11 },
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name={TAB_ICONS[route.name]} color={color} size={size} />
          ),
        })}
      >
        <Tab.Screen name="Home" component={HomeStack} />
        <Tab.Screen name="Library" component={LibraryStack} />
        <Tab.Screen name="Community" component={CommunityStack} />
        <Tab.Screen name="Progress" component={ProgressScreen} />
        <Tab.Screen name="Nutrition" component={NutritionScreen} />
        <Tab.Screen name="Coach" component={ChatScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
    </OnboardingContext.Provider>
  );
}
