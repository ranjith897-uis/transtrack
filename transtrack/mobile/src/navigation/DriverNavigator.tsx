import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DriverStackParamList } from '@/navigation/types';
import { DriverHomeScreen } from '@/screens/driver/DriverHomeScreen';
import { ActiveTripScreen } from '@/screens/driver/ActiveTripScreen';

const Stack = createNativeStackNavigator<DriverStackParamList>();

export function DriverNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DriverHome" component={DriverHomeScreen} />
      <Stack.Screen name="ActiveTrip" component={ActiveTripScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
