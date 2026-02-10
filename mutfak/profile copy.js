// ============================================================
// PROFILE.JS
// Museum Quest — Profil oluşturma, düzenleme, fotoğraf, istatistik
// Bağımlılıklar: auth.js (mevcutKullanici, kullaniciBilgileri)
//                database.js (kullaniciProfilYaz/Guncelle/Oku, leaderboardGuncelle)
//                ui.js (ekranGoster, bildirimGoster, modalGoster, varsayilanFoto, formatPuan, htmlEscape)
// ============================================================

// Geçici fotoğraf verisi (base64)
var geciciFotoData = null;

// Rozet tanımları
var ROZET_TANIMLARI = {
    'ilk_muze': { emoji: '🏛️', ad: 'İlk Müze' },
    'tarih_gurusu': { emoji: '📜', ad: 'Tarih Gurusu' },
    'hiz_seyrani': { emoji: '⚡', ad: 'Hız Şeyranı' },
    'quiz_ustasi': { emoji: '🧠', ad: 'Quiz Ustası' },
    'sosyal_kelebek': { emoji: '🦋', ad: 'Sosyal Kelebek' },
    'koleksiyoncu': { emoji: '🏅', ad: 'Koleksiyoncu' },
    'kesfedici': { emoji: '🧭', ad: 'Keşfedici' },
    'sampiyonlar_ligi': { emoji: '🏆', ad: 'Şampiyonlar Ligi' },
    'arka_arkaya_5': { emoji: '🔥', ad: '5 Doğru Seri' },
    'ilk_odul': { emoji: '🎁', ad: 'İlk Ödül' }
};

// İlgi alanları listesi
var ILGI_ALANLARI = ['tarih', 'sanat', 'arkeoloji', 'bilim', 'doga', 'teknoloji', 'muzik', 'mimari'];

// ──────────────────────────────────────────────
// PROFİL OLUŞTUR EKRANINI DOLDUR
// ──────────────────────────────────────────────
function profilOlusturEkraniniDoldur(user) {
    console.log("[profile.js] Profil oluştur ekranı dolduruluyor:", user.displayName);

    // Google'dan gelen bilgileri forma doldur
    var fotoEl = document.getElementById('profil-olustur-foto');
    var isimEl = document.getElementById('profil-isim');

    if (fotoEl) {
        fotoEl.src = user.photoURL || varsayilanFoto();
        fotoEl.onerror = function() { this.src = varsayilanFoto(); };
    }

    if (isimEl) {
        isimEl.value = user.displayName || '';
    }

    // Geçici foto verisini sıfırla
    geciciFotoData = null;
}

// ──────────────────────────────────────────────
// İLGİ ALANI SEÇİMİ
// ──────────────────────────────────────────────
function ilgiSec(el) {
    el.classList.toggle('aktif');
}

function seciliIlgiAlanlari() {
    var secililer = [];
    var chipler = document.querySelectorAll('#ilgi-alanlari-container .ilgi-chip.aktif');
    for (var i = 0; i < chipler.length; i++) {
        secililer.push(chipler[i].getAttribute('data-value'));
    }
    return secililer;
}

// ──────────────────────────────────────────────
// FOTOĞRAF SEÇİMİ & KÜÇÜLTME
// ──────────────────────────────────────────────
function fotoSecildi(event) {
    var dosya = event.target.files[0];
    if (!dosya) return;

    // Dosya boyutu kontrolü (5MB max)
    if (dosya.size > 5 * 1024 * 1024) {
        bildirimGoster("Fotoğraf 5MB'dan küçük olmalı.", "uyari");
        return;
    }

    // Dosya türü kontrolü
    if (!dosya.type.startsWith('image/')) {
        bildirimGoster("Lütfen bir resim dosyası seçin.", "uyari");
        return;
    }

    fotoKucult(dosya, function(base64) {
        geciciFotoData = base64;
        var fotoEl = document.getElementById('profil-olustur-foto');
        if (fotoEl) fotoEl.src = base64;
    });
}

function fotoSecildiDuzenle(event) {
    var dosya = event.target.files[0];
    if (!dosya) return;

    if (dosya.size > 5 * 1024 * 1024) {
        bildirimGoster("Fotoğraf 5MB'dan küçük olmalı.", "uyari");
        return;
    }

    if (!dosya.type.startsWith('image/')) {
        bildirimGoster("Lütfen bir resim dosyası seçin.", "uyari");
        return;
    }

    fotoKucult(dosya, function(base64) {
        // Doğrudan Firebase'e kaydet
        if (mevcutKullanici) {
            kullaniciProfilGuncelle(mevcutKullanici.uid, {
                photoURL: base64
            }).then(function() {
                if (kullaniciBilgileri) kullaniciBilgileri.photoURL = base64;
                var fotoEl = document.getElementById('profil-foto');
                if (fotoEl) fotoEl.src = base64;

                // Leaderboard'da da güncelle
                leaderboardGuncelle(mevcutKullanici.uid, {
                    displayName: kullaniciBilgileri.displayName,
                    photoURL: base64,
                    totalPoints: kullaniciBilgileri.totalPoints || 0,
                    lastUpdated: Date.now()
                });

                bildirimGoster("Fotoğraf güncellendi! 📷", "basari");
            }).catch(function(error) {
                console.error("[profile.js] Fotoğraf güncelleme hatası:", error);
                bildirimGoster("Fotoğraf güncellenemedi.", "hata");
            });
        }
    });
}

function fotoKucult(dosya, callback) {
    var reader = new FileReader();
    reader.onload = function(e) {
        var img = new Image();
        img.onload = function() {
            var canvas = document.createElement('canvas');
            var maxBoyut = 200;
            var genislik = img.width;
            var yukseklik = img.height;

            // En-boy oranını koru, max 200x200
            if (genislik > yukseklik) {
                if (genislik > maxBoyut) {
                    yukseklik = Math.round(yukseklik * maxBoyut / genislik);
                    genislik = maxBoyut;
                }
            } else {
                if (yukseklik > maxBoyut) {
                    genislik = Math.round(genislik * maxBoyut / yukseklik);
                    yukseklik = maxBoyut;
                }
            }

            canvas.width = genislik;
            canvas.height = yukseklik;

            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, genislik, yukseklik);

            var base64 = canvas.toDataURL('image/jpeg', 0.8);
            console.log("[profile.js] Fotoğraf küçültüldü:", genislik + "x" + yukseklik);
            callback(base64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(dosya);
}

// ──────────────────────────────────────────────
// PROFİL KAYDET (İLK OLUŞTURMA)
// ──────────────────────────────────────────────
async function profilKaydet() {
    console.log("[profile.js] Profil kaydediliyor...");

    if (!mevcutKullanici) {
        bildirimGoster("Oturum bulunamadı, tekrar giriş yapın.", "hata");
        return;
    }

    // Form verilerini topla
    var isim = document.getElementById('profil-isim').value.trim();
    var yas = parseInt(document.getElementById('profil-yas').value) || 0;
    var cinsiyet = document.getElementById('profil-cinsiyet').value;
    var ilgiAlanlari = seciliIlgiAlanlari();

    // Validasyonlar
    if (!isim) {
        bildirimGoster("İsim alanı boş olamaz.", "uyari");
        return;
    }

    if (isim.length < 2 || isim.length > 30) {
        bildirimGoster("İsim 2-30 karakter arasında olmalı.", "uyari");
        return;
    }

    if (yas < 10 || yas > 99) {
        bildirimGoster("Yaş 10-99 arasında olmalı.", "uyari");
        return;
    }

    yuklemeGoster("Profil oluşturuluyor...");

    try {
        // Fotoğraf: önce özel seçilmiş, yoksa Google'dan gelen, yoksa varsayılan
        var fotoURL = geciciFotoData || mevcutKullanici.photoURL || varsayilanFoto();

        var profilVerisi = {
            displayName: isim,
            email: mevcutKullanici.email,
            photoURL: fotoURL,
            age: yas,
            gender: cinsiyet,
            interests: ilgiAlanlari,
            totalPoints: 0,
            xpLevel: 1,
            gamesPlayed: 0,
            rewardsWon: 0,
            badges: [],
            createdAt: Date.now(),
            lastSeen: Date.now(),
            pairingOpen: false
        };

        // Firebase'e kaydet
        await kullaniciProfilYaz(mevcutKullanici.uid, profilVerisi);

        // Leaderboard'a da kaydet
        await leaderboardGuncelle(mevcutKullanici.uid, {
            displayName: isim,
            photoURL: fotoURL,
            totalPoints: 0,
            lastUpdated: Date.now()
        });

        // Global değişkeni güncelle
        kullaniciBilgileri = profilVerisi;
        geciciFotoData = null;

        yuklemeKapat();
        altMenuGoster();
        ekranGoster('ekran-harita');
        bildirimGoster("Profil oluşturuldu! Oyuna hoş geldin! 🎮", "basari");
        console.log("[profile.js] Profil başarıyla kaydedildi.");

    } catch (error) {
        yuklemeKapat();
        console.error("[profile.js] Profil kaydetme hatası:", error);
        bildirimGoster("Profil oluşturulurken hata oluştu.", "hata");
    }
}

// ──────────────────────────────────────────────
// PROFİL GÖSTER
// ──────────────────────────────────────────────
function profilGoster() {
    console.log("[profile.js] Profil gösteriliyor...");

    if (!kullaniciBilgileri || !mevcutKullanici) {
        console.warn("[profile.js] Kullanıcı bilgileri yok.");
        return;
    }

    var k = kullaniciBilgileri;

    // Fotoğraf
    var fotoEl = document.getElementById('profil-foto');
    if (fotoEl) {
        fotoEl.src = k.photoURL || varsayilanFoto();
        fotoEl.onerror = function() { this.src = varsayilanFoto(); };
    }

    // İsim
    var adEl = document.getElementById('profil-ad');
    if (adEl) adEl.textContent = k.displayName || '';

    // Email
    var emailEl = document.getElementById('profil-email');
    if (emailEl) emailEl.textContent = mevcutKullanici.email || '';

    // Seviye
    var seviyeEl = document.getElementById('profil-seviye');
    if (seviyeEl) seviyeEl.textContent = '⭐ Seviye ' + (k.xpLevel || 1);

    // İstatistikler
    var puanEl = document.getElementById('profil-toplam-puan');
    if (puanEl) puanEl.textContent = formatPuan(k.totalPoints || 0);

    var oyunEl = document.getElementById('profil-oyun-sayisi');
    if (oyunEl) oyunEl.textContent = k.gamesPlayed || 0;

    var odulEl = document.getElementById('profil-odul-sayisi');
    if (odulEl) odulEl.textContent = k.rewardsWon || 0;

    var xpEl = document.getElementById('profil-xp-seviye');
    if (xpEl) xpEl.textContent = k.xpLevel || 1;

    // Rozetler
    rozetleriGoster(k.badges || []);
}

// ──────────────────────────────────────────────
// ROZETLER
// ──────────────────────────────────────────────
function rozetleriGoster(rozetler) {
    var container = document.getElementById('rozet-grid');
    if (!container) return;

    if (!rozetler || rozetler.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.875rem;">Henüz rozet yok. Oyun oynayarak rozet kazan!</span>';
        return;
    }

    var html = '';
    for (var i = 0; i < rozetler.length; i++) {
        var rozet = ROZET_TANIMLARI[rozetler[i]];
        if (rozet) {
            html += '<div class="rozet-item">' + rozet.emoji + ' ' + rozet.ad + '</div>';
        }
    }
    container.innerHTML = html;
}

// Rozet kontrolü ve ekleme
async function rozetKontrolVeEkle(rozetId) {
    if (!mevcutKullanici || !kullaniciBilgileri) return;

    var mevcutRozetler = kullaniciBilgileri.badges || [];

    // Zaten var mı kontrol et
    if (mevcutRozetler.indexOf(rozetId) !== -1) return;

    // Rozet ekle
    mevcutRozetler.push(rozetId);

    try {
        await kullaniciProfilGuncelle(mevcutKullanici.uid, {
            badges: mevcutRozetler
        });
        kullaniciBilgileri.badges = mevcutRozetler;

        var rozet = ROZET_TANIMLARI[rozetId];
        if (rozet) {
            bildirimGoster("Yeni rozet kazandın! " + rozet.emoji + " " + rozet.ad, "basari");
        }
        console.log("[profile.js] Rozet eklendi:", rozetId);
    } catch (error) {
        console.error("[profile.js] Rozet ekleme hatası:", error);
    }
}

// ──────────────────────────────────────────────
// PROFİL DÜZENLE
// ──────────────────────────────────────────────
function profilDuzenle() {
    console.log("[profile.js] Profil düzenleme açılıyor...");

    if (!kullaniciBilgileri) return;
    var k = kullaniciBilgileri;

    // İlgi alanları chip HTML'i oluştur
    var ilgiHTML = '';
    for (var i = 0; i < ILGI_ALANLARI.length; i++) {
        var deger = ILGI_ALANLARI[i];
        var aktifMi = (k.interests || []).indexOf(deger) !== -1;
        var emojiler = {
            'tarih': '🏛️', 'sanat': '🎨', 'arkeoloji': '⛏️', 'bilim': '🔬',
            'doga': '🌿', 'teknoloji': '💻', 'muzik': '🎵', 'mimari': '🏗️'
        };
        ilgiHTML += '<div class="ilgi-chip' + (aktifMi ? ' aktif' : '') +
            '" data-value="' + deger + '" onclick="ilgiSec(this)">' +
            (emojiler[deger] || '') + ' ' + deger.charAt(0).toUpperCase() + deger.slice(1) +
            '</div>';
    }

    var html = '<h3 style="margin-bottom: 16px;">✏️ Profili Düzenle</h3>' +
        '<div class="form-group">' +
            '<label class="form-label">İsim</label>' +
            '<input type="text" id="duzenle-isim" class="input" value="' + htmlEscape(k.displayName || '') + '">' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">Yaş</label>' +
            '<input type="number" id="duzenle-yas" class="input" value="' + (k.age || '') + '" min="10" max="99">' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">Cinsiyet</label>' +
            '<select id="duzenle-cinsiyet" class="input">' +
                '<option value="unspecified"' + (k.gender === 'unspecified' ? ' selected' : '') + '>Belirtmek istemiyorum</option>' +
                '<option value="male"' + (k.gender === 'male' ? ' selected' : '') + '>Erkek</option>' +
                '<option value="female"' + (k.gender === 'female' ? ' selected' : '') + '>Kadın</option>' +
            '</select>' +
        '</div>' +
        '<div class="form-group">' +
            '<label class="form-label">İlgi Alanları</label>' +
            '<div id="duzenle-ilgi-container" class="ilgi-alanlari">' + ilgiHTML + '</div>' +
        '</div>' +
        '<button class="btn btn-gold btn-block" onclick="profilDuzenleKaydet()">💾 Kaydet</button>';

    modalGoster(html);
}

async function profilDuzenleKaydet() {
    console.log("[profile.js] Profil düzenleme kaydediliyor...");

    if (!mevcutKullanici) return;

    var isim = document.getElementById('duzenle-isim').value.trim();
    var yas = parseInt(document.getElementById('duzenle-yas').value) || 0;
    var cinsiyet = document.getElementById('duzenle-cinsiyet').value;

    // İlgi alanlarını topla
    var ilgiAlanlari = [];
    var chipler = document.querySelectorAll('#duzenle-ilgi-container .ilgi-chip.aktif');
    for (var i = 0; i < chipler.length; i++) {
        ilgiAlanlari.push(chipler[i].getAttribute('data-value'));
    }

    // Validasyonlar
    if (!isim || isim.length < 2 || isim.length > 30) {
        bildirimGoster("İsim 2-30 karakter arasında olmalı.", "uyari");
        return;
    }

    if (yas < 10 || yas > 99) {
        bildirimGoster("Yaş 10-99 arasında olmalı.", "uyari");
        return;
    }

    try {
        var guncelVeri = {
            displayName: isim,
            age: yas,
            gender: cinsiyet,
            interests: ilgiAlanlari,
            lastSeen: Date.now()
        };

        await kullaniciProfilGuncelle(mevcutKullanici.uid, guncelVeri);

        // Leaderboard'da ismi güncelle
        await leaderboardGuncelle(mevcutKullanici.uid, {
            displayName: isim,
            photoURL: kullaniciBilgileri.photoURL || '',
            totalPoints: kullaniciBilgileri.totalPoints || 0,
            lastUpdated: Date.now()
        });

        // Lokal bilgiyi güncelle
        kullaniciBilgileri.displayName = isim;
        kullaniciBilgileri.age = yas;
        kullaniciBilgileri.gender = cinsiyet;
        kullaniciBilgileri.interests = ilgiAlanlari;

        modalKapat();
        profilGoster();
        bildirimGoster("Profil güncellendi! ✅", "basari");
        console.log("[profile.js] Profil düzenleme kaydedildi.");

    } catch (error) {
        console.error("[profile.js] Profil düzenleme kaydetme hatası:", error);
        bildirimGoster("Güncelleme sırasında hata oluştu.", "hata");
    }
}

console.log("[profile.js] Profile modülü yüklendi.");
