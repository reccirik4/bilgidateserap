// ============================================================
// GITHUB-STORAGE.JS
// Museum Quest — GitHub'dan statik JSON verileri okuma/yazma
// v3.0 — Tek dosya yapısı (museum-quest-data.json)
// Bağımlılıklar: github-parametreleri.js (kullaniciAdi, repoAdi, token, githubKlasor, GITHUB_DOSYALARI)
//                ui.js (bildirimGoster)
// ============================================================

// Global statik veri değişkenleri
window.oyunLokasyonlari = [];
window.soruHavuzu = {};
window.odulListesi = [];
window.isletmeListesi = [];

// v3.0 — Tek dosya yapısı değişkenleri
window.questData = null;             // museum-quest-data.json tam içeriği
window.mevcutSehir = null;           // Aktif şehir verisi { id, name, center, ... }
window.mevcutSehirVeri = null;       // Aktif şehir objesi (questData.cities içinden referans)
window.tumSehirVerileri = {};        // Şehir ID → şehir objesi map'i
window.yuklenenSorular = {};         // Lazy load edilmiş sorular cache: { locationId: true }

// SHA değerleri (güncelleme için gerekli)
var githubShaKayitlari = {};

// ──────────────────────────────────────────────
// GITHUB'DAN DOSYA OKU (todo.html kalıbıyla birebir)
// ──────────────────────────────────────────────
async function githubDosyaOku(dosya) {
    try {
        var response = await fetch(
            'https://api.github.com/repos/' + kullaniciAdi + '/' + repoAdi + '/contents/' + githubKlasor + dosya, {
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
            'https://api.github.com/repos/' + kullaniciAdi + '/' + repoAdi + '/contents/' + githubKlasor + dosya, {
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
// v3.0 — TEK DOSYA VERİ YÜKLEME SİSTEMİ
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
// ANA BAŞLATMA: tek JSON oku → GPS ile şehir bul → verileri dağıt
// ──────────────────────────────────────────────
async function statikVerileriYukle() {
    console.log("[github-storage.js] v3.0 — Tek dosyadan veriler yükleniyor...");

    try {
        // 1. Ana veri dosyasını oku (TEK API çağrısı)
        var dataSonuc = await githubDosyaOku(GITHUB_DOSYALARI.data);

        if (dataSonuc.icerik && dataSonuc.icerik.cities) {
            window.questData = dataSonuc.icerik;
            console.log("[github-storage.js] Veri yüklendi. Şehir sayısı:", window.questData.cities.length);
        } else {
            console.warn("[github-storage.js] Veri yüklenemedi, fallback kullanılacak.");
            window.questData = ornekData();
        }

        // 2. GPS ile en yakın şehri bul
        var secilenSehir = await enYakinSehriBul();
        window.mevcutSehir = secilenSehir;
        console.log("[github-storage.js] En yakın şehir:", secilenSehir.name, "(id:", secilenSehir.id + ")");

        // 3. TÜM aktif şehirlerin lokasyonlarını birleştir
        window.oyunLokasyonlari = [];
        window.tumSehirVerileri = {};

        for (var i = 0; i < window.questData.cities.length; i++) {
            var sehir = window.questData.cities[i];
            if (!sehir.isActive) continue;

            // Şehir verisini map'e kaydet
            window.tumSehirVerileri[sehir.id] = sehir;

            // Lokasyonlara şehir bilgisi ekle ve birleştir
            if (sehir.locations && sehir.locations.length > 0) {
                for (var j = 0; j < sehir.locations.length; j++) {
                    sehir.locations[j].cityId = sehir.id;
                    sehir.locations[j].cityName = sehir.name;
                }
                window.oyunLokasyonlari = window.oyunLokasyonlari.concat(sehir.locations);
            }

            console.log("[github-storage.js] Şehir yüklendi:", sehir.name,
                "Lokasyon:", (sehir.locations ? sehir.locations.length : 0));
        }

        // 4. En yakın şehrin verisini ayarla
        window.mevcutSehirVeri = window.tumSehirVerileri[secilenSehir.id] || null;

        // 5. En yakın şehrin işletme ve ödüllerini yükle
        sehirIsletmeleriniAyarla(secilenSehir.id);

        console.log("[github-storage.js] Tüm veriler yüklendi. Toplam lokasyon:", window.oyunLokasyonlari.length);

    } catch (error) {
        console.error("[github-storage.js] Statik veri yükleme genel hata:", error);
        window.questData = ornekData();
        if (window.oyunLokasyonlari.length === 0) window.oyunLokasyonlari = ornekData().cities[0].locations || [];
        if (window.odulListesi.length === 0) window.odulListesi = ornekData().cities[0].oduller || [];
        if (window.isletmeListesi.length === 0) window.isletmeListesi = ornekData().cities[0].isletmeler || [];
    }
}

// ──────────────────────────────────────────────
// GPS İLE EN YAKIN ŞEHRİ BUL
// ──────────────────────────────────────────────
function enYakinSehriBul() {
    return new Promise(function(resolve) {
        if (!window.questData || !window.questData.cities || window.questData.cities.length === 0) {
            console.warn("[github-storage.js] Şehir verisi boş, varsayılan İstanbul.");
            resolve({ id: "istanbul", name: "İstanbul", center: { lat: 41.0082, lng: 28.9784 }, zoom: 14, isActive: true, locations: [], isletmeler: [], oduller: [] });
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

                    for (var i = 0; i < window.questData.cities.length; i++) {
                        var sehir = window.questData.cities[i];
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
                    for (var i = 0; i < window.questData.cities.length; i++) {
                        if (window.questData.cities[i].isActive) {
                            resolve(window.questData.cities[i]);
                            return;
                        }
                    }
                    resolve(window.questData.cities[0]);
                },
                { timeout: 5000, enableHighAccuracy: false }
            );
        } else {
            console.warn("[github-storage.js] Geolocation desteklenmiyor, ilk şehir seçiliyor.");
            for (var i = 0; i < window.questData.cities.length; i++) {
                if (window.questData.cities[i].isActive) {
                    resolve(window.questData.cities[i]);
                    return;
                }
            }
            resolve(window.questData.cities[0]);
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
// ŞEHİR İŞLETME/ÖDÜL AYARLA (bellekten, API çağrısı yok)
// ──────────────────────────────────────────────
function sehirIsletmeleriniAyarla(sehirId) {
    var sehir = window.tumSehirVerileri[sehirId];
    if (sehir) {
        window.isletmeListesi = sehir.isletmeler || [];
        window.odulListesi = sehir.oduller || [];
        console.log("[github-storage.js] İşletmeler ayarlandı:", sehirId,
            window.isletmeListesi.length, "işletme,",
            window.odulListesi.length, "ödül");
    } else {
        console.warn("[github-storage.js] Şehir bulunamadı:", sehirId);
        window.isletmeListesi = [];
        window.odulListesi = [];
    }
}

// Eski API uyumluluğu — rewards.js bu fonksiyonu çağırıyor
async function sehirIsletmeleriniYukle() {
    if (!window.mevcutSehir) return false;
    sehirIsletmeleriniAyarla(window.mevcutSehir.id);
    return window.isletmeListesi.length > 0;
}

// ──────────────────────────────────────────────
// ŞEHİR DEĞİŞTİR (kullanıcı başka şehre geçerse)
// ──────────────────────────────────────────────
async function sehirDegistir(sehirId) {
    console.log("[github-storage.js] Şehir değiştiriliyor:", sehirId);

    if (!window.questData || !window.questData.cities) {
        bildirimGoster("Şehir bilgisi bulunamadı.", "hata");
        return false;
    }

    var yeniSehir = null;
    for (var i = 0; i < window.questData.cities.length; i++) {
        if (window.questData.cities[i].id === sehirId) {
            yeniSehir = window.questData.cities[i];
            break;
        }
    }

    if (!yeniSehir) {
        bildirimGoster("Şehir bulunamadı: " + sehirId, "hata");
        return false;
    }

    window.mevcutSehir = yeniSehir;
    window.mevcutSehirVeri = yeniSehir;

    // İşletme ve ödülleri ayarla
    sehirIsletmeleriniAyarla(sehirId);

    // Soru havuzunu temizle (yeni şehir = yeni sorular)
    window.soruHavuzu = {};
    window.yuklenenSorular = {};

    // Haritayı yeni şehre merkezle
    if (typeof harita !== 'undefined' && harita) {
        harita.panTo({ lat: yeniSehir.center.lat, lng: yeniSehir.center.lng });
        harita.setZoom(yeniSehir.zoom || 14);
    }

    // Marker'ları yeniden yükle
    if (typeof lokasyonlariHaritayaEkle === 'function') {
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
        var fallback = ornekSorular();
        if (fallback[locationId]) {
            window.soruHavuzu[locationId] = fallback[locationId];
            return fallback[locationId];
        }
        return null;
    }
}

// ══════════════════════════════════════════════
// FALLBACK ÖRNEK VERİLER
// ══════════════════════════════════════════════

function ornekData() {
    return {
        version: "3.0",
        cities: [
            {
                id: "istanbul",
                name: "İstanbul",
                center: { lat: 41.0082, lng: 28.9784 },
                zoom: 14,
                isActive: true,
                locations: [
                    { id: "loc_001", name: "Topkapı Sarayı", description: "Osmanlı İmparatorluğu'nun 400 yıllık idare merkezi", questionsFile: "questions-loc_001.json", photoURL: "", latitude: 41.0115, longitude: 28.9833, difficulty: "medium", questionCount: 10, entryRadius: 1000, exitRadius: 2000, isActive: true, category: "history" },
                    { id: "loc_002", name: "Ayasofya", description: "537 yılında inşa edilen mimari şaheser", questionsFile: "questions-loc_002.json", photoURL: "", latitude: 41.0086, longitude: 28.9802, difficulty: "hard", questionCount: 2, entryRadius: 1000, exitRadius: 2000, isActive: true, category: "history" },
                    { id: "loc_003", name: "İstanbul Arkeoloji Müzeleri", description: "Üç müzeden oluşan dünyanın en büyük müze komplekslerinden biri", questionsFile: "questions-loc_003.json", photoURL: "", latitude: 41.0117, longitude: 28.9814, difficulty: "easy", questionCount: 1, entryRadius: 1000, exitRadius: 2000, isActive: true, category: "history" },
                    { id: "loc_004", name: "Basilika Sarnıcı", description: "532 yılında inşa edilen yeraltı su deposu", questionsFile: "questions-loc_004.json", photoURL: "", latitude: 41.0084, longitude: 28.9779, difficulty: "medium", questionCount: 1, entryRadius: 1000, exitRadius: 2000, isActive: true, category: "history" },
                    { id: "loc_005", name: "Türk ve İslam Eserleri Müzesi", description: "İbrahim Paşa Sarayı'nda konumlanan zengin koleksiyon", questionsFile: "questions-loc_005.json", photoURL: "", latitude: 41.0063, longitude: 28.9753, difficulty: "medium", questionCount: 1, entryRadius: 1000, exitRadius: 2000, isActive: true, category: "history" }
                ],
                isletmeler: [
                    { id: "biz_001", name: "Kahve Dünyası", description: "Sultanahmet'te popüler Türk kahve zinciri.", address: "Sultanahmet Mah. No:12", latitude: 41.0120, longitude: 28.9840, phone: "0212 555 1234", website: "", logoURL: "", isActive: true }
                ],
                oduller: [
                    { id: "reward_001", title: "%25 indirimli kahve", description: "Tüm sıcak içeceklerde geçerli", category: "drink", type: "points", requiredPoints: 2000, promoRadius: 0, businessId: "biz_001", businessName: "Kahve Dünyası", businessLogo: "", photoURL: "", latitude: 41.0120, longitude: 28.9840, isActive: true }
                ]
            }
        ]
    };
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

console.log("[github-storage.js] GitHub storage modülü yüklendi. (v3.0 — Tek Dosya)");