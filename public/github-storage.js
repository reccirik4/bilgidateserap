// ============================================================
// GITHUB-STORAGE.JS
// Museum Quest — GitHub'dan statik JSON verileri okuma/yazma
// v2.0 — Modüler şehir bazlı lazy loading
// Bağımlılıklar: github-parametreleri.js (kullaniciAdi, repoAdi, token, GITHUB_DOSYALARI)
//                ui.js (bildirimGoster)
// ============================================================

// Global statik veri değişkenleri
window.oyunLokasyonlari = [];
window.soruHavuzu = {};
window.odulListesi = [];
window.isletmeListesi = [];

// v2.0 — Modüler yapı değişkenleri
window.sehirIndex = null;        // museum-quest-index.json içeriği
window.mevcutSehir = null;       // Aktif şehir verisi { id, name, file, ... }
window.mevcutSehirVeri = null;   // Aktif şehir JSON içeriği { cityId, locations, ... }
window.yuklenenSorular = {};     // Lazy load edilmiş sorular cache: { locationId: [...] }
window.isletmelerYuklendi = false; // İşletmeler yüklendi mi flag

// SHA değerleri (güncelleme için gerekli)
var githubShaKayitlari = {};

// ──────────────────────────────────────────────
// GITHUB'DAN DOSYA OKU (todo.html kalıbıyla birebir)
// ──────────────────────────────────────────────
async function githubDosyaOku(dosya) {
    try {
        var response = await fetch(
            'https://api.github.com/repos/' + kullaniciAdi + '/' + repoAdi + '/contents/' + dosya, {
            headers: {
                'Authorization': 'token ' + token,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.ok) {
            var data = await response.json();
            var content = data.content;
            var decodedContent = atob(content);
            var utf8Content = decodeURIComponent(escape(decodedContent));

            // SHA kaydet (güncelleme için)
            githubShaKayitlari[dosya] = data.sha;

            console.log("[github-storage.js] Dosya okundu:", dosya, "SHA:", data.sha);
            return { icerik: JSON.parse(utf8Content), sha: data.sha };
        }

        if (response.status === 404) {
            console.warn("[github-storage.js] Dosya bulunamadı:", dosya);
            return { icerik: null, sha: null };
        }

        console.error("[github-storage.js] Okuma hatası:", response.status, dosya);
        return { icerik: null, sha: null };
    } catch (error) {
        console.error("[github-storage.js] GitHub okuma hatası:", dosya, error);
        return { icerik: null, sha: null };
    }
}

// ──────────────────────────────────────────────
// GITHUB'A DOSYA YAZ (todo.html kalıbıyla birebir)
// ──────────────────────────────────────────────
async function githubDosyaYaz(dosya, icerik, sha) {
    try {
        var jsonData = JSON.stringify(icerik, null, 2);
        var utf8Content = unescape(encodeURIComponent(jsonData));
        var encodedContent = btoa(utf8Content);

        // sha parametresi verilmediyse kayıtlı SHA'yı kullan
        var kulllanilacakSha = sha || githubShaKayitlari[dosya] || null;

        var body = {
            message: 'Museum Quest güncelleme - ' + new Date().toLocaleString('tr-TR'),
            content: encodedContent
        };

        if (kulllanilacakSha) {
            body.sha = kulllanilacakSha;
        }

        var response = await fetch(
            'https://api.github.com/repos/' + kullaniciAdi + '/' + repoAdi + '/contents/' + dosya, {
            method: 'PUT',
            headers: {
                'Authorization': 'token ' + token,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            var errorData = await response.json();
            console.error("[github-storage.js] Yazma hatası:", response.status, errorData);
            throw new Error('GitHub yazma hatası: ' + response.status);
        }

        // Yeni SHA'yı kaydet
        var resultData = await response.json();
        githubShaKayitlari[dosya] = resultData.content.sha;

        console.log("[github-storage.js] Dosya yazıldı:", dosya);
        return true;
    } catch (error) {
        console.error("[github-storage.js] GitHub yazma hatası:", dosya, error);
        return false;
    }
}

// ══════════════════════════════════════════════
// v2.0 — MODÜLER VERİ YÜKLEME SİSTEMİ
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
// ANA BAŞLATMA: index.json oku → GPS ile şehir bul → şehir yükle
// ──────────────────────────────────────────────
async function statikVerileriYukle() {
    console.log("[github-storage.js] v2.0 — Tüm şehirler yükleniyor...");

    try {
        // 1. Ana index dosyasını oku (1 API çağrısı)
        var indexSonuc = await githubDosyaOku(GITHUB_DOSYALARI.index);

        if (indexSonuc.icerik) {
            window.sehirIndex = indexSonuc.icerik;
            console.log("[github-storage.js] Index yüklendi. Şehir sayısı:", window.sehirIndex.cities.length);
        } else {
            console.warn("[github-storage.js] Index yüklenemedi, fallback kullanılacak.");
            window.sehirIndex = ornekIndex();
        }

        // 2. GPS ile en yakın şehri bul (mevcutSehir referansı için — işletmeler vb.)
        var secilenSehir = await enYakinSehriBul();
        window.mevcutSehir = secilenSehir;
        console.log("[github-storage.js] En yakın şehir:", secilenSehir.name, "(id:", secilenSehir.id + ")");

        // 3. TÜM aktif şehirlerin verilerini yükle ve lokasyonları birleştir
        window.oyunLokasyonlari = [];
        window.tumSehirVerileri = {};

        for (var i = 0; i < window.sehirIndex.cities.length; i++) {
            var sehir = window.sehirIndex.cities[i];
            if (!sehir.isActive) continue;

            try {
                var sehirSonuc = await githubDosyaOku(sehir.file);
                if (sehirSonuc.icerik && sehirSonuc.icerik.locations) {
                    // Her lokasyona şehir bilgisi ekle (quiz'de lazım olabilir)
                    for (var j = 0; j < sehirSonuc.icerik.locations.length; j++) {
                        sehirSonuc.icerik.locations[j].cityId = sehir.id;
                        sehirSonuc.icerik.locations[j].cityName = sehir.name;
                    }
                    window.oyunLokasyonlari = window.oyunLokasyonlari.concat(sehirSonuc.icerik.locations);
                    window.tumSehirVerileri[sehir.id] = sehirSonuc.icerik;
                    console.log("[github-storage.js] Şehir yüklendi:", sehir.name,
                        "Lokasyon:", sehirSonuc.icerik.locations.length);
                }
            } catch (sehirHata) {
                console.warn("[github-storage.js] Şehir yüklenemedi:", sehir.name, sehirHata);
            }
        }

        // En yakın şehrin verisini mevcutSehirVeri olarak ayarla
        window.mevcutSehirVeri = window.tumSehirVerileri[secilenSehir.id] || null;

        console.log("[github-storage.js] Tüm şehirler yüklendi. Toplam lokasyon:", window.oyunLokasyonlari.length);

    } catch (error) {
        console.error("[github-storage.js] Statik veri yükleme genel hata:", error);
        if (window.oyunLokasyonlari.length === 0) window.oyunLokasyonlari = ornekLokasyonlar();
        if (Object.keys(window.soruHavuzu).length === 0) window.soruHavuzu = ornekSorular();
        if (window.odulListesi.length === 0) window.odulListesi = ornekOduller();
        if (window.isletmeListesi.length === 0) window.isletmeListesi = ornekIsletmeler();
    }
}

// ──────────────────────────────────────────────
// GPS İLE EN YAKIN ŞEHRİ BUL
// ──────────────────────────────────────────────
function enYakinSehriBul() {
    return new Promise(function(resolve) {
        if (!window.sehirIndex || !window.sehirIndex.cities || window.sehirIndex.cities.length === 0) {
            console.warn("[github-storage.js] Şehir index boş, varsayılan İstanbul.");
            resolve({ id: "istanbul", name: "İstanbul", file: "city-istanbul.json", isletmelerFile: "city-istanbul-isletmeler.json", center: { lat: 41.0082, lng: 28.9784 }, zoom: 14, isActive: true });
            return;
        }

        // GPS konumu almayı dene
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    var lat = position.coords.latitude;
                    var lng = position.coords.longitude;
                    console.log("[github-storage.js] GPS konumu alındı:", lat, lng);

                    var enYakin = null;
                    var enKisaMesafe = Infinity;

                    for (var i = 0; i < window.sehirIndex.cities.length; i++) {
                        var sehir = window.sehirIndex.cities[i];
                        if (!sehir.isActive) continue;

                        var mesafe = gpsUzaklik(lat, lng, sehir.center.lat, sehir.center.lng);

                        if (mesafe < enKisaMesafe) {
                            enKisaMesafe = mesafe;
                            enYakin = sehir;
                        }
                    }

                    console.log("[github-storage.js] En yakın şehir:", enYakin.name, "Mesafe:", Math.round(enKisaMesafe / 1000) + "km");
                    resolve(enYakin);
                },
                function(hata) {
                    console.warn("[github-storage.js] GPS hatası, ilk aktif şehir seçiliyor:", hata.message);
                    // GPS yoksa ilk aktif şehri seç
                    for (var i = 0; i < window.sehirIndex.cities.length; i++) {
                        if (window.sehirIndex.cities[i].isActive) {
                            resolve(window.sehirIndex.cities[i]);
                            return;
                        }
                    }
                    resolve(window.sehirIndex.cities[0]);
                },
                { timeout: 5000, enableHighAccuracy: false }
            );
        } else {
            console.warn("[github-storage.js] Geolocation desteklenmiyor, ilk şehir seçiliyor.");
            for (var i = 0; i < window.sehirIndex.cities.length; i++) {
                if (window.sehirIndex.cities[i].isActive) {
                    resolve(window.sehirIndex.cities[i]);
                    return;
                }
            }
            resolve(window.sehirIndex.cities[0]);
        }
    });
}

// GPS mesafe hesaplama (Haversine — metre cinsinden)
function gpsUzaklik(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ──────────────────────────────────────────────
// ŞEHİR VERİSİ YÜKLE (city-xxx.json)
// ──────────────────────────────────────────────
async function sehirVerisiYukle(sehirBilgisi) {
    console.log("[github-storage.js] Şehir verisi yükleniyor:", sehirBilgisi.file);

    var sehirSonuc = await githubDosyaOku(sehirBilgisi.file);

    if (sehirSonuc.icerik) {
        window.mevcutSehirVeri = sehirSonuc.icerik;
        window.oyunLokasyonlari = sehirSonuc.icerik.locations || [];
        console.log("[github-storage.js] Şehir yüklendi:", sehirBilgisi.name,
            "Lokasyon:", window.oyunLokasyonlari.length);
    } else {
        console.warn("[github-storage.js] Şehir verisi yüklenemedi, fallback kullanılacak.");
        window.oyunLokasyonlari = ornekLokasyonlar();
    }

    // Soru havuzunu temizle (yeni şehir = yeni sorular)
    window.soruHavuzu = {};
    window.yuklenenSorular = {};

    // İşletmeleri temizle (yeni şehir = yeni işletmeler)
    window.odulListesi = [];
    window.isletmeListesi = [];
    window.isletmelerYuklendi = false;
}

// ──────────────────────────────────────────────
// ŞEHİR DEĞİŞTİR (kullanıcı başka şehre geçerse)
// ──────────────────────────────────────────────
async function sehirDegistir(sehirId) {
    console.log("[github-storage.js] Şehir değiştiriliyor:", sehirId);

    if (!window.sehirIndex || !window.sehirIndex.cities) {
        bildirimGoster("Şehir bilgisi bulunamadı.", "hata");
        return false;
    }

    var yeniSehir = null;
    for (var i = 0; i < window.sehirIndex.cities.length; i++) {
        if (window.sehirIndex.cities[i].id === sehirId) {
            yeniSehir = window.sehirIndex.cities[i];
            break;
        }
    }

    if (!yeniSehir) {
        bildirimGoster("Şehir bulunamadı: " + sehirId, "hata");
        return false;
    }

    window.mevcutSehir = yeniSehir;
    await sehirVerisiYukle(yeniSehir);

    // Haritayı yeni şehre merkezle
    if (typeof harita !== 'undefined' && harita) {
        harita.panTo({ lat: yeniSehir.center.lat, lng: yeniSehir.center.lng });
        harita.setZoom(yeniSehir.zoom || 14);
    }

    // Marker'ları yeniden yükle
    if (typeof lokasyonlariHaritayaEkle === 'function') {
        // Mevcut marker'ları temizle
        if (typeof lokasyonMarkerlar !== 'undefined') {
            Object.keys(lokasyonMarkerlar).forEach(function(key) {
                if (lokasyonMarkerlar[key]) lokasyonMarkerlar[key].setMap(null);
            });
            lokasyonMarkerlar = {};
        }
        lokasyonlariHaritayaEkle();
    }

    console.log("[github-storage.js] Şehir değiştirildi:", yeniSehir.name);
    return true;
}

// ──────────────────────────────────────────────
// LOKASYON SORULARINI LAZY LOAD ET
// Quiz başlayınca çağrılır — sadece o lokasyonun soruları yüklenir
// ──────────────────────────────────────────────
async function lokasyonSorulariniYukle(locationId) {
    console.log("[github-storage.js] Sorular lazy load ediliyor:", locationId);

    // Zaten yüklenmişse cache'ten döndür
    if (window.soruHavuzu[locationId] && window.soruHavuzu[locationId].length > 0) {
        console.log("[github-storage.js] Sorular cache'ten geldi:", locationId,
            window.soruHavuzu[locationId].length, "adet");
        return window.soruHavuzu[locationId];
    }

    // Lokasyonun questionsFile bilgisini bul
    var questionsFile = null;
    for (var i = 0; i < window.oyunLokasyonlari.length; i++) {
        if (window.oyunLokasyonlari[i].id === locationId) {
            questionsFile = window.oyunLokasyonlari[i].questionsFile;
            break;
        }
    }

    if (!questionsFile) {
        console.error("[github-storage.js] questionsFile bulunamadı:", locationId);
        // Fallback sorulara bak
        var fallback = ornekSorular();
        if (fallback[locationId]) {
            window.soruHavuzu[locationId] = fallback[locationId];
            return fallback[locationId];
        }
        return null;
    }

    // GitHub'dan soru dosyasını oku (1 API çağrısı)
    var soruSonuc = await githubDosyaOku(questionsFile);

    if (soruSonuc.icerik && Array.isArray(soruSonuc.icerik) && soruSonuc.icerik.length > 0) {
        window.soruHavuzu[locationId] = soruSonuc.icerik;
        window.yuklenenSorular[locationId] = true;
        console.log("[github-storage.js] Sorular yüklendi:", locationId,
            soruSonuc.icerik.length, "adet");
        return soruSonuc.icerik;
    } else {
        console.warn("[github-storage.js] Sorular yüklenemedi:", questionsFile, "Fallback deneniyor...");
        // Fallback
        var fallback = ornekSorular();
        if (fallback[locationId]) {
            window.soruHavuzu[locationId] = fallback[locationId];
            return fallback[locationId];
        }
        return null;
    }
}

// ──────────────────────────────────────────────
// ŞEHİR İŞLETMELERİNİ LAZY LOAD ET
// Ödül ekranı açılınca çağrılır
// ──────────────────────────────────────────────
async function sehirIsletmeleriniYukle() {
    // Zaten yüklendiyse tekrar yükleme
    if (window.isletmelerYuklendi && window.isletmeListesi.length > 0) {
        console.log("[github-storage.js] İşletmeler zaten yüklü.");
        return true;
    }

    if (!window.mevcutSehir || !window.mevcutSehir.isletmelerFile) {
        console.warn("[github-storage.js] İşletme dosyası bilgisi yok.");
        window.isletmeListesi = ornekIsletmeler();
        window.odulListesi = ornekOduller();
        return false;
    }

    console.log("[github-storage.js] İşletmeler lazy load ediliyor:", window.mevcutSehir.isletmelerFile);

    var sonuc = await githubDosyaOku(window.mevcutSehir.isletmelerFile);

    if (sonuc.icerik) {
        window.isletmeListesi = sonuc.icerik.isletmeler || [];
        window.odulListesi = sonuc.icerik.oduller || [];
        window.isletmelerYuklendi = true;
        console.log("[github-storage.js] İşletmeler yüklendi:",
            window.isletmeListesi.length, "işletme,",
            window.odulListesi.length, "ödül");
        return true;
    } else {
        console.warn("[github-storage.js] İşletmeler yüklenemedi, fallback kullanılacak.");
        window.isletmeListesi = ornekIsletmeler();
        window.odulListesi = ornekOduller();
        return false;
    }
}

// ══════════════════════════════════════════════
// FALLBACK ÖRNEK VERİLER
// ══════════════════════════════════════════════

function ornekIndex() {
    return {
        version: "2.0",
        cities: [
            { id: "istanbul", name: "İstanbul", file: "city-istanbul.json", isletmelerFile: "city-istanbul-isletmeler.json", locationCount: 5, center: { lat: 41.0082, lng: 28.9784 }, zoom: 14, isActive: true }
        ]
    };
}

function ornekLokasyonlar() {
    return [
        {
            id: "loc_001",
            name: "Topkapı Sarayı",
            description: "Osmanlı İmparatorluğu'nun 400 yıllık idare merkezi",
            questionsFile: "questions-loc_001.json",
            photoURL: "",
            latitude: 41.0115,
            longitude: 28.9833,
            difficulty: "medium",
            questionCount: 10,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_002",
            name: "Ayasofya",
            description: "537 yılında inşa edilen mimari şaheser",
            questionsFile: "questions-loc_002.json",
            photoURL: "",
            latitude: 41.0086,
            longitude: 28.9802,
            difficulty: "hard",
            questionCount: 2,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_003",
            name: "İstanbul Arkeoloji Müzeleri",
            description: "Üç müzeden oluşan dünyanın en büyük müze komplekslerinden biri",
            questionsFile: "questions-loc_003.json",
            photoURL: "",
            latitude: 41.0117,
            longitude: 28.9814,
            difficulty: "easy",
            questionCount: 1,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_004",
            name: "Basilika Sarnıcı",
            description: "532 yılında inşa edilen yeraltı su deposu",
            questionsFile: "questions-loc_004.json",
            photoURL: "",
            latitude: 41.0084,
            longitude: 28.9779,
            difficulty: "medium",
            questionCount: 1,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_005",
            name: "Türk ve İslam Eserleri Müzesi",
            description: "İbrahim Paşa Sarayı'nda konumlanan zengin koleksiyon",
            questionsFile: "questions-loc_005.json",
            photoURL: "",
            latitude: 41.0063,
            longitude: 28.9753,
            difficulty: "medium",
            questionCount: 1,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        }
    ];
}

function ornekSorular() {
    return {
        "loc_001": [
            { id: "q_001", text: "Topkapı Sarayı hangi yılda müzeye dönüştürüldü?", imageURL: null, type: "multiple_choice", difficulty: "medium", points: 25, timeLimit: 15, options: [ { text: "1924", correct: true }, { text: "1934", correct: false }, { text: "1938", correct: false }, { text: "1952", correct: false } ], explanation: "Topkapı Sarayı 3 Nisan 1924'te müzeye dönüştürüldü." },
            { id: "q_002", text: "Topkapı Sarayı'nın yapımına hangi padişah döneminde başlanmıştır?", imageURL: null, type: "multiple_choice", difficulty: "medium", points: 25, timeLimit: 15, options: [ { text: "Fatih Sultan Mehmed", correct: true }, { text: "Kanuni Sultan Süleyman", correct: false }, { text: "Yavuz Sultan Selim", correct: false }, { text: "II. Bayezid", correct: false } ], explanation: "Topkapı Sarayı'nın yapımına 1460'ta Fatih Sultan Mehmed döneminde başlanmıştır." }
        ],
        "loc_002": [
            { id: "q_101", text: "Ayasofya ilk olarak hangi yılda ibadete açılmıştır?", imageURL: null, type: "multiple_choice", difficulty: "medium", points: 25, timeLimit: 15, options: [ { text: "537", correct: true }, { text: "532", correct: false }, { text: "550", correct: false }, { text: "527", correct: false } ], explanation: "Ayasofya, 537 yılında Justinianus döneminde ibadete açılmıştır." }
        ],
        "loc_003": [
            { id: "q_201", text: "İstanbul Arkeoloji Müzeleri kaç müzeden oluşur?", imageURL: null, type: "multiple_choice", difficulty: "easy", points: 10, timeLimit: 15, options: [ { text: "3", correct: true }, { text: "2", correct: false }, { text: "5", correct: false }, { text: "4", correct: false } ], explanation: "Arkeoloji Müzesi, Eski Şark Eserleri Müzesi ve Çinili Köşk olmak üzere 3 müzeden oluşur." }
        ],
        "loc_004": [
            { id: "q_301", text: "Basilika Sarnıcı hangi yılda inşa edilmiştir?", imageURL: null, type: "multiple_choice", difficulty: "medium", points: 25, timeLimit: 15, options: [ { text: "532", correct: true }, { text: "537", correct: false }, { text: "500", correct: false }, { text: "560", correct: false } ], explanation: "Basilika Sarnıcı, 532 yılında I. Justinianus döneminde inşa edilmiştir." }
        ],
        "loc_005": [
            { id: "q_401", text: "Türk ve İslam Eserleri Müzesi hangi tarihi binada yer alır?", imageURL: null, type: "multiple_choice", difficulty: "medium", points: 25, timeLimit: 15, options: [ { text: "İbrahim Paşa Sarayı", correct: true }, { text: "Topkapı Sarayı", correct: false }, { text: "Dolmabahçe Sarayı", correct: false }, { text: "Çırağan Sarayı", correct: false } ], explanation: "Müze, Sultanahmet Meydanı'ndaki İbrahim Paşa Sarayı'nda konumlanmaktadır." }
        ]
    };
}

function ornekOduller() {
    return [
        { id: "reward_001", businessId: "biz_001", businessName: "Kahve Dünyası", businessLogo: "", title: "%25 indirimli kahve", description: "Tüm sıcak içeceklerde geçerli", photoURL: "", requiredPoints: 2000, category: "drink", latitude: 41.0120, longitude: 28.9840, stock: 50, validUntil: "2026-12-31", isActive: true }
    ];
}

function ornekIsletmeler() {
    return [
        { id: "biz_001", name: "Kahve Dünyası", logo: "", address: "Sultanahmet Mah. No:12", latitude: 41.0120, longitude: 28.9840, contactEmail: "info@kahvedunyasi.com", contactPhone: "0212 555 1234" }
    ];
}

console.log("[github-storage.js] GitHub storage modülü yüklendi. (v2.0 — Modüler)");
