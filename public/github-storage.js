// ============================================================
// GITHUB-STORAGE.JS
// Museum Quest — GitHub'dan statik JSON verileri okuma/yazma
// Bağımlılıklar: github-parametreleri.js (kullaniciAdi, repoAdi, token, GITHUB_DOSYALARI)
//                ui.js (bildirimGoster)
// ============================================================

// Global statik veri değişkenleri
window.oyunLokasyonlari = [];
window.soruHavuzu = {};
window.odulListesi = [];
window.isletmeListesi = [];

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

// ──────────────────────────────────────────────
// TÜM STATİK VERİLERİ GITHUB'DAN ÇEK
// ──────────────────────────────────────────────
async function statikVerileriYukle() {
    console.log("[github-storage.js] Statik veriler yükleniyor...");

    var basarili = 0;
    var toplam = 4;

    try {
        // 1. Lokasyonları çek
        var lokasyonlar = await githubDosyaOku(GITHUB_DOSYALARI.lokasyonlar);
        if (lokasyonlar.icerik) {
            window.oyunLokasyonlari = lokasyonlar.icerik;
            basarili++;
            console.log("[github-storage.js] Lokasyonlar yüklendi:", window.oyunLokasyonlari.length, "adet");
        } else {
            console.warn("[github-storage.js] Lokasyonlar yüklenemedi, örnek veri kullanılacak.");
            window.oyunLokasyonlari = ornekLokasyonlar();
        }

        // 2. Soruları çek
        var sorular = await githubDosyaOku(GITHUB_DOSYALARI.sorular);
        if (sorular.icerik) {
            window.soruHavuzu = sorular.icerik;
            basarili++;
            var toplamSoru = 0;
            Object.keys(window.soruHavuzu).forEach(function(key) {
                toplamSoru += window.soruHavuzu[key].length;
            });
            console.log("[github-storage.js] Sorular yüklendi:", toplamSoru, "adet");
        } else {
            console.warn("[github-storage.js] Sorular yüklenemedi, örnek veri kullanılacak.");
            window.soruHavuzu = ornekSorular();
        }

        // 3. Ödülleri çek
        var oduller = await githubDosyaOku(GITHUB_DOSYALARI.oduller);
        if (oduller.icerik) {
            window.odulListesi = oduller.icerik;
            basarili++;
            console.log("[github-storage.js] Ödüller yüklendi:", window.odulListesi.length, "adet");
        } else {
            console.warn("[github-storage.js] Ödüller yüklenemedi, örnek veri kullanılacak.");
            window.odulListesi = ornekOduller();
        }

        // 4. İşletmeleri çek
        var isletmeler = await githubDosyaOku(GITHUB_DOSYALARI.isletmeler);
        if (isletmeler.icerik) {
            window.isletmeListesi = isletmeler.icerik;
            basarili++;
            console.log("[github-storage.js] İşletmeler yüklendi:", window.isletmeListesi.length, "adet");
        } else {
            console.warn("[github-storage.js] İşletmeler yüklenemedi, örnek veri kullanılacak.");
            window.isletmeListesi = ornekIsletmeler();
        }

        console.log("[github-storage.js] Statik veri yükleme tamamlandı:", basarili + "/" + toplam, "başarılı");
    } catch (error) {
        console.error("[github-storage.js] Statik veri yükleme genel hata:", error);
        // Fallback: örnek veriler yükle
        if (window.oyunLokasyonlari.length === 0) window.oyunLokasyonlari = ornekLokasyonlar();
        if (Object.keys(window.soruHavuzu).length === 0) window.soruHavuzu = ornekSorular();
        if (window.odulListesi.length === 0) window.odulListesi = ornekOduller();
        if (window.isletmeListesi.length === 0) window.isletmeListesi = ornekIsletmeler();
    }
}

// ──────────────────────────────────────────────
// ÖRNEK VERİLER (GitHub'a erişilemezse fallback)
// ──────────────────────────────────────────────

function ornekLokasyonlar() {
    return [
        {
            id: "loc_001",
            name: "Topkapı Sarayı",
            description: "Osmanlı İmparatorluğu'nun 400 yıllık idare merkezi",
            photoURL: "",
            latitude: 41.0115,
            longitude: 28.9833,
            difficulty: "medium",
            questionCount: 50,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_002",
            name: "Ayasofya",
            description: "537 yılında inşa edilen mimari şaheser",
            photoURL: "",
            latitude: 41.0086,
            longitude: 28.9802,
            difficulty: "hard",
            questionCount: 40,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_003",
            name: "İstanbul Arkeoloji Müzeleri",
            description: "Üç müzeden oluşan dünyanın en büyük müze komplekslerinden biri",
            photoURL: "",
            latitude: 41.0117,
            longitude: 28.9814,
            difficulty: "easy",
            questionCount: 30,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_004",
            name: "Basilika Sarnıcı",
            description: "532 yılında inşa edilen yeraltı su deposu",
            photoURL: "",
            latitude: 41.0084,
            longitude: 28.9779,
            difficulty: "medium",
            questionCount: 20,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        },
        {
            id: "loc_005",
            name: "Türk ve İslam Eserleri Müzesi",
            description: "İbrahim Paşa Sarayı'nda konumlanan zengin koleksiyon",
            photoURL: "",
            latitude: 41.0063,
            longitude: 28.9753,
            difficulty: "medium",
            questionCount: 25,
            entryRadius: 1000,
            exitRadius: 2000,
            isActive: true
        }
    ];
}

function ornekSorular() {
    return {
        "loc_001": [
            {
                id: "q_001",
                text: "Topkapı Sarayı hangi yılda müzeye dönüştürüldü?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "1924", correct: true },
                    { text: "1934", correct: false },
                    { text: "1938", correct: false },
                    { text: "1952", correct: false }
                ],
                explanation: "Topkapı Sarayı 3 Nisan 1924'te müzeye dönüştürüldü."
            },
            {
                id: "q_002",
                text: "Topkapı Sarayı'nın yapımına hangi padişah döneminde başlanmıştır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "easy",
                points: 10,
                timeLimit: 15,
                options: [
                    { text: "Fatih Sultan Mehmet", correct: true },
                    { text: "Kanuni Sultan Süleyman", correct: false },
                    { text: "Yavuz Sultan Selim", correct: false },
                    { text: "II. Bayezid", correct: false }
                ],
                explanation: "Topkapı Sarayı'nın yapımına 1460 yılında Fatih Sultan Mehmet tarafından başlanmıştır."
            },
            {
                id: "q_003",
                text: "Topkapı Sarayı'nda kaç avlu bulunmaktadır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "4", correct: true },
                    { text: "3", correct: false },
                    { text: "5", correct: false },
                    { text: "2", correct: false }
                ],
                explanation: "Topkapı Sarayı dört ana avludan oluşmaktadır."
            },
            {
                id: "q_004",
                text: "Harem bölümünde yaklaşık kaç oda vardır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "hard",
                points: 50,
                timeLimit: 15,
                options: [
                    { text: "400", correct: true },
                    { text: "200", correct: false },
                    { text: "600", correct: false },
                    { text: "100", correct: false }
                ],
                explanation: "Harem bölümünde yaklaşık 400 oda bulunmaktadır."
            },
            {
                id: "q_005",
                text: "Topkapı Sarayı hangi yarımadanın ucunda yer alır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "easy",
                points: 10,
                timeLimit: 15,
                options: [
                    { text: "Sarayburnu", correct: true },
                    { text: "Kadıköy", correct: false },
                    { text: "Üsküdar", correct: false },
                    { text: "Eminönü", correct: false }
                ],
                explanation: "Topkapı Sarayı, İstanbul'un tarihi yarımadasının ucundaki Sarayburnu'nda yer alır."
            },
            {
                id: "q_006",
                text: "Kaşıkçı Elması hangi bölümde sergilenmektedir?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "Hazine Dairesi", correct: true },
                    { text: "Harem", correct: false },
                    { text: "Arz Odası", correct: false },
                    { text: "Enderun", correct: false }
                ],
                explanation: "Kaşıkçı Elması, Topkapı Sarayı Hazine Dairesi'nde sergilenmektedir."
            },
            {
                id: "q_007",
                text: "Topkapı Sarayı kaç yıl Osmanlı'nın idare merkezi olarak kullanılmıştır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "Yaklaşık 400 yıl", correct: true },
                    { text: "Yaklaşık 200 yıl", correct: false },
                    { text: "Yaklaşık 600 yıl", correct: false },
                    { text: "Yaklaşık 150 yıl", correct: false }
                ],
                explanation: "Topkapı Sarayı 1465-1856 yılları arasında yaklaşık 400 yıl idare merkezi olarak kullanılmıştır."
            },
            {
                id: "q_008",
                text: "Topkapı Sarayı'nın toplam alanı yaklaşık kaç metrekaredir?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "hard",
                points: 50,
                timeLimit: 15,
                options: [
                    { text: "700.000 m²", correct: true },
                    { text: "300.000 m²", correct: false },
                    { text: "1.000.000 m²", correct: false },
                    { text: "150.000 m²", correct: false }
                ],
                explanation: "Topkapı Sarayı yaklaşık 700.000 metrekarelik bir alanı kaplamaktadır."
            },
            {
                id: "q_009",
                text: "Bab-ı Hümayun ne anlama gelir?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "İmparatorluk Kapısı", correct: true },
                    { text: "Selam Kapısı", correct: false },
                    { text: "Saadet Kapısı", correct: false },
                    { text: "Cennet Kapısı", correct: false }
                ],
                explanation: "Bab-ı Hümayun, 'İmparatorluk Kapısı' anlamına gelen ana giriş kapısıdır."
            },
            {
                id: "q_010",
                text: "Topkapı Sarayı UNESCO Dünya Mirası listesine hangi yıl eklenmiştir?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "hard",
                points: 50,
                timeLimit: 15,
                options: [
                    { text: "1985", correct: true },
                    { text: "1990", correct: false },
                    { text: "1978", correct: false },
                    { text: "2000", correct: false }
                ],
                explanation: "Topkapı Sarayı, İstanbul'un tarihi alanlarının bir parçası olarak 1985'te UNESCO listesine eklenmiştir."
            }
        ],
        "loc_002": [
            {
                id: "q_101",
                text: "Ayasofya ilk olarak hangi yılda ibadete açılmıştır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "537", correct: true },
                    { text: "532", correct: false },
                    { text: "550", correct: false },
                    { text: "527", correct: false }
                ],
                explanation: "Ayasofya, 537 yılında Justinianus döneminde ibadete açılmıştır."
            },
            {
                id: "q_102",
                text: "Ayasofya'yı yaptıran Bizans imparatoru kimdir?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "easy",
                points: 10,
                timeLimit: 15,
                options: [
                    { text: "I. Justinianus", correct: true },
                    { text: "Konstantin", correct: false },
                    { text: "Theodosius", correct: false },
                    { text: "II. Mehmed", correct: false }
                ],
                explanation: "Ayasofya, I. Justinianus tarafından yaptırılmıştır."
            }
        ],
        "loc_003": [
            {
                id: "q_201",
                text: "İstanbul Arkeoloji Müzeleri kaç müzeden oluşur?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "easy",
                points: 10,
                timeLimit: 15,
                options: [
                    { text: "3", correct: true },
                    { text: "2", correct: false },
                    { text: "5", correct: false },
                    { text: "4", correct: false }
                ],
                explanation: "Arkeoloji Müzesi, Eski Şark Eserleri Müzesi ve Çinili Köşk olmak üzere 3 müzeden oluşur."
            }
        ],
        "loc_004": [
            {
                id: "q_301",
                text: "Basilika Sarnıcı hangi yılda inşa edilmiştir?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "532", correct: true },
                    { text: "537", correct: false },
                    { text: "500", correct: false },
                    { text: "560", correct: false }
                ],
                explanation: "Basilika Sarnıcı, 532 yılında I. Justinianus döneminde inşa edilmiştir."
            }
        ],
        "loc_005": [
            {
                id: "q_401",
                text: "Türk ve İslam Eserleri Müzesi hangi tarihi binada yer alır?",
                imageURL: null,
                type: "multiple_choice",
                difficulty: "medium",
                points: 25,
                timeLimit: 15,
                options: [
                    { text: "İbrahim Paşa Sarayı", correct: true },
                    { text: "Topkapı Sarayı", correct: false },
                    { text: "Dolmabahçe Sarayı", correct: false },
                    { text: "Çırağan Sarayı", correct: false }
                ],
                explanation: "Müze, Sultanahmet Meydanı'ndaki İbrahim Paşa Sarayı'nda konumlanmaktadır."
            }
        ]
    };
}

function ornekOduller() {
    return [
        {
            id: "reward_001",
            businessId: "biz_001",
            businessName: "Kahve Dünyası",
            businessLogo: "",
            title: "%25 indirimli kahve",
            description: "Tüm sıcak içeceklerde geçerli",
            photoURL: "",
            requiredPoints: 2000,
            category: "drink",
            latitude: 41.0120,
            longitude: 28.9840,
            stock: 50,
            validUntil: "2026-12-31",
            isActive: true
        },
        {
            id: "reward_002",
            businessId: "biz_002",
            businessName: "Tarihi Sultanahmet Köftecisi",
            businessLogo: "",
            title: "1 porsiyon ücretsiz köfte",
            description: "Ana menüden 1 porsiyon köfte hediye",
            photoURL: "",
            requiredPoints: 5000,
            category: "food",
            latitude: 41.0070,
            longitude: 28.9760,
            stock: 20,
            validUntil: "2026-12-31",
            isActive: true
        },
        {
            id: "reward_003",
            businessId: "biz_003",
            businessName: "Grand Bazaar Hediyelik",
            businessLogo: "",
            title: "%30 indirim",
            description: "Tüm hediyelik eşyalarda geçerli",
            photoURL: "",
            requiredPoints: 3000,
            category: "shopping",
            latitude: 41.0107,
            longitude: 28.9681,
            stock: 30,
            validUntil: "2026-12-31",
            isActive: true
        }
    ];
}

function ornekIsletmeler() {
    return [
        {
            id: "biz_001",
            name: "Kahve Dünyası",
            logo: "",
            address: "Sultanahmet Mah. No:12",
            latitude: 41.0120,
            longitude: 28.9840,
            contactEmail: "info@kahvedunyasi.com",
            contactPhone: "0212 555 1234"
        },
        {
            id: "biz_002",
            name: "Tarihi Sultanahmet Köftecisi",
            logo: "",
            address: "Sultanahmet Mah. Divanyolu Cad. No:12",
            latitude: 41.0070,
            longitude: 28.9760,
            contactEmail: "info@sultanahmetkoftecisi.com",
            contactPhone: "0212 520 0566"
        },
        {
            id: "biz_003",
            name: "Grand Bazaar Hediyelik",
            logo: "",
            address: "Kapalıçarşı, Fatih",
            latitude: 41.0107,
            longitude: 28.9681,
            contactEmail: "info@grandbazaar.com",
            contactPhone: "0212 555 5678"
        }
    ];
}

console.log("[github-storage.js] GitHub storage modülü yüklendi.");
