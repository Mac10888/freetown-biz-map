import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { supabase } from './lib/supabase'; // Create next
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css'; // Tailwind

mapboxgl.accessToken = 'YOUR_PUBLIC_MAPBOX_TOKEN_HERE'; // Paste yours

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(-13.2344);
  const [lat, setLat] = useState(8.4844);
  const [zoom, setZoom] = useState(13);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12', // Freetown-optimized
      center: [lng, lat],
      zoom: zoom,
      antialias: true // Smooth edges
    });

    map.current.on('move', () => {
      setLng(map.current.getCenter().lng.toFixed(4));
      setLat(map.current.getCenter().lat.toFixed(4));
      setZoom(map.current.getZoom().toFixed(2));
    });

    // Load businesses
    loadBusinesses();
  });

  const loadBusinesses = async () => {
    const { data } = await supabase.from('businesses').select('*');
    setBusinesses(data || []);
    data?.forEach(biz => {
      new mapboxgl.Marker({ color: biz.pos ? 'green' : 'orange' })
        .setLngLat([biz.lng, biz.lat])
        .setPopup(new mapboxgl.Popup().setText(`${biz.name} - ${biz.category}`))
        .addTo(map.current);
    });
  };

  return (
    <div className="h-screen bg-gray-900">
      <div className="absolute top-4 left-4 bg-white p-4 rounded-lg shadow-xl z-10">
        <h1 className="text-2xl font-bold text-blue-600">🗺️ Freetown Biz Map</h1>
        <p>Mapbox GL JS Live</p>
        <div>Lng: {lng} | Lat: {lat} | Zoom: {zoom}</div>
      </div>
      <div ref={mapContainer} className="map-container h-full" />
    </div>
  );
}

export default App;

