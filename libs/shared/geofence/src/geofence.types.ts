export type LatLng = {
  lat: number;
  lng: number;
};

export type BoundingBox = {
  northeast: LatLng;
  southwest: LatLng;
};
