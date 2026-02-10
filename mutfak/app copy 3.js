// ============================================================
// APP.JS
// Museum Quest — Uygulama başlatıcı
// v2.0 — Modüler şehir bazlı veri sistemi
// Bu dosya en son yüklenir ve tüm modülleri tetikler.
// Bağımlılıklar: Tüm önceki JS dosyaları
// ============================================================

// Sayfa yüklendiğinde
window.addEventListener('DOMContentLoaded', async function() {
    console.log("===========================================");
    console.log("🏛️ Museum Quest v2.0 başlatılıyor...");
    console.log("===========================================");

    yuklemeGoster("Museum Quest yükleniyor...");

    try {
        // 1. GitHub'dan modüler verileri yükle
        // v2.0: index.json → GPS ile şehir bul → sadece o şehrin dosyasını yükle
        console.log("[app.js] 1/3 — Modüler veriler yükleniyor...");
        await statikVerileriYukle();
        // ↓ BU SATIR EKLENMELİ
        if (harita && window.oyunLokasyonlari && window.oyunLokasyonlari.length > 0) {
            lokasyonlariHaritayaEkle();
        }

        var sehirAdi = window.mevcutSehir ? window.mevcutSehir.name : 'Bilinmiyor';
        console.log("[app.js] Veriler yüklendi.",
            "Şehir:", sehirAdi,
            "Lokasyon:", window.oyunLokasyonlari.length,
            "(Sorular quiz başlayınca lazy load edilecek)");

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

    console.log("[app.js] Başlatma tamamlandı. Aktif şehir:",
        window.mevcutSehir ? window.mevcutSehir.name : 'Yok');
});
