import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ParentStackParamList } from '@/navigation/types';
import { ParentHomeScreen } from '@/screens/parent/ParentHomeScreen';
import { TrackBusScreen } from '@/screens/parent/TrackBusScreen';

const Stack = createNativeStackNavigator<ParentStackParamList>();

export function ParentNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ParentHome" component={ParentHomeScreen} />
      <Stack.Screen name="TrackBus" component={TrackBusScreen} />
    </Stack.Navigator>
  );
}
