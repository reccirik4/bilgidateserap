// ============================================================
// APP.JS
// Museum Quest — Uygulama başlatıcı
// Bu dosya en son yüklenir ve tüm modülleri tetikler.
// Bağımlılıklar: Tüm önceki JS dosyaları
// ============================================================

// Sayfa yüklendiğinde
window.addEventListener('DOMContentLoaded', async function() {
    console.log("===========================================");
    console.log("🏛️ Museum Quest başlatılıyor...");
    console.log("===========================================");

    yuklemeGoster("Museum Quest yükleniyor...");

    try {
        // 1. GitHub'dan statik verileri yükle
        console.log("[app.js] 1/3 — Statik veriler yükleniyor...");
        await statikVerileriYukle();
        console.log("[app.js] Statik veriler yüklendi. Lokasyon:", window.oyunLokasyonlari.length,
            "Soru:", Object.keys(window.soruHavuzu).length, "lokasyon",
            "Ödül:", window.odulListesi.length,
            "İşletme:", window.isletmeListesi.length);

        // 2. Firebase auth durumu kontrol edilecek
        // auth.js'deki onAuthStateChanged otomatik tetiklenir:
        //   - Kullanıcı girişliyse → girisBasarili() → haritaya yönlendirilir
        //   - Değilse → giriş ekranı gösterilir
        console.log("[app.js] 2/3 — Firebase auth kontrolü bekleniyor...");

        // 3. Harita hazırlığı
        // Google Maps API async yükleniyor, hazır olunca haritaHazir() callback'i tetiklenir
        console.log("[app.js] 3/3 — Google Maps yüklenmeyi bekliyor...");

    } catch (error) {
        console.error("[app.js] Başlatma hatası:", error);
        bildirimGoster("Uygulama yüklenirken hata oluştu. Sayfayı yenileyin.", "hata");
    }

    // Yükleme ekranını kapat (auth kontrolü devam edebilir)
    setTimeout(function() {
        yuklemeKapat();
    }, 1500);

    console.log("[app.js] Başlatma tamamlandı.");
});

// ──────────────────────────────────────────────
// SERVİS WORKER (PWA desteği — opsiyonel)
// ──────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        // Service worker dosyası varsa kaydet
        // navigator.serviceWorker.register('/sw.js').catch(function() {});
    });
}

// ──────────────────────────────────────────────
// SAYFA KAPANIRKEN TEMİZLİK
// ──────────────────────────────────────────────
window.addEventListener('beforeunload', function() {
    console.log("[app.js] Sayfa kapanıyor, temizlik yapılıyor...");

    // Konum takibini durdur
    if (konumWatchId) {
        navigator.geolocation.clearWatch(konumWatchId);
    }

    // Multiplayer temizliği
    if (typeof multiplayerTemizle === 'function') {
        multiplayerTemizle();
    }

    // Aktif oyuncu kaydını sil
    if (mevcutKullanici && mevcutMekanId) {
        aktifOyuncuSil(mevcutMekanId, mevcutKullanici.uid);
    }
});

// ──────────────────────────────────────────────
// GÖRÜNÜRLÜK DEĞİŞİMİ (tab değişimi)
// ──────────────────────────────────────────────
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
        console.log("[app.js] Uygulama tekrar görünür oldu.");

        // Harita puanını güncelle
        if (typeof haritaPuanGuncelle === 'function') {
            haritaPuanGuncelle();
        }

        // Aktif oyuncu konumunu güncelle
        if (pairingOpenDurum && mevcutKullanici && mevcutMekanId && mevcutKonum.lat) {
            dbGuncelle('active_players/' + mevcutMekanId + '/' + mevcutKullanici.uid, {
                latitude: mevcutKonum.lat,
                longitude: mevcutKonum.lng,
                lastUpdate: Date.now()
            });
        }
    }
});

// ──────────────────────────────────────────────
// GLOBAL HATA YAKALAMA
// ──────────────────────────────────────────────
window.addEventListener('error', function(event) {
    console.error("[app.js] Global hata:", event.message, event.filename, event.lineno);
});

window.addEventListener('unhandledrejection', function(event) {
    console.error("[app.js] Yakalanmamış Promise hatası:", event.reason);
});

console.log("[app.js] App modülü yüklendi. DOMContentLoaded bekleniyor...");
