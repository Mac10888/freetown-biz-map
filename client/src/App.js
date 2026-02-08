import { useEffect, useState, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { createClient } from '@supabase/supabase-js';
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css';

// Initialize Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || 'pk.eyJ1IjoibWFjMTA4ODgiLCJhIjoiY21sNzB1OGZ6MGtpZjNmc2YwMzZvcnY1eiJ9.0SqIx9oVqlvYGF2tWtccwA';

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]); // Track markers for cleanup
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
  const [saveStatus, setSaveStatus] = useState(''); // Track save status
  const tempMarker = useRef(null); // Track temporary marker

  // 🧹 CLEAR ALL MARKERS
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
  }, []);

  // 📍 ADD MARKERS TO MAP
  const addMarkersToMap = useCallback((businessData) => {
    if (!map.current) return;

    clearMarkers();

    businessData.forEach(biz => {
      const color = biz.pos ? '#10b981' : biz.power === '3phase' ? '#3b82f6' : '#f59e0b';
      
      const marker = new mapboxgl.Marker({ color })
        .setLngLat([biz.lng, biz.lat])
        .setPopup(
          new mapboxgl.Popup({ 
            offset: 25,
            closeButton: true,
            closeOnClick: false,
            maxWidth: '300px'
          }).setHTML(
            `<div class="p-4">
              <h3 class="font-bold text-xl mb-2 text-gray-800">${biz.name}</h3>
              <p class="text-lg text-gray-600 mb-2">${biz.category || 'General'}</p>
              <div class="space-y-1 text-sm">
                <p class="flex items-center gap-2">
                  <span class="font-semibold">⚡ Power:</span> 
                  <span class="px-2 py-1 rounded ${biz.power === '3phase' ? 'bg-blue-100 text-blue-800' : biz.power === '1phase' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800'}">${biz.power}</span>
                </p>
                <p class="flex items-center gap-2">
                  <span class="font-semibold">💳 Payment:</span> 
                  <span class="px-2 py-1 rounded ${biz.pos ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">${biz.pos ? 'POS Available' : 'Cash Only'}</span>
                </p>
              </div>
              ${biz.photo ? `<img src="${biz.photo}" alt="${biz.name}" class="w-full mt-3 rounded-lg shadow" style="max-height:150px; object-fit:cover">` : ''}
            </div>`
          )
        )
        .addTo(map.current);

      markersRef.current.push(marker);
    });
  }, [clearMarkers]);

  // 💾 LOAD BUSINESSES
  const loadBusinesses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        setSaveStatus('❌ Failed to load businesses');
        return;
      }

      setBusinesses(data || []);
      addMarkersToMap(data || []);
      
    } catch (error) {
      console.error('Load failed:', error);
      setSaveStatus('❌ Connection error');
    }
  }, [addMarkersToMap]);

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

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true
    }), 'top-right');

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
        'source-layer': 'traffic',
        paint: {
          'line-color': [
            'match', ['get', 'congestion'],
            'low', '#00ff88', 
            'moderate', '#ffaa00', 
            'heavy', '#ff4444', 
            'severe', '#cc0000',
            '#888888'
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2, 20, 10]
        }
      });

      loadBusinesses();
    });

    // 📍 CLICK TO ADD
    map.current.on('click', (e) => {
      if (isAdmin && showAdmin) {
        // Remove previous temp marker
        if (tempMarker.current) {
          tempMarker.current.remove();
        }

        setSelectedLngLat([e.lngLat.lng, e.lngLat.lat]);
        
        // Create new temp marker
        tempMarker.current = new mapboxgl.Marker({ 
          color: '#ff0000',
          draggable: true 
        })
          .setLngLat(e.lngLat)
          .addTo(map.current);

        // Update coordinates if marker is dragged
        tempMarker.current.on('dragend', () => {
          const lngLat = tempMarker.current.getLngLat();
          setSelectedLngLat([lngLat.lng, lngLat.lat]);
        });
      }
    });

    // 🖱️ MOVE HANDLER
    map.current.on('move', () => {
      const center = map.current.getCenter();
      setLng(center.lng.toFixed(4));
      setLat(center.lat.toFixed(4));
      setZoom(map.current.getZoom().toFixed(2));
      setPitch(map.current.getPitch());
    });
  }, [lng, lat, zoom, isAdmin, showAdmin, loadBusinesses]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsAdmin(urlParams.get('edit') === 'true');
  }, []);

  useEffect(() => {
    initializeMap();
    return () => {
      clearMarkers();
      if (tempMarker.current) tempMarker.current.remove();
    };
  }, [initializeMap, clearMarkers]);

  // 💾 SAVE BUSINESS - FIXED VERSION
  const saveBusiness = async () => {
    if (!selectedLngLat || !newBiz.name.trim()) {
      setSaveStatus('❌ Name + Map Click Required!');
      setTimeout(() => setSaveStatus(''), 3000);
      return;
    }
    
    setSaveStatus('💾 Saving...');

    const payload = {
      name: newBiz.name.trim(),
      category: newBiz.category?.trim() || 'General',
      power: newBiz.power,
      pos: newBiz.pos,
      lng: selectedLngLat[0],
      lat: selectedLngLat[1],
      photo: newBiz.photo?.trim() || null
    };

    try {
      const { data, error } = await supabase
        .from('businesses')
        .insert([payload])
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        setSaveStatus(`❌ Save failed: ${error.message}`);
        setTimeout(() => setSaveStatus(''), 5000);
        return;
      }

      // Success!
      setSaveStatus('✅ Business saved successfully!');
      
      // Reload all businesses to refresh map
      await loadBusinesses();
      
      // Reset form
      setNewBiz({ name: '', category: '', power: '3phase', pos: false, photo: '' });
      setSelectedLngLat(null);
      if (tempMarker.current) {
        tempMarker.current.remove();
        tempMarker.current = null;
      }
      
      setTimeout(() => {
        setSaveStatus('');
        setShowAdmin(false);
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus(`❌ Error: ${error.message}`);
      setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  // 🔍 FILTERS
  const filteredBusinesses = businesses.filter(biz => {
    const matchesSearch = biz.name?.toLowerCase().includes(search.toLowerCase()) ||
                         biz.category?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = filterCategory === 'all' || biz.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Update markers when filter changes
  useEffect(() => {
    if (search || filterCategory !== 'all') {
      addMarkersToMap(filteredBusinesses);
    } else {
      addMarkersToMap(businesses);
    }
  }, [search, filterCategory, businesses, filteredBusinesses, addMarkersToMap]);

  const categories = ['all', ...new Set(businesses.map(b => b.category).filter(Boolean))];

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      
      {/* 🏛️ FLOATING HEADER - FIXED */}
      <div className="fixed top-4 left-4 right-4 bg-white/90 backdrop-blur-xl p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-2xl z-30 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 md:gap-4 border border-white/50">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-black bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-600 bg-clip-text text-transparent drop-shadow-lg">
            🗺️ Freetown Business Map
          </h1>
          <p className="text-sm md:text-base lg:text-lg text-gray-700 font-semibold mt-1">
            3D Mapbox + Live Supabase • {filteredBusinesses.length}/{businesses.length} businesses
          </p>
        </div>
        
        {/* ADMIN BUTTON */}
        {isAdmin && (
          <button
            onClick={() => {
              setShowAdmin(!showAdmin);
              if (showAdmin && tempMarker.current) {
                tempMarker.current.remove();
                tempMarker.current = null;
                setSelectedLngLat(null);
              }
            }}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-base md:text-lg shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1"
          >
            {showAdmin ? '❌ Close Admin' : '➕ Add Business'}
          </button>
        )}
      </div>

      {/* 🔍 SEARCH + FILTERS - ADJUSTED TOP POSITION */}
      <div className="fixed top-24 md:top-32 left-4 md:left-6 right-4 md:right-6 max-w-2xl z-20 space-y-3">
        <input
          placeholder="🔍 Search shops • markets • restaurants..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full p-4 md:p-6 text-lg md:text-xl bg-white/95 backdrop-blur-xl rounded-2xl md:rounded-3xl shadow-2xl border-2 border-white/60 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-200 transition-all"
        />
        
        {/* CATEGORY FILTER */}
        <div className="flex flex-wrap gap-2 bg-white/90 backdrop-blur-xl p-3 md:p-4 rounded-xl md:rounded-2xl shadow-xl border border-white/50">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-semibold text-sm md:text-base transition-all ${
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
        <div className="fixed top-1/2 right-4 md:right-6 transform -translate-y-1/2 w-[calc(100%-2rem)] md:w-96 lg:w-[450px] max-h-[85vh] overflow-y-auto bg-white/98 backdrop-blur-3xl p-6 md:p-8 rounded-2xl md:rounded-3xl shadow-2xl z-40 border-2 border-white/70 animate-slideIn">
          <h3 className="text-xl md:text-2xl font-black mb-6 md:mb-8 bg-gradient-to-r from-gray-800 to-slate-700 bg-clip-text text-transparent">
            🚀 Add New Freetown Business
          </h3>
          
          {saveStatus && (
            <div className={`mb-4 p-4 rounded-xl font-bold text-center ${
              saveStatus.includes('✅') ? 'bg-green-100 text-green-800 border-2 border-green-300' :
              saveStatus.includes('💾') ? 'bg-blue-100 text-blue-800 border-2 border-blue-300' :
              'bg-red-100 text-red-800 border-2 border-red-300'
            }`}>
              {saveStatus}
            </div>
          )}
          
          <div className="space-y-4 md:space-y-5">
            <input
              placeholder="🏪 Business Name *"
              value={newBiz.name}
              onChange={e => setNewBiz({...newBiz, name: e.target.value})}
              className="w-full p-4 md:p-5 text-base md:text-lg border-2 border-gray-200 rounded-xl md:rounded-2xl focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100 font-semibold"
            />
            
            <input
              placeholder="📂 Category (Shop, Market, Restaurant...)"
              value={newBiz.category}
              onChange={e => setNewBiz({...newBiz, category: e.target.value})}
              className="w-full p-4 md:p-5 text-base md:text-lg border-2 border-gray-200 rounded-xl md:rounded-2xl focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
            
            <select
              value={newBiz.power}
              onChange={e => setNewBiz({...newBiz, power: e.target.value})}
              className="w-full p-4 md:p-5 text-base md:text-lg border-2 border-gray-200 rounded-xl md:rounded-2xl focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100 appearance-none bg-white"
            >
              <option value="3phase">⚡ Reliable 3-Phase</option>
              <option value="1phase">🔌 Single Phase</option>
              <option value="generator">⛽ Generator</option>
            </select>
            
            <label className="flex items-center p-4 md:p-5 bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl md:rounded-2xl cursor-pointer hover:shadow-lg transition-all hover:border-emerald-300">
              <input
                type="checkbox"
                checked={newBiz.pos}
                onChange={e => setNewBiz({...newBiz, pos: e.target.checked})}
                className="mr-3 md:mr-4 w-6 h-6 md:w-7 md:h-7 rounded-lg shadow-md accent-emerald-500"
              />
              <span className="text-lg md:text-xl font-bold text-emerald-800">💳 POS/Card Payments</span>
            </label>
            
            <input
              placeholder="🖼️ Photo URL (optional)"
              value={newBiz.photo}
              onChange={e => setNewBiz({...newBiz, photo: e.target.value})}
              className="w-full p-4 md:p-5 text-base md:text-lg border-2 border-gray-200 rounded-xl md:rounded-2xl focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
            />
          </div>

          {selectedLngLat && (
            <div className="mt-6 md:mt-8 p-4 md:p-6 bg-gradient-to-r from-emerald-100 via-green-100 to-emerald-200 border-4 border-emerald-400 rounded-2xl md:rounded-3xl shadow-2xl">
              <div className="font-black text-xl md:text-2xl text-emerald-900 mb-2">📍 GPS LOCKED</div>
              <div className="text-xl md:text-2xl font-mono text-emerald-800 break-all">
                {selectedLngLat[1].toFixed(6)}°, {selectedLngLat[0].toFixed(6)}°
              </div>
              <div className="text-sm text-emerald-700 mt-2">You can drag the red marker to adjust</div>
            </div>
          )}

          {!selectedLngLat && (
            <div className="mt-4 md:mt-6 p-4 md:p-5 bg-amber-100 border-2 border-amber-300 rounded-xl md:rounded-2xl text-center font-medium text-amber-800">
              👆 Click map to set GPS location
            </div>
          )}

          <div className="mt-8 md:mt-10 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-6 border-t-2 border-gray-200">
            <button
              onClick={saveBusiness}
              disabled={!newBiz.name.trim() || !selectedLngLat}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 md:py-5 px-6 md:px-8 rounded-2xl md:rounded-3xl font-black text-lg md:text-xl shadow-2xl hover:shadow-3xl transition-all transform hover:-translate-y-2 active:scale-95"
            >
              🌟 Save to LIVE Map!
            </button>
            <button
              onClick={() => {
                setShowAdmin(false);
                setSelectedLngLat(null);
                setNewBiz({ name: '', category: '', power: '3phase', pos: false, photo: '' });
                if (tempMarker.current) {
                  tempMarker.current.remove();
                  tempMarker.current = null;
                }
                setSaveStatus('');
              }}
              className="px-8 md:px-10 py-4 md:py-5 bg-gradient-to-r from-slate-400 to-gray-500 hover:from-slate-500 hover:to-gray-600 text-white rounded-2xl md:rounded-3xl font-black shadow-xl hover:shadow-2xl transition-all transform hover:-translate-y-1"
            >
              ❌ Cancel
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
        className="fixed bottom-6 md:bottom-8 right-6 md:right-8 bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-600 hover:via-teal-600 hover:to-emerald-700 text-white p-4 md:p-6 rounded-2xl md:rounded-3xl shadow-2xl hover:shadow-3xl z-20 transition-all transform hover:scale-110 active:scale-95 border-4 border-white/30 backdrop-blur-sm"
      >
        <div className="text-xl md:text-2xl mb-1">💬</div>
        <div className="text-xs md:text-sm font-bold tracking-wider">SHARE</div>
      </a>

      {/* 📊 STATS */}
      <div className="fixed bottom-6 left-4 md:left-6 bg-black/85 backdrop-blur-2xl text-white p-4 md:p-6 rounded-2xl md:rounded-3xl text-xs md:text-sm font-mono z-10 border border-white/40 shadow-2xl max-w-xs">
        <div className="font-bold text-base md:text-lg mb-2">📊 Live Stats</div>
        <div className="space-y-1">
          <div>🏪 {filteredBusinesses.length}/{businesses.length} businesses</div>
          <div>🛰️ {lat}, {lng}</div>
          <div>🔍 {zoom}x | 🎢 {Math.round(pitch)}°</div>
          <div className={`font-bold mt-2 px-3 py-1 rounded-full text-xs inline-block ${
            isAdmin 
              ? 'bg-emerald-500 text-white' 
              : 'bg-blue-500 text-white'
          }`}>
            {isAdmin ? '👑 ADMIN MODE' : '🌍 PUBLIC VIEW'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;