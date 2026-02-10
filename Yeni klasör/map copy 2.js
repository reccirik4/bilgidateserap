// ============================================================
// MAP.JS
// Museum Quest — Google Maps, konum takibi, marker, mesafe, navigasyon
// Bağımlılıklar: firebase-config.js (db)
//                database.js (aktifOyunculariDinle)
//                github-storage.js (window.oyunLokasyonlari)
//                ui.js (ekranGoster, bildirimGoster, formatMesafe, formatZorluk, mekanDetayAc/Kapat, htmlEscape)
//                auth.js (mevcutKullanici, kullaniciBilgileri)
// ============================================================

// Global harita değişkenleri
var harita = null;                      // Google Maps nesnesi
var kullaniciMarker = null;             // Kullanıcının konum marker'ı
var konumWatchId = null;                // watchPosition ID
var mevcutKonum = { lat: null, lng: null };  // Son bilinen konum
var lokasyonMarkerlar = {};             // locationId → marker
var directionsService = null;           // Google yön servisi
var directionsRenderer = null;          // Google yön gösterici

// Mekan detay için geçici değişkenler
var mevcutMekanId = null;
var mevcutMekanLat = null;
var mevcutMekanLng = null;
var mevcutMekanVeri = null;

// Konum takip ayarları
var KONUM_AYARLARI = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000
};

// ──────────────────────────────────────────────
// HARİTA HAZIR (Google Maps callback)
// ──────────────────────────────────────────────
function haritaHazir() {
    console.log("[map.js] Google Maps API yüklendi, harita başlatılıyor...");

    var haritaContainer = document.getElementById('harita-container');
    if (!haritaContainer) {
        console.error("[map.js] harita-container bulunamadı!");
        return;
    }

    // Harita container gizliyse geçici olarak görünür yap (boyut hesaplaması için)
    var ekranHarita = document.getElementById('ekran-harita');
    var geciciGorunur = false;
    if (ekranHarita && ekranHarita.classList.contains('gizli')) {
        geciciGorunur = true;
        ekranHarita.style.position = 'absolute';
        ekranHarita.style.left = '-9999px';
        ekranHarita.style.display = 'block';
        ekranHarita.classList.remove('gizli');
    }

    // Londra merkezli başlat
    harita = new google.maps.Map(haritaContainer, {
        center: { lat: 51.509, lng: -0.126 },
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER
        },
        gestureHandling: 'greedy'
    });

    // Geçici görünürlüğü geri al
    if (geciciGorunur && ekranHarita) {
        ekranHarita.classList.add('gizli');
        ekranHarita.style.position = '';
        ekranHarita.style.left = '';
        ekranHarita.style.display = '';
    }

    // Directions servisleri
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: true,
        polylineOptions: {
            strokeColor: '#b8860b',
            strokeWeight: 4,
            strokeOpacity: 0.8
        }
    });
    directionsRenderer.setMap(harita);

    // Konum takibini başlat
    konumTakibiBaslat();

    // Lokasyonları haritaya ekle (veriler yüklenmişse)
    if (window.oyunLokasyonlari && window.oyunLokasyonlari.length > 0) {
        lokasyonlariHaritayaEkle();
    } else {
        // Veriler henüz yüklenmemiş olabilir, biraz bekle
        setTimeout(function() {
            lokasyonlariHaritayaEkle();
        }, 2000);
    }

    console.log("[map.js] Harita başlatıldı.");
}

// ──────────────────────────────────────────────
// KOYU TEMA
// ──────────────────────────────────────────────
function haritaKoyuTema() {
    return [
        { elementType: 'geometry', stylers: [{ color: '#0a0a18' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a18' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#555577' }] },
        { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#1e1e3a' }] },
        { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#444466' }] },
        { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0f0f24' }] },
        { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#12122a' }] },
        { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#666688' }] },
        { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0d1f0d' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1a1a3a' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e1e3a' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#22224a' }] },
        { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a5a' }] },
        { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#16163a' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#060618' }] },
        { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#333366' }] }
    ];
}

// ──────────────────────────────────────────────
// KONUM TAKİBİ
// ──────────────────────────────────────────────
function konumTakibiBaslat() {
    console.log("[map.js] Konum takibi başlatılıyor...");

    if (!navigator.geolocation) {
        bildirimGoster("Tarayıcınız konum desteği sunmuyor.", "hata");
        console.error("[map.js] Geolocation desteklenmiyor.");
        return;
    }

    // Önce tek seferlik konum al
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            konumGuncelle(pos);
            // Haritayı kullanıcıya merkezle
            if (harita) {
                harita.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            }
        },
        function(hata) {
            konumHatasi(hata);
        },
        KONUM_AYARLARI
    );

    // Sürekli takip
    konumWatchId = navigator.geolocation.watchPosition(
        function(pos) {
            konumGuncelle(pos);
        },
        function(hata) {
            konumHatasi(hata);
        },
        KONUM_AYARLARI
    );
}

function konumGuncelle(position) {
    mevcutKonum.lat = position.coords.latitude;
    mevcutKonum.lng = position.coords.longitude;

    // Kullanıcı marker'ı güncelle
    if (harita) {
        if (!kullaniciMarker) {
            kullaniciMarker = new google.maps.Marker({
                position: { lat: mevcutKonum.lat, lng: mevcutKonum.lng },
                map: harita,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#3b82f6',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 3
                },
                zIndex: 999,
                title: 'Sen buradasın'
            });

            // Mavi daire (accuracy göstergesi)
            new google.maps.Circle({
                strokeColor: '#3b82f6',
                strokeOpacity: 0.3,
                strokeWeight: 1,
                fillColor: '#3b82f6',
                fillOpacity: 0.08,
                map: harita,
                center: { lat: mevcutKonum.lat, lng: mevcutKonum.lng },
                radius: position.coords.accuracy || 50
            });
        } else {
            kullaniciMarker.setPosition({ lat: mevcutKonum.lat, lng: mevcutKonum.lng });
        }
    }
}

function konumHatasi(hata) {
    var mesajlar = {
        1: "Konum izni reddedildi. Ayarlardan izin verin.",
        2: "Konum alınamadı. GPS sinyali zayıf olabilir.",
        3: "Konum alma zaman aşımına uğradı."
    };
    var mesaj = mesajlar[hata.code] || "Konum hatası oluştu.";
    console.warn("[map.js] Konum hatası:", hata.code, hata.message);
    bildirimGoster(mesaj, "uyari");
}

// Konuma merkezle butonu
function konumaMerkezle() {
    if (mevcutKonum.lat && mevcutKonum.lng && harita) {
        harita.panTo({ lat: mevcutKonum.lat, lng: mevcutKonum.lng });
        harita.setZoom(16);
    } else {
        bildirimGoster("Konum henüz alınamadı.", "uyari");
    }
}

// ──────────────────────────────────────────────
// LOKASYONLARI HARİTAYA EKLE
// ──────────────────────────────────────────────
function lokasyonlariHaritayaEkle() {
    console.log("[map.js] Lokasyonlar haritaya ekleniyor...", window.oyunLokasyonlari.length, "adet");

    if (!harita || !window.oyunLokasyonlari) return;

    for (var i = 0; i < window.oyunLokasyonlari.length; i++) {
        var lok = window.oyunLokasyonlari[i];

        if (!lok.isActive) continue;

        var zorluk = formatZorluk(lok.difficulty);

        var marker = new google.maps.Marker({
            position: { lat: lok.latitude, lng: lok.longitude },
            map: harita,
            title: lok.name,
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="48" viewBox="0 0 40 48">' +
                    '<path d="M20 0 C8.95 0 0 8.95 0 20 C0 34 20 48 20 48 S40 34 40 20 C40 8.95 31.05 0 20 0Z" fill="#d4a017"/>' +
                    '<circle cx="20" cy="18" r="10" fill="#ffffff"/>' +
                    '<text x="20" y="23" text-anchor="middle" font-size="14" fill="#d4a017">🏛</text>' +
                    '</svg>'
                ),
                scaledSize: new google.maps.Size(40, 48),
                anchor: new google.maps.Point(20, 48)
            },
            zIndex: 10
        });

        // Marker'a locationId ekle (closure ile)
        (function(lokasyon, m) {
            m.addListener('click', function() {
                markeraTiklandi(lokasyon);
            });
            lokasyonMarkerlar[lokasyon.id] = m;
        })(lok, marker);
    }

    console.log("[map.js] Lokasyonlar haritaya eklendi.");
}

// ──────────────────────────────────────────────
// MARKER'A TIKLANDI — MEKAN DETAY (BOTTOM SHEET)
// ──────────────────────────────────────────────
function markeraTiklandi(lokasyon) {
    console.log("[map.js] Marker tıklandı:", lokasyon.name);

    mevcutMekanId = lokasyon.id;
    mevcutMekanLat = lokasyon.latitude;
    mevcutMekanLng = lokasyon.longitude;
    mevcutMekanVeri = lokasyon;

    // Fotoğraf
    var fotoEl = document.getElementById('mekan-foto');
    if (fotoEl) {
        if (lokasyon.photoURL) {
            fotoEl.src = lokasyon.photoURL;
            fotoEl.classList.remove('gizli');
            fotoEl.onerror = function() { this.classList.add('gizli'); };
        } else {
            fotoEl.classList.add('gizli');
        }
    }

    // Başlık ve açıklama
    var baslikEl = document.getElementById('mekan-baslik');
    if (baslikEl) baslikEl.textContent = lokasyon.name;

    var aciklamaEl = document.getElementById('mekan-aciklama');
    if (aciklamaEl) aciklamaEl.textContent = lokasyon.description || '';

    // Zorluk
    var zorluk = formatZorluk(lokasyon.difficulty);
    var zorlukEl = document.getElementById('mekan-zorluk');
    if (zorlukEl) zorlukEl.innerHTML = zorluk.emoji + '<br><small style="font-size:0.7rem;">' + zorluk.metin + '</small>';

    // Soru sayısı
    var soruSayisiEl = document.getElementById('mekan-soru-sayisi');
    if (soruSayisiEl) soruSayisiEl.textContent = lokasyon.questionCount || '?';

    // Aktif oyuncu sayısı
    aktifOyuncuSayisiGuncelle(lokasyon.id);

    // Mesafe hesapla ve göster
    mekanMesafeGuncelle(lokasyon);

    // Bottom sheet aç
    mekanDetayAc();

    // Haritayı mekana merkezle
    if (harita) {
        harita.panTo({ lat: lokasyon.latitude, lng: lokasyon.longitude });
    }
}

// Mesafe güncelle
function mekanMesafeGuncelle(lokasyon) {
    var mesafeBilgiEl = document.getElementById('mekan-mesafe-bilgi');
    var oyunBtn = document.getElementById('mekan-oyun-btn');

    if (!mesafeBilgiEl || !oyunBtn) return;

    if (!mevcutKonum.lat || !mevcutKonum.lng) {
        mesafeBilgiEl.textContent = '📍 Konum alınıyor...';
        mesafeBilgiEl.className = 'mekan-mesafe-uyari uzak';
        oyunBtn.disabled = true;
        return;
    }

    var mesafe = mesafeHesapla(
        mevcutKonum.lat, mevcutKonum.lng,
        lokasyon.latitude, lokasyon.longitude
    );

    var entryRadius = lokasyon.entryRadius || 1000;

    if (mesafe <= entryRadius) {
        mesafeBilgiEl.innerHTML = '✅ Menzildesin! (' + formatMesafe(mesafe) + ')';
        mesafeBilgiEl.className = 'mekan-mesafe-uyari yakin';
        oyunBtn.disabled = false;
        oyunBtn.innerHTML = '🎮 Oyuna Gir';
    } else {
        var kalanMesafe = mesafe - entryRadius;
        mesafeBilgiEl.innerHTML = '🚶 Yaklaşman gerekiyor — ' + formatMesafe(mesafe) + ' uzaktasın';
        mesafeBilgiEl.className = 'mekan-mesafe-uyari uzak';
        oyunBtn.disabled = true;
        oyunBtn.innerHTML = '🔒 ' + formatMesafe(kalanMesafe) + ' daha yaklaş';
    }
}

// Aktif oyuncu sayısı
function aktifOyuncuSayisiGuncelle(locationId) {
    var el = document.getElementById('mekan-aktif-oyuncu');
    if (!el) return;

    dbOku('active_players/' + locationId).then(function(data) {
        var sayi = data ? Object.keys(data).length : 0;
        el.textContent = sayi;
    }).catch(function() {
        el.textContent = '0';
    });
}

// ──────────────────────────────────────────────
// MESAFE HESAPLA
// ──────────────────────────────────────────────
function mesafeHesapla(lat1, lng1, lat2, lng2) {
    if (!google || !google.maps || !google.maps.geometry) {
        // Fallback: Haversine formülü
        return haversineMesafe(lat1, lng1, lat2, lng2);
    }

    var nokta1 = new google.maps.LatLng(lat1, lng1);
    var nokta2 = new google.maps.LatLng(lat2, lng2);
    return google.maps.geometry.spherical.computeDistanceBetween(nokta1, nokta2);
}

// Haversine fallback
function haversineMesafe(lat1, lng1, lat2, lng2) {
    var R = 6371000; // Dünya yarıçapı (metre)
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ──────────────────────────────────────────────
// NAVİGASYON
// ──────────────────────────────────────────────
function navigasyonBaslat(hedefLat, hedefLng) {
    console.log("[map.js] Navigasyon başlatılıyor:", hedefLat, hedefLng);

    if (!mevcutKonum.lat || !mevcutKonum.lng) {
        bildirimGoster("Konumun henüz alınamadı.", "uyari");
        return;
    }

    if (!directionsService || !directionsRenderer) {
        bildirimGoster("Navigasyon servisi hazır değil.", "hata");
        return;
    }

    // Mekan detay açıksa kapat
    mekanDetayKapat();

    // Harita ekranına geç
    ekranGoster('ekran-harita');

    var istek = {
        origin: { lat: mevcutKonum.lat, lng: mevcutKonum.lng },
        destination: { lat: hedefLat, lng: hedefLng },
        travelMode: google.maps.TravelMode.WALKING
    };

    directionsService.route(istek, function(sonuc, durum) {
        if (durum === 'OK') {
            directionsRenderer.setDirections(sonuc);

            // Yürüme süresi bilgisi
            var bacak = sonuc.routes[0].legs[0];
            bildirimGoster("🚶 " + bacak.distance.text + " — " + bacak.duration.text, "bilgi");
        } else {
            console.error("[map.js] Navigasyon hatası:", durum);
            // Fallback: Google Maps'te aç
            navigasyonDisAc(hedefLat, hedefLng);
        }
    });
}

// Navigasyonu temizle
function navigasyonTemizle() {
    if (directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
    }
}

// Google Maps uygulamasında aç (fallback)
function navigasyonDisAc(hedefLat, hedefLng) {
    var url = 'https://www.google.com/maps/dir/?api=1' +
        '&origin=' + mevcutKonum.lat + ',' + mevcutKonum.lng +
        '&destination=' + hedefLat + ',' + hedefLng +
        '&travelmode=walking';
    window.open(url, '_blank');
}

// ──────────────────────────────────────────────
// AKTİF OYUNCULARI HARİTADA GÖSTER
// ──────────────────────────────────────────────
var aktifOyuncuMarkerlar = {};

function aktifOyunculariGoster(locationId) {
    // Önceki marker'ları temizle
    Object.keys(aktifOyuncuMarkerlar).forEach(function(key) {
        aktifOyuncuMarkerlar[key].setMap(null);
    });
    aktifOyuncuMarkerlar = {};

    aktifOyunculariDinle(locationId, function(oyuncular) {
        // Önceki marker'ları temizle
        Object.keys(aktifOyuncuMarkerlar).forEach(function(key) {
            aktifOyuncuMarkerlar[key].setMap(null);
        });
        aktifOyuncuMarkerlar = {};

        if (!oyuncular || !harita) return;

        Object.keys(oyuncular).forEach(function(uid) {
            // Kendini gösterme
            if (mevcutKullanici && uid === mevcutKullanici.uid) return;

            var oyuncu = oyuncular[uid];
            if (!oyuncu.latitude || !oyuncu.longitude) return;

            var marker = new google.maps.Marker({
                position: { lat: oyuncu.latitude, lng: oyuncu.longitude },
                map: harita,
                title: oyuncu.displayName || 'Oyuncu',
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#10b981',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                },
                zIndex: 50
            });

            // Tıklayınca bilgi göster
            var infoWindow = new google.maps.InfoWindow({
                content: '<div style="color:#333;font-size:13px;padding:4px;">' +
                    '<strong>' + htmlEscape(oyuncu.displayName) + '</strong><br>' +
                    'Seviye: ' + (oyuncu.xpLevel || 1) +
                    '</div>'
            });

            marker.addListener('click', function() {
                infoWindow.open(harita, marker);
            });

            aktifOyuncuMarkerlar[uid] = marker;
        });
    });
}

// ──────────────────────────────────────────────
// BİRLİKTE OYNA EKRANINA GİT
// ──────────────────────────────────────────────
function birlikteOynaEkraninaGit(locationId) {
    mekanDetayKapat();
    ekranGoster('ekran-birlikte-oyna');

    if (typeof yakinOyunculariGoster === 'function') {
        yakinOyunculariGoster(locationId);
    }
}

console.log("[map.js] Map modülü yüklendi.");