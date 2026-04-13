import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  MapContainer,
  Marker as LeafletMarker,
  Polyline as LeafletPolyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

export type LatLng = {
  latitude: number;
  longitude: number;
};

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type Camera = {
  center?: LatLng;
  heading?: number;
  pitch?: number;
  zoom?: number;
};

type EdgePadding = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type FitToCoordinatesOptions = {
  edgePadding?: EdgePadding;
  animated?: boolean;
};

type AnimateCameraOptions = {
  duration?: number;
};

export type MapViewRef = {
  animateToRegion: (region: Region, duration?: number) => void;
  fitToCoordinates: (coordinates: LatLng[], options?: FitToCoordinatesOptions) => void;
  getCamera: () => Promise<Required<Pick<Camera, 'heading' | 'pitch' | 'zoom'>> & { center: LatLng }>;
  animateCamera: (camera: Camera, options?: AnimateCameraOptions) => void;
};

type MapViewProps = {
  children?: React.ReactNode;
  initialRegion?: Region;
  onMapReady?: () => void;
  onPress?: (event: { nativeEvent: { coordinate: LatLng } }) => void;
  onRegionChange?: (region: Region) => void;
  onRegionChangeComplete?: (region: Region) => void;
  onUserLocationChange?: (event: { nativeEvent: { coordinate: LatLng } }) => void;
  showsUserLocation?: boolean;
  style?: StyleProp<ViewStyle>;
  toolbarEnabled?: boolean;
  showsCompass?: boolean;
  showsMyLocationButton?: boolean;
};

type MarkerProps = {
  anchor?: { x: number; y: number };
  children?: React.ReactNode;
  coordinate: LatLng;
  image?: unknown;
  onPress?: () => void;
  pinColor?: string;
  tracksViewChanges?: boolean;
  zIndex?: number;
};

type PolylineProps = {
  coordinates: LatLng[];
  strokeColor?: string;
  strokeWidth?: number;
};

const DEFAULT_REGION: Region = {
  latitude: 51.7544,
  longitude: 10.6182,
  latitudeDelta: 0.42,
  longitudeDelta: 0.42,
};

const MAP_CONTAINER_STYLE = { height: '100%', width: '100%' } as const;
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const FALLBACK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const FALLBACK_TILE_ATTRIBUTION =
  '&copy; OpenStreetMap contributors &copy; CARTO';
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const LEAFLET_STYLE_TAG_ID = 'hwb-leaflet-runtime-css';
const LEAFLET_RUNTIME_CSS = `
.leaflet-container {
  background: #ddd;
  overflow: hidden;
  outline: 0;
}
.leaflet-pane,
.leaflet-tile,
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-tile-container,
.leaflet-pane > svg,
.leaflet-pane > canvas {
  left: 0;
  position: absolute;
  top: 0;
}
.leaflet-pane { z-index: 400; }
.leaflet-tile-pane { z-index: 200; }
.leaflet-overlay-pane { z-index: 400; }
.leaflet-shadow-pane { z-index: 500; }
.leaflet-marker-pane { z-index: 600; }
.leaflet-tooltip-pane { z-index: 650; }
.leaflet-popup-pane { z-index: 700; }
.leaflet-map-pane canvas { z-index: 100; }
.leaflet-map-pane svg { z-index: 200; }
.leaflet-zoom-box {
  border: 2px dotted #38f;
  height: 0;
  pointer-events: none;
  width: 0;
}
.leaflet-tile {
  user-select: none;
  visibility: hidden;
}
.leaflet-tile-loaded { visibility: inherit; }
.leaflet-zoom-animated { transform-origin: 0 0; }
.leaflet-container img {
  max-height: none;
  max-width: none !important;
  width: auto;
}
`;

const iconCache = new Map<string, L.Icon>();

function ensureLeafletRuntimeCss() {
  if (typeof document === 'undefined') {
    return;
  }

  if (document.getElementById(LEAFLET_STYLE_TAG_ID)) {
    return;
  }

  const styleTag = document.createElement('style');
  styleTag.id = LEAFLET_STYLE_TAG_ID;
  styleTag.textContent = LEAFLET_RUNTIME_CSS;
  document.head.appendChild(styleTag);
}

function clampZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 12;
  }

  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function zoomFromLongitudeDelta(longitudeDelta: number) {
  const normalized = Math.max(0.000001, longitudeDelta);
  return clampZoom(Math.log2(360 / normalized));
}

function regionFromMap(map: LeafletMap): Region {
  const center = map.getCenter();
  const bounds = map.getBounds();

  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: Math.max(0.000001, bounds.getNorth() - bounds.getSouth()),
    longitudeDelta: Math.max(0.000001, bounds.getEast() - bounds.getWest()),
  };
}

function coordinateToTuple(coordinate: LatLng): [number, number] {
  return [coordinate.latitude, coordinate.longitude];
}

function createPinSvg(color: string, size: number) {
  if (size <= 18) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="${color}" stroke="white" stroke-width="2"/></svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 1.35)}" viewBox="0 0 28 38"><path fill="${color}" d="M14 1C6.82 1 1 6.82 1 14c0 9.94 12.01 22.45 12.52 22.98a.7.7 0 0 0 .96 0C14.99 36.45 27 23.94 27 14 27 6.82 21.18 1 14 1Zm0 18.25A5.25 5.25 0 1 1 14 8.75a5.25 5.25 0 0 1 0 10.5Z"/></svg>`;
}

function resolveImageUri(source: unknown): string | null {
  if (!source) {
    return null;
  }

  if (typeof source === 'number') {
    return Image.resolveAssetSource(source)?.uri ?? null;
  }

  if (typeof source === 'object' && source !== null && 'uri' in source) {
    const candidate = (source as { uri?: unknown }).uri;
    return typeof candidate === 'string' ? candidate : null;
  }

  return null;
}

function createIcon(options: {
  anchor?: { x: number; y: number };
  color: string;
  imageUri?: string | null;
  size: number;
}) {
  const { anchor, color, imageUri, size } = options;
  const width = size;
  const height = size <= 18 ? size : Math.round(size * 1.35);
  const iconAnchor: [number, number] = [
    Math.round((anchor?.x ?? 0.5) * width),
    Math.round((anchor?.y ?? 1) * height),
  ];

  const cacheKey = `${imageUri ?? 'svg'}:${color}:${size}:${iconAnchor[0]}:${iconAnchor[1]}`;
  const existing = iconCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const icon = imageUri
    ? L.icon({
        iconAnchor,
        iconSize: [width, height],
        iconUrl: imageUri,
      })
    : L.icon({
        iconAnchor,
        iconSize: [width, height],
        iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createPinSvg(color, size))}`,
      });

  iconCache.set(cacheKey, icon);
  return icon;
}

function MapEventBridge(props: {
  onPress?: MapViewProps['onPress'];
  onRegionChange?: MapViewProps['onRegionChange'];
  onRegionChangeComplete?: MapViewProps['onRegionChangeComplete'];
}) {
  const { onPress, onRegionChange, onRegionChangeComplete } = props;

  useMapEvents({
    click(event) {
      onPress?.({
        nativeEvent: {
          coordinate: { latitude: event.latlng.lat, longitude: event.latlng.lng },
        },
      });
    },
    move(event) {
      if (!onRegionChange) {
        return;
      }

      onRegionChange(regionFromMap(event.target));
    },
    moveend(event) {
      if (!onRegionChangeComplete) {
        return;
      }

      onRegionChangeComplete(regionFromMap(event.target));
    },
  });

  return null;
}

function MapInstanceBridge(props: { onMapReady?: (map: LeafletMap) => void }) {
  const { onMapReady } = props;
  const map = useMap();

  useEffect(() => {
    onMapReady?.(map);
  }, [map, onMapReady]);

  return null;
}

const MapView = forwardRef<MapViewRef, MapViewProps>(function MapView(props, ref) {
  const {
    children,
    initialRegion,
    onMapReady,
    onPress,
    onRegionChange,
    onRegionChangeComplete,
    onUserLocationChange,
    showsUserLocation,
    style,
  } = props;
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [tileSource, setTileSource] = useState<{ attribution: string; url: string }>({
    attribution: TILE_ATTRIBUTION,
    url: TILE_URL,
  });

  const effectiveRegion = initialRegion ?? DEFAULT_REGION;
  const centerTuple = useMemo(
    () => coordinateToTuple({ latitude: effectiveRegion.latitude, longitude: effectiveRegion.longitude }),
    [effectiveRegion.latitude, effectiveRegion.longitude]
  );
  const initialZoom = useMemo(
    () => zoomFromLongitudeDelta(effectiveRegion.longitudeDelta),
    [effectiveRegion.longitudeDelta]
  );

  useEffect(() => {
    ensureLeafletRuntimeCss();
  }, []);

  useEffect(() => {
    if (!map) {
      return;
    }

    const resizeAndInvalidate = () => {
      map.invalidateSize();
    };

    const frameId = requestAnimationFrame(resizeAndInvalidate);
    window.addEventListener('resize', resizeAndInvalidate);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', resizeAndInvalidate);
    };
  }, [map]);

  useImperativeHandle(
    ref,
    () => ({
      animateToRegion(region, duration = 250) {
        if (!map) {
          return;
        }

        map.flyTo(coordinateToTuple(region), zoomFromLongitudeDelta(region.longitudeDelta), {
          duration: Math.max(0, duration) / 1000,
        });
      },
      fitToCoordinates(coordinates, options) {
        if (!map || coordinates.length === 0) {
          return;
        }

        const bounds = L.latLngBounds(coordinates.map((coordinate) => coordinateToTuple(coordinate)));
        const edgePadding = options?.edgePadding ?? {};

        map.fitBounds(bounds, {
          animate: options?.animated ?? true,
          paddingBottomRight: [edgePadding.right ?? 0, edgePadding.bottom ?? 0],
          paddingTopLeft: [edgePadding.left ?? 0, edgePadding.top ?? 0],
        });
      },
      async getCamera() {
        if (!map) {
          return {
            center: {
              latitude: effectiveRegion.latitude,
              longitude: effectiveRegion.longitude,
            },
            heading: 0,
            pitch: 0,
            zoom: initialZoom,
          };
        }

        const center = map.getCenter();
        return {
          center: {
            latitude: center.lat,
            longitude: center.lng,
          },
          heading: 0,
          pitch: 0,
          zoom: map.getZoom(),
        };
      },
      animateCamera(camera, options) {
        if (!map) {
          return;
        }

        const center = camera.center ? coordinateToTuple(camera.center) : map.getCenter();
        const zoom = typeof camera.zoom === 'number' ? clampZoom(camera.zoom) : map.getZoom();

        map.flyTo(center, zoom, {
          duration: Math.max(0, options?.duration ?? 250) / 1000,
        });
      },
    }),
    [effectiveRegion.latitude, effectiveRegion.longitude, initialZoom, map]
  );

  useEffect(() => {
    if (!showsUserLocation && !onUserLocationChange) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coordinate = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setUserLocation(coordinate);
        onUserLocationChange?.({ nativeEvent: { coordinate } });
      },
      () => {
        // Web geolocation can be denied by browser policy/user settings.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [onUserLocationChange, showsUserLocation]);

  if (typeof window === 'undefined') {
    return <View style={style} />;
  }

  return (
    <View style={style}>
      <MapContainer
        center={centerTuple}
        style={MAP_CONTAINER_STYLE}
        zoom={initialZoom}
        zoomControl={false}>
        <MapInstanceBridge
          onMapReady={(nextMap) => {
            setMap(nextMap);
            onMapReady?.();
          }}
        />
        <TileLayer
          attribution={tileSource.attribution}
          eventHandlers={{
            tileerror() {
              setTileSource((current) => {
                if (current.url === FALLBACK_TILE_URL) {
                  return current;
                }

                return {
                  attribution: FALLBACK_TILE_ATTRIBUTION,
                  url: FALLBACK_TILE_URL,
                };
              });
            },
          }}
          url={tileSource.url}
        />
        <MapEventBridge
          onPress={onPress}
          onRegionChange={onRegionChange}
          onRegionChangeComplete={onRegionChangeComplete}
        />

        {showsUserLocation && userLocation ? (
          <LeafletMarker
            icon={createIcon({
              color: '#2f7dd7',
              size: 14,
            })}
            position={coordinateToTuple(userLocation)}
            zIndexOffset={80}
          />
        ) : null}
        {children}
      </MapContainer>
    </View>
  );
});

type InternalMarkerProps = MarkerProps & {
  children?: React.ReactNode;
};

function Marker(props: InternalMarkerProps) {
  const {
    anchor,
    children,
    coordinate,
    image,
    onPress,
    pinColor,
    zIndex,
  } = props;

  const imageUri = resolveImageUri(image);
  const isDecorativeOverlayMarker = Boolean(children) && !imageUri && !pinColor && !onPress;
  if (isDecorativeOverlayMarker) {
    return null;
  }

  const shouldUseCompactMarker = Boolean(children) && !imageUri;
  const derivedColor =
    pinColor ?? (typeof zIndex === 'number' && zIndex <= 14 ? '#2f7dd7' : '#2e6b4b');
  const icon = createIcon({
    anchor,
    color: derivedColor,
    // Raster marker assets from react-native-maps are not reliably resolvable on web.
    // Keep markers visible by using generated SVG pins instead.
    imageUri: null,
    size: shouldUseCompactMarker ? 14 : 30,
  });

  return (
    <LeafletMarker
      eventHandlers={
        onPress
          ? {
              click(event) {
                event.originalEvent?.stopPropagation?.();
                onPress();
              },
            }
          : undefined
      }
      icon={icon}
      position={coordinateToTuple(coordinate)}
      zIndexOffset={typeof zIndex === 'number' ? zIndex : 0}
    />
  );
}

function Polyline(props: PolylineProps) {
  const { coordinates, strokeColor = '#2e6b4b', strokeWidth = 3 } = props;
  if (coordinates.length === 0) {
    return null;
  }

  return (
    <LeafletPolyline
      pathOptions={{ color: strokeColor, weight: strokeWidth }}
      positions={coordinates.map((coordinate) => coordinateToTuple(coordinate))}
    />
  );
}

export default MapView;
export { Marker, Polyline };
