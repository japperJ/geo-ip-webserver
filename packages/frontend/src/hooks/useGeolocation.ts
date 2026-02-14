import { useState, useEffect, useCallback } from 'react';

export interface GeolocationState {
  coords: {
    lat: number;
    lng: number;
    accuracy: number;
  } | null;
  error: GeolocationPositionError | null;
  loading: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'unknown';
}

export interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  maxAttempts?: number;
  targetAccuracy?: number;
}

/**
 * Hook to get user's GPS location with high accuracy
 */
export function useGeolocation(options: UseGeolocationOptions = {}) {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
    maxAttempts = 3,
    targetAccuracy = 50,
  } = options;

  const [state, setState] = useState<GeolocationState>({
    coords: null,
    error: null,
    loading: false,
    permission: 'unknown',
  });

  // Check permission state
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setState((prev) => ({ ...prev, permission: result.state as any }));

        result.addEventListener('change', () => {
          setState((prev) => ({ ...prev, permission: result.state as any }));
        });
      });
    }
  }, []);

  const requestLocation = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setState((prev) => ({
        ...prev,
        error: {
          code: 0,
          message: 'Geolocation not supported',
        } as GeolocationPositionError,
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    let bestPosition: GeolocationPosition | null = null;
    let attempts = 0;

    const tryGetPosition = (): Promise<GeolocationPosition> => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy,
          timeout,
          maximumAge,
        });
      });
    };

    while (attempts < maxAttempts) {
      try {
        const position = await tryGetPosition();

        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }

        // If we have good enough accuracy, stop trying
        if (bestPosition.coords.accuracy <= targetAccuracy) {
          break;
        }

        attempts++;
        if (attempts < maxAttempts) {
          // Wait 2 seconds before next attempt
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error as GeolocationPositionError,
          loading: false,
        }));
        return;
      }
    }

    if (bestPosition) {
      setState({
        coords: {
          lat: bestPosition.coords.latitude,
          lng: bestPosition.coords.longitude,
          accuracy: bestPosition.coords.accuracy,
        },
        error: null,
        loading: false,
        permission: 'granted',
      });
    }
  }, [enableHighAccuracy, timeout, maximumAge, maxAttempts, targetAccuracy]);

  return {
    ...state,
    requestLocation,
  };
}
