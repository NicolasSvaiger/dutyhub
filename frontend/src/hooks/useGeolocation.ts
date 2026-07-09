import { useState, useCallback } from 'react';

export interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
  loading: boolean;
  getCurrentPosition: () => Promise<{ latitude: number; longitude: number }>;
}

export function useGeolocation(): GeolocationState {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentPosition = useCallback((): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = 'Geolocalização não é suportada pelo navegador';
        setError(msg);
        setLoading(false);
        reject(new Error(msg));
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setLatitude(lat);
          setLongitude(lng);
          setError(null);
          setLoading(false);
          resolve({ latitude: lat, longitude: lng });
        },
        (err) => {
          let msg: string;
          switch (err.code) {
            case err.PERMISSION_DENIED:
              msg = 'Permissão de geolocalização negada';
              break;
            case err.POSITION_UNAVAILABLE:
              msg = 'Posição indisponível';
              break;
            case err.TIMEOUT:
              msg = 'Tempo esgotado ao obter localização';
              break;
            default:
              msg = 'Erro ao obter localização';
          }
          setError(msg);
          setLoading(false);
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  }, []);

  return {
    latitude,
    longitude,
    error,
    loading,
    getCurrentPosition,
  };
}
