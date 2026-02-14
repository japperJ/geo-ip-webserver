import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet-draw';

export interface GeofenceMapProps {
  center?: [number, number];
  zoom?: number;
  geofence?: {
    type: 'polygon' | 'radius';
    polygon?: GeoJSON.Polygon;
    center?: GeoJSON.Point;
    radius_km?: number;
  } | null;
  onGeofenceChange?: (geofence: {
    type: 'polygon' | 'radius';
    polygon?: GeoJSON.Polygon;
    center?: GeoJSON.Point;
    radius_km?: number;
  } | null) => void;
  readonly?: boolean;
}

/**
 * Leaflet map component with geofence drawing
 */
export function GeofenceMap({
  center = [37.7749, -122.4194], // Default: San Francisco
  zoom = 12,
  geofence,
  onGeofenceChange,
  readonly = false,
}: GeofenceMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawnLayerRef = useRef<L.Layer | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    setIsReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add drawing controls
  useEffect(() => {
    if (!mapRef.current || !isReady || readonly) return;

    const map = mapRef.current;
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
        },
        circle: true,
        rectangle: true,
        marker: false,
        polyline: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems,
        remove: true,
      },
    });

    map.addControl(drawControl);

    // Handle shape creation
    map.on(L.Draw.Event.CREATED, (event: any) => {
      const layer = event.layer;

      // Clear previous drawings
      if (drawnLayerRef.current) {
        drawnItems.removeLayer(drawnLayerRef.current);
      }

      drawnItems.addLayer(layer);
      drawnLayerRef.current = layer;

      // Convert to geofence format
      if (layer instanceof L.Circle) {
        const circle = layer as L.Circle;
        const centerLatLng = circle.getLatLng();
        const radiusMeters = circle.getRadius();

        onGeofenceChange?.({
          type: 'radius',
          center: {
            type: 'Point',
            coordinates: [centerLatLng.lng, centerLatLng.lat],
          },
          radius_km: radiusMeters / 1000,
        });
      } else if (layer instanceof L.Polygon) {
        const polygon = layer as L.Polygon;
        const latLngs = polygon.getLatLngs()[0] as L.LatLng[];
        const coordinates = latLngs.map((ll) => [ll.lng, ll.lat]);
        coordinates.push(coordinates[0]); // Close the ring

        onGeofenceChange?.({
          type: 'polygon',
          polygon: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        });
      }
    });

    // Handle shape deletion
    map.on(L.Draw.Event.DELETED, () => {
      drawnLayerRef.current = null;
      onGeofenceChange?.(null);
    });

    return () => {
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [isReady, readonly, onGeofenceChange]);

  // Display existing geofence
  useEffect(() => {
    if (!mapRef.current || !isReady || !geofence) return;

    const map = mapRef.current;

    // Clear existing layer
    if (drawnLayerRef.current) {
      map.removeLayer(drawnLayerRef.current);
    }

    let layer: L.Layer | null = null;

    if (geofence.type === 'polygon' && geofence.polygon) {
      const coords = geofence.polygon.coordinates[0].map((c) => [c[1], c[0]] as [number, number]);
      layer = L.polygon(coords, {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
      });
    } else if (geofence.type === 'radius' && geofence.center && geofence.radius_km) {
      const center = [geofence.center.coordinates[1], geofence.center.coordinates[0]] as [
        number,
        number
      ];
      layer = L.circle(center, {
        radius: geofence.radius_km * 1000,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
      });
    }

    if (layer) {
      layer.addTo(map);
      drawnLayerRef.current = layer;
      map.fitBounds((layer as any).getBounds());
    }
  }, [isReady, geofence]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '500px' }}
      className="rounded-lg overflow-hidden border border-gray-300"
    />
  );
}
