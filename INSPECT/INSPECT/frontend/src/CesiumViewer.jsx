import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as Cesium from 'cesium';

const API         = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TILESET_URL = `${API}/tileset/tileset_Tower.json`;

const SEV_COLOR = {
  critical: '#f7768e',
  warning:  '#ff9e64',
  info:     '#00d2ff',
  good:     '#73daca',
};

const CesiumViewer = forwardRef(function CesiumViewer({ onPickPoint, mode, annotations, onTilesetError }, ref) {
  const containerRef = useRef(null);
  const viewerRef    = useRef(null);
  const tilesetRef   = useRef(null);
  const billboardRef = useRef(null);
  const handlerRef   = useRef(null);

  useImperativeHandle(ref, () => ({
    flyToTileset() {
      if (!viewerRef.current || !tilesetRef.current) return;
      viewerRef.current.flyTo(tilesetRef.current, {
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 180),
        duration: 2,
      });
    },
    getViewer() { return viewerRef.current; },
  }));

  // Initialize viewer once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || viewerRef.current) return;

    Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_TOKEN || '';

    const viewer = new Cesium.Viewer(el, {
      baseLayer: new Cesium.ImageryLayer(
        new Cesium.UrlTemplateImageryProvider({
          url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          credit: '© OpenStreetMap',
          maximumLevel: 19,
        })
      ),
      baseLayerPicker:      false,
      animation:            false,
      timeline:             false,
      geocoder:             false,
      homeButton:           false,
      navigationHelpButton: false,
      sceneModePicker:      false,
      fullscreenButton:     false,
      infoBox:              false,
      selectionIndicator:   false,
      shadows:              false,
      terrainProvider:      new Cesium.EllipsoidTerrainProvider(),
    });

    viewer.scene.backgroundColor    = Cesium.Color.fromCssColorString('#080c10');
    viewer.scene.globe.enableLighting = false;

    const billboards = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    billboardRef.current = billboards;
    viewerRef.current    = viewer;

    // Load tileset
    (async () => {
      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(TILESET_URL, {
          maximumScreenSpaceError: 8,
          maximumMemoryUsage:      2048,
          skipLevelOfDetail:       true,
          preferLeaves:            true,
        });
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        await viewer.flyTo(tileset, {
          offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 180),
          duration: 2.5,
        });
      } catch (e) {
        console.error('Tileset load error:', e);
        onTilesetError?.('Failed to load 3D tileset — check that the backend is running.');
      }
    })();

    // Dispatch coordinate updates via CustomEvent instead of polluting window
    const canvas = viewer.scene.canvas;
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cartesian = viewer.scene.pickPosition(
        new Cesium.Cartesian2(e.clientX - rect.left, e.clientY - rect.top)
      );
      if (!cartesian) return;
      const carto = Cesium.Cartographic.fromCartesian(cartesian);
      window.dispatchEvent(new CustomEvent('inspect:coord', {
        detail: {
          lat: Cesium.Math.toDegrees(carto.latitude).toFixed(6),
          lon: Cesium.Math.toDegrees(carto.longitude).toFixed(6),
          alt: carto.height.toFixed(1),
        },
      }));
    };
    canvas.addEventListener('mousemove', onMove);

    return () => {
      canvas.removeEventListener('mousemove', onMove);
      if (!viewer.isDestroyed()) viewer.destroy();
      viewerRef.current  = null;
      tilesetRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Swap click handler when mode or callback changes
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (handlerRef.current && !handlerRef.current.isDestroyed()) {
      handlerRef.current.destroy();
    }

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((click) => {
      const pos = viewer.scene.pickPosition(click.position);
      if (!pos) return;
      onPickPoint?.({ x: pos.x, y: pos.y, z: pos.z });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) handler.destroy();
    };
  }, [onPickPoint]);

  // Sync annotation billboard markers
  useEffect(() => {
    const bb = billboardRef.current;
    if (!bb) return;
    bb.removeAll();
    annotations.forEach(ann => {
      if (!ann.ecef) return;
      bb.add({
        position:       new Cesium.Cartesian3(ann.ecef.x, ann.ecef.y, ann.ecef.z),
        image:          makeDot(SEV_COLOR[ann.severity] || '#ffffff'),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        scale:          1.0,
        pixelOffset:    new Cesium.Cartesian2(0, -4),
      });
    });
  }, [annotations]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
});

function makeDot(color) {
  const c   = document.createElement('canvas');
  c.width   = c.height = 24;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(12, 12, 9, 0, Math.PI * 2);
  ctx.fillStyle   = color;
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 2;
  ctx.stroke();
  return c.toDataURL();
}

export default CesiumViewer;
