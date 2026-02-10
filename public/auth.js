// ============================================================
// AUTH.JS
// Museum Quest — Google ile giriş/çıkış, oturum takibi
// Bağımlılıklar: firebase-config.js (auth, db, googleProvider)
//                ui.js (ekranGoster, bildirimGoster, yuklemeGoster/Kapat)
// ============================================================

// Global kullanıcı değişkenleri
let mevcutKullanici = null;      // Firebase user nesnesi
let kullaniciBilgileri = null;   // DB'den gelen profil bilgileri

// ──────────────────────────────────────────────
// GOOGLE İLE GİRİŞ
// ──────────────────────────────────────────────
function googleIleGiris() {
    console.log("[auth.js] Google ile giriş başlatılıyor...");

    // Önce popup dene (hem masaüstü hem mobil)
    auth.signInWithPopup(googleProvider)
        .then(function(result) {
            console.log("[auth.js] Popup giriş başarılı:", result.user.email);
        })
        .catch(function(error) {
            console.error("[auth.js] Popup giriş hatası:", error.code);

            if (error.code === 'auth/popup-closed-by-user') {
                bildirimGoster("Giriş penceresi kapatıldı", "uyari");
            } else if (error.code === 'auth/cancelled-popup-request') {
                console.warn("[auth.js] Duplicate popup isteği, yoksayıldı.");
            } else if (error.code === 'auth/popup-blocked' ||
                       error.code === 'auth/operation-not-supported-in-this-environment') {
                // Popup engellenmiş veya desteklenmiyor — redirect'e düş
                console.log("[auth.js] Popup engellendi, redirect deneniyor...");
                auth.signInWithRedirect(googleProvider);
            } else {
                bildirimGoster("Giriş hatası: " + error.message, "hata");
            }
        });
}

// ──────────────────────────────────────────────
// ERİŞİM KONTROL
// ──────────────────────────────────────────────
function erisimKontrol(user) {
    console.log("[auth.js] Erişim onaylandı:", user.email);
    return true;
}

// ──────────────────────────────────────────────
// GİRİŞ BAŞARILI — PROFİL KONTROL & YÖNLENDİRME
// ──────────────────────────────────────────────
async function girisBasarili(user) {
    console.log("[auth.js] Giriş başarılı, profil kontrol ediliyor...", user.uid);
    mevcutKullanici = user;

    try {
        // Firebase DB'den profil bilgilerini çek
        const profil = await kullaniciProfilOku(user.uid);

        if (profil) {
            // Profil var — bilgileri kaydet ve haritaya yönlendir
            kullaniciBilgileri = profil;
            console.log("[auth.js] Profil bulundu:", profil.displayName);

            // Son görülme zamanını güncelle
            kullaniciProfilGuncelle(user.uid, {
                lastSeen: Date.now()
            });

            // Alt menüyü göster
            altMenuGoster();

            // Harita ekranına yönlendir
            ekranGoster('ekran-harita');

            // Harita puanını güncelle
            haritaPuanGuncelle();

            bildirimGoster("Hoş geldin, " + profil.displayName + "! 👋", "basari");
        } else {
            // Profil yok — ilk giriş, profil oluşturma ekranına yönlendir
            console.log("[auth.js] Profil bulunamadı, oluşturma ekranına yönlendiriliyor.");
            profilOlusturEkraniniDoldur(user);
            ekranGoster('ekran-profil-olustur');
        }
    } catch (error) {
        console.error("[auth.js] Profil okuma hatası:", error);
        bildirimGoster("Profil yüklenirken hata oluştu.", "hata");
    }
}

// ──────────────────────────────────────────────
// ÇIKIŞ YAP
// ──────────────────────────────────────────────
function cikisYap() {
    console.log("[auth.js] Çıkış yapılıyor...");

    // Konum takibini durdur
    if (konumWatchId) {
        navigator.geolocation.clearWatch(konumWatchId);
        konumWatchId = null;
    }

    // Aktif oyuncu kaydını sil (varsa)
    if (mevcutKullanici) {
        // Tüm aktif lokasyonlardan sil
        try {
            db.ref('active_players').once('value', function(snapshot) {
                var data = snapshot.val();
                if (data) {
                    Object.keys(data).forEach(function(locId) {
                        if (data[locId] && data[locId][mevcutKullanici.uid]) {
                            aktifOyuncuSil(locId, mevcutKullanici.uid);
                        }
                    });
                }
            });
        } catch (e) {
            console.warn("[auth.js] Aktif oyuncu temizleme hatası:", e);
        }
    }

    auth.signOut().then(function() {
        mevcutKullanici = null;
        kullaniciBilgileri = null;
        altMenuGizle();
        ekranGoster('ekran-giris');
        bildirimGoster("Çıkış yapıldı.", "bilgi");
        console.log("[auth.js] Çıkış başarılı.");
    }).catch(function(error) {
        console.error("[auth.js] Çıkış hatası:", error);
        bildirimGoster("Çıkış yapılırken hata oluştu.", "hata");
    });
}

// ──────────────────────────────────────────────
// OTURUM DURUMU TAKİBİ
// ──────────────────────────────────────────────
auth.onAuthStateChanged(function(user) {
    console.log("[auth.js] onAuthStateChanged tetiklendi:", user ? user.email : "kullanıcı yok");

    if (user) {
        // Kullanıcı giriş yapmış
        if (erisimKontrol(user)) {
            girisBasarili(user);
        }
    } else {
        // Kullanıcı çıkış yapmış veya giriş yapmamış
        mevcutKullanici = null;
        kullaniciBilgileri = null;
        altMenuGizle();
        ekranGoster('ekran-giris');
    }
});

// ──────────────────────────────────────────────
// REDIRECT SONUCU KONTROL (mobil giriş için)
// ──────────────────────────────────────────────
auth.getRedirectResult().then(function(result) {
    if (result.user) {
        console.log("[auth.js] Redirect sonucu alındı:", result.user.email);
        // onAuthStateChanged zaten tetiklenecek
    }
}).catch(function(error) {
    if (error.code !== 'auth/no-auth-event') {
        console.error("[auth.js] Redirect sonuç hatası:", error);
        bildirimGoster("Giriş hatası: " + error.message, "hata");
    }
});

// ──────────────────────────────────────────────
// YARDIMCI: HARİTA PUAN GÜNCELLE
// ──────────────────────────────────────────────
function haritaPuanGuncelle() {
    var el = document.getElementById('harita-puan');
    if (el && kullaniciBilgileri) {
        el.textContent = formatPuan(kullaniciBilgileri.totalPoints || 0);
    }
}

console.log("[auth.js] Auth modülü yüklendi.");