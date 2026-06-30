export type AuthStackParamList = {
  Login: undefined;
};

export type DriverStackParamList = {
  DriverHome: undefined;
  ActiveTrip: { tripId: string };
};

export type ParentStackParamList = {
  ParentHome: undefined;
  TrackBus: { tripId: string; vehicleId: string; studentName: string };
};
