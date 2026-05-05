import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { createBusiness, fetchBusinesses, nhostGraphqlUrl } from './lib/nhost';
import 'mapbox-gl/dist/mapbox-gl.css';
import './App.css';

const FREETOWN_CENTER = [-13.2344, 8.4844];
const FREETOWN_INITIAL_ZOOM = 13;
const BUSINESS_SOURCE_ID = 'businesses';
const CLUSTER_LAYER_ID = 'business-clusters';
const CLUSTER_COUNT_LAYER_ID = 'business-cluster-count';
const BUSINESS_LAYER_ID = 'business-points';

const mapboxToken = process.env.REACT_APP_MAPBOX_TOKEN;

if (mapboxToken) {
  mapboxgl.accessToken = mapboxToken;
}

function businessToFeature(business) {
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [business.lng, business.lat]
    },
    properties: {
      id: business.id,
      name: business.name || 'Unnamed business',
      category: business.category || 'General',
      power: business.power || 'unknown',
      pos: Boolean(business.pos),
      photo: business.photo || ''
    }
  };
}

function businessesToGeoJson(businesses) {
  return {
    type: 'FeatureCollection',
    features: businesses
      .filter(business => Number.isFinite(business.lng) && Number.isFinite(business.lat))
      .map(businessToFeature)
  };
}

function popupNode(properties) {
  const wrapper = document.createElement('div');
  wrapper.className = 'business-popup';

  const title = document.createElement('h3');
  title.textContent = properties.name;
  wrapper.appendChild(title);

  const category = document.createElement('p');
  category.textContent = properties.category;
  wrapper.appendChild(category);

  const meta = document.createElement('div');
  meta.className = 'business-popup__meta';

  const power = document.createElement('span');
  power.textContent = `Power: ${properties.power}`;
  meta.appendChild(power);

  const pos = document.createElement('span');
  pos.textContent = properties.pos ? 'POS available' : 'Cash only';
  meta.appendChild(pos);

  wrapper.appendChild(meta);

  if (properties.photo) {
    const image = document.createElement('img');
    image.src = properties.photo;
    image.alt = properties.name;
    wrapper.appendChild(image);
  }

  return wrapper;
}

function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const tempMarker = useRef(null);
  const isAdminRef = useRef(false);
  const showAdminRef = useRef(false);

  const [lng, setLng] = useState(FREETOWN_CENTER[0]);
  const [lat, setLat] = useState(FREETOWN_CENTER[1]);
  const [zoom, setZoom] = useState(13);
  const [pitch, setPitch] = useState(0);
  const [businesses, setBusinesses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedLngLat, setSelectedLngLat] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [loadStatus, setLoadStatus] = useState('');
  const [newBiz, setNewBiz] = useState({
    name: '',
    category: '',
    power: '3phase',
    pos: false,
    photo: ''
  });

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    showAdminRef.current = showAdmin;
  }, [showAdmin]);

  const filteredBusinesses = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return businesses.filter(business => {
      const matchesSearch =
        !normalizedSearch ||
        business.name?.toLowerCase().includes(normalizedSearch) ||
        business.category?.toLowerCase().includes(normalizedSearch);
      const matchesCategory = filterCategory === 'all' || business.category === filterCategory;

      return matchesSearch && matchesCategory;
    });
  }, [businesses, filterCategory, search]);

  const categories = useMemo(
    () => ['all', ...new Set(businesses.map(business => business.category).filter(Boolean))],
    [businesses]
  );

  const whatsappShareUrl = useMemo(() => {
    const shareText = `Freetown Business Map - live GPS directory ${window.location.href}`;
    return `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  }, []);

  const updateBusinessSource = useCallback(nextBusinesses => {
    const source = map.current?.getSource(BUSINESS_SOURCE_ID);
    if (source) {
      source.setData(businessesToGeoJson(nextBusinesses));
    }
  }, []);

  const loadBusinesses = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoadStatus('Syncing with Nhost...');
    }

    try {
      const nextBusinesses = await fetchBusinesses();
      setBusinesses(nextBusinesses);
      setLoadStatus('');
      return nextBusinesses;
    } catch (error) {
      console.error('Nhost load failed:', error);
      setLoadStatus(`Nhost sync failed: ${error.message}`);
      return [];
    }
  }, []);

  const addBusinessLayers = useCallback(() => {
    if (!map.current || map.current.getSource(BUSINESS_SOURCE_ID)) return;

    map.current.addSource(BUSINESS_SOURCE_ID, {
      type: 'geojson',
      data: businessesToGeoJson([]),
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 48
    });

    map.current.addLayer({
      id: CLUSTER_LAYER_ID,
      type: 'circle',
      source: BUSINESS_SOURCE_ID,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#10b981', 20, '#f59e0b', 50, '#ef4444'],
        'circle-radius': ['step', ['get', 'point_count'], 18, 20, 24, 50, 32],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.current.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: BUSINESS_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 13
      },
      paint: {
        'text-color': '#ffffff'
      }
    });

    map.current.addLayer({
      id: BUSINESS_LAYER_ID,
      type: 'circle',
      source: BUSINESS_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': [
          'case',
          ['to-boolean', ['get', 'pos']],
          '#10b981',
          ['==', ['get', 'power'], '3phase'],
          '#3b82f6',
          '#f59e0b'
        ],
        'circle-radius': 9,
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff'
      }
    });

    map.current.on('click', CLUSTER_LAYER_ID, event => {
      const features = map.current.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID]
      });
      const clusterId = features[0].properties.cluster_id;
      const source = map.current.getSource(BUSINESS_SOURCE_ID);

      source.getClusterExpansionZoom(clusterId, (error, nextZoom) => {
        if (error) return;
        map.current.easeTo({
          center: features[0].geometry.coordinates,
          zoom: nextZoom
        });
      });
    });

    map.current.on('click', BUSINESS_LAYER_ID, event => {
      const feature = event.features[0];
      new mapboxgl.Popup({ offset: 18, maxWidth: '320px' })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(popupNode(feature.properties))
        .addTo(map.current);
    });

    [CLUSTER_LAYER_ID, BUSINESS_LAYER_ID].forEach(layerId => {
      map.current.on('mouseenter', layerId, () => {
        map.current.getCanvas().style.cursor = 'pointer';
      });
      map.current.on('mouseleave', layerId, () => {
        map.current.getCanvas().style.cursor = '';
      });
    });
  }, []);

  const initializeMap = useCallback(() => {
    if (map.current || !mapboxToken) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: FREETOWN_CENTER,
      zoom: FREETOWN_INITIAL_ZOOM,
      pitch: 35,
      bearing: 0
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.current.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
      }),
      'bottom-right'
    );

    map.current.on('load', async () => {
      addBusinessLayers();

      const layers = map.current.getStyle().layers;
      const labelLayerId = layers.find(layer => layer.type === 'symbol' && layer.layout?.['text-field'])?.id;

      if (labelLayerId && !map.current.getLayer('3d-buildings')) {
        map.current.addLayer(
          {
            id: '3d-buildings',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 15,
            paint: {
              'fill-extrusion-color': '#cccccc',
              'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'height']],
              'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.05, ['get', 'min_height']],
              'fill-extrusion-opacity': 0.7
            }
          },
          labelLayerId
        );
      }

      const nextBusinesses = await loadBusinesses();
      updateBusinessSource(nextBusinesses);
      map.current.resize();
    });

    map.current.on('click', event => {
      if (!isAdminRef.current || !showAdminRef.current) return;

      const clickedBusinessFeature = map.current.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER_ID, BUSINESS_LAYER_ID]
      });
      if (clickedBusinessFeature.length) return;

      if (tempMarker.current) {
        tempMarker.current.remove();
      }

      setSelectedLngLat([event.lngLat.lng, event.lngLat.lat]);

      tempMarker.current = new mapboxgl.Marker({
        color: '#ef4444',
        draggable: true
      })
        .setLngLat(event.lngLat)
        .addTo(map.current);

      tempMarker.current.on('dragend', () => {
        const nextLngLat = tempMarker.current.getLngLat();
        setSelectedLngLat([nextLngLat.lng, nextLngLat.lat]);
      });
    });

    map.current.on('move', () => {
      const center = map.current.getCenter();
      setLng(center.lng.toFixed(4));
      setLat(center.lat.toFixed(4));
      setZoom(map.current.getZoom().toFixed(2));
      setPitch(map.current.getPitch());
    });
  }, [addBusinessLayers, loadBusinesses, updateBusinessSource]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsAdmin(urlParams.get('edit') === 'true');
  }, []);

  useEffect(() => {
    initializeMap();

    return () => {
      if (tempMarker.current) {
        tempMarker.current.remove();
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initializeMap]);

  useEffect(() => {
    updateBusinessSource(filteredBusinesses);
  }, [filteredBusinesses, updateBusinessSource]);

  useEffect(() => {
    const syncTimer = window.setInterval(async () => {
      const nextBusinesses = await loadBusinesses({ quiet: true });
      updateBusinessSource(nextBusinesses);
    }, 15000);

    return () => window.clearInterval(syncTimer);
  }, [loadBusinesses, updateBusinessSource]);

  useEffect(() => {
    const handleResize = () => {
      map.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const saveBusiness = async () => {
    if (!selectedLngLat || !newBiz.name.trim()) {
      setSaveStatus('Name and map location are required.');
      window.setTimeout(() => setSaveStatus(''), 3000);
      return;
    }

    setSaveStatus('Saving to Nhost...');

    const payload = {
      name: newBiz.name.trim(),
      category: newBiz.category.trim() || 'General',
      power: newBiz.power,
      pos: newBiz.pos,
      lng: selectedLngLat[0],
      lat: selectedLngLat[1],
      photo: newBiz.photo.trim() || null
    };

    try {
      await createBusiness(payload);
      const nextBusinesses = await loadBusinesses({ quiet: true });
      updateBusinessSource(nextBusinesses);

      setNewBiz({ name: '', category: '', power: '3phase', pos: false, photo: '' });
      setSelectedLngLat(null);
      setSaveStatus('Business saved to Nhost.');

      if (tempMarker.current) {
        tempMarker.current.remove();
        tempMarker.current = null;
      }

      window.setTimeout(() => {
        setSaveStatus('');
        setShowAdmin(false);
      }, 1800);
    } catch (error) {
      console.error('Nhost save failed:', error);
      setSaveStatus(`Save failed: ${error.message}`);
      window.setTimeout(() => setSaveStatus(''), 5000);
    }
  };

  const closeAdmin = () => {
    setShowAdmin(false);
    setSelectedLngLat(null);
    setNewBiz({ name: '', category: '', power: '3phase', pos: false, photo: '' });
    setSaveStatus('');

    if (tempMarker.current) {
      tempMarker.current.remove();
      tempMarker.current = null;
    }
  };

  return (
    <div className="app-shell h-screen bg-slate-950 relative overflow-hidden">
      <div className="app-header fixed top-4 left-4 right-4 bg-white/95 backdrop-blur-xl p-4 md:p-5 rounded-2xl shadow-2xl z-30 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border border-white/50">
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900">
            Freetown Business Map
          </h1>
          <p className="text-sm md:text-base text-slate-600 font-semibold mt-1">
            Mapbox clustering + Nhost GraphQL • {filteredBusinesses.length}/{businesses.length} businesses
          </p>
          {loadStatus && <p className="text-xs md:text-sm text-amber-700 mt-1">{loadStatus}</p>}
        </div>

        {isAdmin && (
          <button
            onClick={() => (showAdmin ? closeAdmin() : setShowAdmin(true))}
            aria-pressed={showAdmin}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 md:px-6 py-3 rounded-xl font-black text-sm md:text-base shadow-xl transition-all"
          >
            {showAdmin ? 'Close Admin' : 'Add Business'}
          </button>
        )}
      </div>

      <div className="search-panel fixed top-28 md:top-32 left-4 md:left-6 right-4 md:right-6 max-w-2xl z-20 space-y-3">
        <input
          placeholder="Search shops, markets, restaurants..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          aria-label="Search businesses"
          className="w-full p-4 md:p-5 text-base md:text-lg bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border-2 border-white/60 hover:border-emerald-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-200 transition-all"
        />

        <div className="category-strip flex flex-wrap gap-2 bg-white/90 backdrop-blur-xl p-3 rounded-xl shadow-xl border border-white/50">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setFilterCategory(category)}
              className={`px-3 py-1.5 rounded-lg font-semibold text-sm transition-all ${
                filterCategory === category
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800'
              }`}
            >
              {category === 'all' ? 'All Categories' : category}
            </button>
          ))}
        </div>
      </div>

      {showAdmin && (
        <div className="admin-panel fixed top-1/2 right-4 md:right-6 transform -translate-y-1/2 w-[calc(100%-2rem)] md:w-96 lg:w-[430px] max-h-[85vh] overflow-y-auto bg-white/98 backdrop-blur-3xl p-6 rounded-2xl shadow-2xl z-40 border-2 border-white/70">
          <h3 className="text-xl md:text-2xl font-black mb-6 text-slate-900">Add Freetown Business</h3>

          {saveStatus && (
            <div className="mb-4 p-4 rounded-xl font-bold text-center bg-slate-100 text-slate-800 border-2 border-slate-200">
              {saveStatus}
            </div>
          )}

          <div className="space-y-4">
            <input
              placeholder="Business name *"
              value={newBiz.name}
              onChange={event => setNewBiz({ ...newBiz, name: event.target.value })}
              className="w-full p-4 text-base border-2 border-slate-200 rounded-xl focus:border-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-100 font-semibold"
            />

            <input
              placeholder="Category"
              value={newBiz.category}
              onChange={event => setNewBiz({ ...newBiz, category: event.target.value })}
              className="w-full p-4 text-base border-2 border-slate-200 rounded-xl focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100"
            />

            <select
              value={newBiz.power}
              onChange={event => setNewBiz({ ...newBiz, power: event.target.value })}
              className="w-full p-4 text-base border-2 border-slate-200 rounded-xl focus:border-orange-400 focus:outline-none focus:ring-4 focus:ring-orange-100 appearance-none bg-white"
            >
              <option value="3phase">Reliable 3-phase</option>
              <option value="1phase">Single phase</option>
              <option value="generator">Generator</option>
            </select>

            <label className="flex items-center p-4 bg-emerald-50 border-2 border-emerald-200 rounded-xl cursor-pointer hover:shadow-lg transition-all hover:border-emerald-300">
              <input
                type="checkbox"
                checked={newBiz.pos}
                onChange={event => setNewBiz({ ...newBiz, pos: event.target.checked })}
                className="mr-3 w-6 h-6 rounded-lg shadow-md accent-emerald-500"
              />
              <span className="text-base font-bold text-emerald-800">POS/Card payments</span>
            </label>

            <input
              placeholder="Photo URL, optional"
              value={newBiz.photo}
              onChange={event => setNewBiz({ ...newBiz, photo: event.target.value })}
              className="w-full p-4 text-base border-2 border-slate-200 rounded-xl focus:border-purple-400 focus:outline-none focus:ring-4 focus:ring-purple-100"
            />
          </div>

          {selectedLngLat ? (
            <div className="mt-6 p-4 bg-emerald-100 border-2 border-emerald-300 rounded-2xl shadow-xl">
              <div className="font-black text-lg text-emerald-900 mb-2">GPS selected</div>
              <div className="text-base font-mono text-emerald-800 break-all">
                {selectedLngLat[1].toFixed(6)}, {selectedLngLat[0].toFixed(6)}
              </div>
              <div className="text-sm text-emerald-700 mt-2">Drag the red marker to adjust.</div>
            </div>
          ) : (
            <div className="mt-5 p-4 bg-amber-100 border-2 border-amber-300 rounded-xl text-center font-medium text-amber-800">
              Click the map to set the GPS location.
            </div>
          )}

          <div className="mt-8 flex flex-col sm:flex-row gap-3 pt-6 border-t-2 border-slate-200">
            <button
              onClick={saveBusiness}
              disabled={!newBiz.name.trim() || !selectedLngLat}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 px-6 rounded-2xl font-black text-base shadow-xl transition-all"
            >
              Save to Nhost
            </button>
            <button
              onClick={closeAdmin}
              className="px-8 py-4 bg-slate-500 hover:bg-slate-600 text-white rounded-2xl font-black shadow-xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!mapboxToken && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950 text-white p-6 text-center">
          <div>
            <h2 className="text-2xl font-black mb-3">Mapbox token missing</h2>
            <p>Set REACT_APP_MAPBOX_TOKEN in the client environment.</p>
          </div>
        </div>
      )}

      {!nhostGraphqlUrl && (
        <div className="fixed bottom-28 left-4 z-30 max-w-md bg-amber-100 border-2 border-amber-300 text-amber-900 p-4 rounded-xl shadow-xl font-semibold">
          Nhost is not configured yet. Set REACT_APP_NHOST_GRAPHQL_URL, or set REACT_APP_NHOST_SUBDOMAIN and REACT_APP_NHOST_REGION.
        </div>
      )}

      <div ref={mapContainer} className="absolute inset-0" />

      <a
        href={whatsappShareUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share Freetown Business Map on WhatsApp"
        className="share-button fixed bottom-6 right-20 md:right-24 bg-emerald-600 hover:bg-emerald-700 text-white p-4 rounded-2xl shadow-2xl z-20 transition-all border-2 border-white/30"
      >
        Share
      </a>

      <div className="stats-panel fixed bottom-6 left-4 md:left-6 bg-black/85 backdrop-blur-2xl text-white p-4 rounded-2xl text-xs md:text-sm font-mono z-10 border border-white/40 shadow-2xl max-w-xs">
        <div className="font-bold text-base mb-2">Live Stats</div>
        <div className="space-y-1">
          <div>{filteredBusinesses.length}/{businesses.length} businesses</div>
          <div>{lat}, {lng}</div>
          <div>{zoom}x | {Math.round(pitch)} deg</div>
          <div className={`font-bold mt-2 px-3 py-1 rounded-full text-xs inline-block ${isAdmin ? 'bg-emerald-600' : 'bg-blue-600'}`}>
            {isAdmin ? 'ADMIN MODE' : 'PUBLIC VIEW'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
