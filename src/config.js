// Everything a non-programmer might want to change lives here (and in src/story/script.js).
export const CONFIG = {
  // From the wedding card: https://mdshamoon.github.io/wedding-card/wedding
  title: 'Shamoon & Alina',
  subtitle: 'The Road to Nikah · A Kichha Story',
  monogram: 'S&A',
  groomName: 'Shamoon',
  groomFull: 'Mohd Shamoon',
  groomFather: 'Ayub Ahmad',
  brideName: 'Alina',
  brideFull: 'Alina Fatima',
  brideFather: 'Shakeel Malik',
  year: 2027,
  dates: {
    arrival: 'Monday · 22 March 2027',
    haldi: 'Tuesday · 23 March 2027',
    nikah: 'Wednesday · 24 March 2027',
    nikahTime: '11:00 AM onwards',
    walima: 'Thursday · 25 March 2027',
    walimaTime: '7:00 PM onwards',
  },
  venues: {
    home: 'Home, Kichha',
    nikah: 'Blessing Garden, Baheri, Uttar Pradesh',
    walima: 'Grand Heritage, Kichha, Uttarakhand',
  },
  // Satellite imagery for the ground. Esri World Imagery is used for this personal, non-commercial game
  // with attribution. To use your own provider, change url/attribution (keep {z}/{x}/{y}).
  tiles: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics · Roads © OpenStreetMap contributors · Buildings: Overture Maps (Google Open Buildings, Microsoft, OSM)',
  },
};

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

export const QUALITY = (() => {
  let q = isMobile ? 'low' : 'high';
  try { q = localStorage.getItem('dr.quality') || q; } catch (e) { /* storage blocked */ }
  const presets = {
    low: { pixelRatio: Math.min(1.25, devicePixelRatio), shadowMap: 1024, shadows: true, viewDist: 900, treeDist: 450, detailZoom: 17, aa: false },
    high: { pixelRatio: Math.min(2, devicePixelRatio), shadowMap: 2048, shadows: true, viewDist: 1600, treeDist: 800, detailZoom: 18, aa: true },
  };
  return { name: q, isMobile, ...presets[q] };
})();
