import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { supabase } from './lib/supabase';
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFjMTA4ODgiLCJhIjoiY21sNzB1OGZ6MGtpZjNmc2YwMzZvcnY1eiJ9.0SqIx9oVqlvYGF2tWtccwA';

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(-13.2344);
  const [lat, setLat] = useState(8.4844);
  const [zoom, setZoom] = useState(13);
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [newBiz, setNewBiz] = useState({ name: '', category: '', power: '3phase', pos: false, photo: '' });
  const [selectedLngLat, setSelectedLngLat] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [pitch, setPitch] = useState(0);

  // 💾 LOAD BUSINESSES
  const loadBusinesses = useCallback(async () => {
    try {
      const { data } = await supabase.from('businesses').select('*');
      setBusinesses(data || []);
      
      if (map.current && data) {
        data.forEach(biz => {
          const color = biz.pos ? '#10b981' : biz.power === '3phase' ? '#3b82f6' : '#f59e0b';
          new mapboxgl.Marker({ color })
            .setLngLat([biz.lng, biz.lat])
            .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div class="p-3">
                <h3 class="font-bold text-xl mb-2">${biz.name}</h3>
                <p class="text-lg">${biz.category}</p>
                <p>⚡ ${biz.power} | ${biz.pos ? '💳 POS' : 'Cash Only'}</p>
                ${biz.photo ? `<img src="${biz.photo}" class="w-full mt-2 rounded" style="max-height:150px">` : ''}
              </div>`
            ))
            .addTo(map.current);
        });
      }
    } catch (error) {
      console.error('Load failed:', error);
    }
  }, []);

  // 🌍 COMPLETE MAP INIT - 3D + TRAFFIC + ALL FEATURES
  const initializeMap = useCallback(() => {
    if (map.current) return;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: zoom,
      pitch: 45,
      bearing: 0
    });

    map.current.on('load', () => {
      console.log('🚀 Freetown Map LOADED - Adding 3D + Traffic');

      // 🏢 3D BUILDINGS
      const layers = map.current.getStyle().layers;
      const labelLayerId = layers.find(layer => 
        layer.type === 'symbol' && layer.layout['text-field']
      )?.id;

      map.current.addLayer({
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': '#cccccc',
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            15, 0, 15.05, ['get', 'height']
          ],
          'fill-extrusion-base': [
            'interpolate', ['linear'], ['zoom'],
            15, 0, 15.05, ['get', 'min_height']
          ],
          'fill-extrusion-opacity': 0.8
        }
      }, labelLayerId);

      // 🚗 TRAFFIC
      map.current.addLayer({
        id: 'traffic',
        type: 'line',
        source: {
          type: 'vector',
          url: 'mapbox://mapbox.mapbox-traffic-v1'
        },
        'source-layer': 'traffic-data',
        paint: {
          'line-color': [
            'match', ['get', 'road_congestion_level'],
            'low', '#00ff88', 'moderate', '#ffaa00', 
            'heavy', '#ff4444', '#888888'
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 20, 10]
        }
      });
    });

    // 📍 CLICK TO ADD
    map.current.on('click', (e) => {
      if (isAdmin && showAdmin) {
        setSelectedLngLat([e.lngLat.lng, e.lngLat.lat]);
        new mapboxgl.Marker({ color: '#3b82f6' })
          .setLngLat(e.lngLat)
          .addTo(map.current);
      }
    });

    // 🖱️ MOVE HANDLER
    map.current.on('move', () => {
      const center = map.current.getCenter();
      setLng(center.lng.toFixed(4));
      setLat(center.lat.toFixed(4));
      setZoom(map.current.getZoom());
      setPitch(map.current.getPitch());
    });

    map.current.once('idle', loadBusinesses);
  }, [lng, lat, zoom, isAdmin, showAdmin, loadBusinesses]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsAdmin(urlParams.get('edit') === 'true');
  }, []);

  useEffect(() => {
    initializeMap();
    loadBusinesses();
  }, [initializeMap, loadBusinesses]);

  // 💾 SAVE BUSINESS
  const saveBusiness = async () => {
    if (!selectedLngLat || !newBiz.name.trim()) {
      alert('❌ Name + Map Click Required!');
      return;
    }
    
    const payload = {
      name: newBiz.name.trim(),
      category: newBiz.category || 'General',
      power: newBiz.power,
      pos: newBiz.pos,
      lng: selectedLngLat[0],
      lat: selectedLngLat[1],
      photo: newBiz.photo
    };

    const { error } = await supabase.from('businesses').insert([payload]);
    if (!error) {
      loadBusinesses();
      setNewBiz({ name: '', category: '', power: '3phase', pos: false, photo: '' });
      setShowAdmin(false);
      setSelectedLngLat(null);
      alert('🎉 Business LIVE on Freetown Map!');
    } else {
      alert('Save error: ' + error.message);
    }
  };

  // 🔍 FILTERS
  const filteredBusinesses = businesses.filter(biz => {
    const matchesSearch = biz.name?.toLowerCase().includes(search.toLowerCase()) ||
                         biz.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'all' || biz.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(businesses.map(b => b.category).filter(Boolean))];

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      
      {/* 🏛️ HEADER */}
      <div className="absolute top-4 left-4 right-4 bg-white/95 backdrop-blur-2xl p-6 rounded-3xl shadow-2xl z-20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border border-white/50">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-2xl">
            🗺️ Freetown Business Map
          </h1>
          <p className="text-lg text-gray-700 font-semibold mt-1">
            3D Mapbox + Live Supabase • {filteredBusinesses.length}/{businesses.length} businesses
          </p>
        </div>
        
        {/* ADMIN BUTTON */}
        {isAdmin && (
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-2xl hover:shadow-3xl transition-all transform hover:-translate-y-1 lg:self-end"
          >
            {showAdmin ? '❌ Close Admin' : '➕ Add Business'}
          </button>
        )}
      </div>

      {/* 🔍 SEARCH + FILTERS */}
      <div className="absolute top-32 left-6 right-6 max-w-2xl z-20 space-y-3">
        <input
          placeholder="🔍 Search shops • markets • restaurants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full p-6 text-xl bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border-2 border-white/60 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-200 transition-all"
        />
        
        {/* CATEGORY FILTER */}
        <div className="flex flex-wrap gap-2 bg-white/90 backdrop-blur-xl p-4 rounded-2xl shadow-xl border border-white/50">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                filterCategory === cat
                  ? 'bg-emerald-500 text-white shadow-lg transform scale-105'
                  : 'bg-gray-100 hover:bg-emerald-100 text-gray-700 hover:text-emerald-700'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* 👑 ADMIN PANEL */}
      {showAdmin && (
        <div className="absolute top-1/2 right-6 transform -translate-y-1/2 w-96 lg:w-[450px] bg-white/98 backdrop-blur-3xl p-8 rounded-3xl shadow-2xl z-30 border-2 border-white/70 animate-slideInRight">
          <h3 className="text-2xl font-black mb-8 bg-gradient-to-r from-gray-800 to-slate-700 bg-clip-text text-transparent">
            🚀 Add New Freetown Business
          </h3>
          
          <div className="space-y-5">
            <input
              placeholder="🏪 Business Name *"
              value={newBiz.name}
              onChange={e => setNewBiz({...newBiz, name: e.target.value})}
              className="w-full p-5 text-lg border-2 border-gray-200 rounded-2xl focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100 font-semibold"
            />
            
            <input
              placeholder="📂 Category (Shop, Market, Restaurant...)"
              value={newBiz.category}
              onChange={e => setNewBiz({...newBiz, category: e.target.value})}
              className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
            
            <select
              value={newBiz.power}
              onChange={e => setNewBiz({...newBiz, power: e.target.value})}
              className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100 appearance-none"
            >
              <option value="3phase">⚡ Reliable 3-Phase</option>
              <option value="1phase">🔌 Single Phase</option>
              <option value="generator">⛽ Generator</option>
            </select>
            
            <label className="flex items-center p-5 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-2xl cursor-pointer hover:shadow-lg transition-all hover:border-emerald-300">
              <input
                type="checkbox"
                checked={newBiz.pos}
                onChange={e => setNewBiz({...newBiz, pos: e.target.checked})}
                className="mr-4 w-7 h-7 rounded-xl shadow-md"
              />
              <span className="text-xl font-bold text-emerald-800">💳 POS/Card Payments</span>
            </label>
            
            <input
              placeholder="🖼️ Photo URL (optional)"
              value={newBiz.photo}
              onChange={e => setNewBiz({...newBiz, photo: e.target.value})}
              className="w-full p-5 border-2 border-gray-200 rounded-2xl focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
            />
          </div>

          {selectedLngLat && (
            <div className="mt-8 p-6 bg-gradient-to-r from-emerald-100 via-green-100 to-emerald-200 border-4 border-emerald-400 rounded-3xl shadow-2xl animate-pulse">
              <div className="font-black text-2xl text-emerald-900 mb-2">📍 GPS LOCKED</div>
              <div className="text-3xl font-mono text-emerald-800">
                Lat: {selectedLngLat[1].toFixed(5)}° | Lng: {selectedLngLat[0].toFixed(5)}°
              </div>
            </div>
          )}

          {!selectedLngLat && (
            <div className="mt-6 p-5 bg-amber-100 border-2 border-amber-300 rounded-2xl text-center font-medium text-amber-800">
              👆 Click Freetown map to set GPS location
            </div>
          )}

          <div className="mt-10 flex space-x-4 pt-6 border-t-2 border-gray-200">
            <button
              onClick={saveBusiness}
              disabled={!newBiz.name.trim() || !selectedLngLat}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-5 px-8 rounded-3xl font-black text-xl shadow-2xl hover:shadow-3xl transition-all transform hover:-translate-y-2 active:scale-95"
            >
              🌟 Save to LIVE Map!
            </button>
            <button
              onClick={() => {
                setShowAdmin(false);
                setSelectedLngLat(null);
                setNewBiz({ name: '', category: '', power: '3phase', pos: false, photo: '' });
              }}
              className="px-10 py-5 bg-gradient-to-r from-slate-400 to-gray-500 hover:from-slate-500 hover:to-gray-600 text-white rounded-3xl font-black shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1"
            >
              ❌ Reset
            </button>
          </div>
        </div>
      )}

      {/* 🗺️ MAP */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* 💬 WHATSAPP SHARE */}
      <a
        href={`https://wa.me/?text=🏪 Freetown Business Map - Live 3D GPS directory! ${window.location.href} #FreetownBiz #SierraLeone`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-8 right-8 bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-600 hover:via-teal-600 hover:to-emerald-700 text-white p-6 rounded-3xl shadow-2xl hover:shadow-3xl z-20 transition-all transform hover:scale-110 active:scale-95 border-4 border-white/30 backdrop-blur-sm"
      >
        <div className="text-2xl mb-1">💬</div>
        <div className="text-sm font-bold tracking-wider">SHARE MAP</div>
      </a>

      {/* 📊 STATS */}
      <div className="absolute bottom-6 left-6 bg-black/85 backdrop-blur-2xl text-white p-6 rounded-3xl text-sm font-mono z-10 border border-white/40 shadow-2xl max-w-sm">
        <div className="font-bold text-lg mb-2">📊 Live Stats</div>
        <div>{filteredBusinesses.length}/{businesses.length} businesses</div>
        <div>🛰️ {lat}, {lng}</div>
        <div>🔍 {Math.round(zoom)}x | 🎢 {Math.round(pitch)}°</div>
        <div className={`font-bold mt-2 px-3 py-1 rounded-full text-xs ${
          isAdmin 
            ? 'bg-emerald-500 text-white' 
            : 'bg-blue-500 text-white'
        }`}>
          {isAdmin ? '👑 ADMIN 3D MODE' : '🌍 PUBLIC VIEW'}
        </div>
      </div>
    </div>
  );
}

export default App;
