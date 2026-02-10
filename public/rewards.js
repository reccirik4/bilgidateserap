// ============================================================
// REWARDS.JS
// Museum Quest — Ödül listesi, QR kupon, navigasyon, işletme onayı
// v2.0 — Lazy loading işletme/ödül desteği
// Bağımlılıklar: auth.js (mevcutKullanici, kullaniciBilgileri)
//                database.js (oduluKullan, kuponlarimOku, kuponGuncelle, puanDus, kullaniciProfilGuncelle)
//                github-storage.js (window.odulListesi, window.isletmeListesi, sehirIsletmeleriniYukle)
//                map.js (mevcutKonum, mesafeHesapla, navigasyonBaslat)
//                ui.js (ekranGoster, bildirimGoster, formatPuan, formatMesafe, onayIste,
//                       htmlEscape, rastgeleKarakter, modalGoster, varsayilanFoto, formatTarih)
//                profile.js (rozetKontrolVeEkle)
// ============================================================

// Aktif filtre
var aktifOdulFiltre = 'tumu';

// Kupon navigasyon için geçici
var kuponIsletmeLat = null;
var kuponIsletmeLng = null;

// Proximity & puan bildirimi için takip setleri
var gosterilenProximityOduller = {};   // session boyunca gösterilen free ödüller
var bildirilenPuanOduller = {};        // session boyunca bildirilen puan ödülleri
var proximityPopupAcik = false;        // aynı anda birden fazla popup önleme

// ──────────────────────────────────────────────
// ÖDÜLLERİ GÖSTER (v2.0 — async + lazy load)
// ──────────────────────────────────────────────
async function odulleriGoster() {
    console.log("[rewards.js] Ödüller gösteriliyor. Filtre:", aktifOdulFiltre);

    var container = document.getElementById('odul-listesi-container');
    if (!container) return;

    // v2.0 — İşletmeler/ödüller henüz yüklenmemişse lazy load et
    if (!window.isletmelerYuklendi) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">⏳ Ödüller yükleniyor...</p>';
        await sehirIsletmeleriniYukle();
    }

    var oduller = window.odulListesi || [];

    if (oduller.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">Henüz ödül eklenmemiş.</p>';
        return;
    }

    // Filtrele
    var filtrelenmis = oduller.filter(function(odul) {
        if (!odul.isActive) return false;
        if (aktifOdulFiltre === 'tumu') return true;
        return odul.category === aktifOdulFiltre;
    });

    if (filtrelenmis.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">Bu kategoride ödül bulunamadı.</p>';
        return;
    }

    // Mesafeye göre sırala (yakından uzağa)
    if (mevcutKonum.lat && mevcutKonum.lng) {
        filtrelenmis.sort(function(a, b) {
            var mA = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, a.latitude, a.longitude);
            var mB = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, b.latitude, b.longitude);
            return mA - mB;
        });
    }

    var html = '';
    var kullaniciPuan = (kullaniciBilgileri && kullaniciBilgileri.totalPoints) || 0;

    for (var i = 0; i < filtrelenmis.length; i++) {
        var odul = filtrelenmis[i];

        var odulTipi = odul.type || 'points';

        // Mesafe
        var mesafeMetin = '';
        var mesafeM = 0;
        if (mevcutKonum.lat && mevcutKonum.lng) {
            mesafeM = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, odul.latitude, odul.longitude);
            mesafeMetin = formatMesafe(mesafeM);
        }

        // Yeterli puan var mı (free ise her zaman yeterli)
        var yeterliMi = odulTipi === 'free' ? true : kullaniciPuan >= odul.requiredPoints;

        // Free ödüllerde proximity kontrolü
        var proximityYakin = false;
        if (odulTipi === 'free' && mevcutKonum.lat && mevcutKonum.lng) {
            var promoR = odul.promoRadius || 500;
            proximityYakin = mesafeM <= promoR;
        }

        var puanRenk = yeterliMi ? 'var(--gold)' : 'var(--text-muted)';

        // Kategori emojisi
        var kategoriEmoji = kategoriEmojiAl(odul.category);

        // Logo
        var logo = odul.businessLogo || odul.photoURL || '';
        var logoHTML = logo
            ? '<img class="odul-kart-logo" src="' + htmlEscape(logo) + '" alt="' + htmlEscape(odul.businessName) + '" onerror="this.style.display=\'none\'">'
            : '<div class="odul-kart-logo" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:var(--bg-primary);">' + kategoriEmoji + '</div>';

        // Puan veya bedava badge
        var puanHTML = '';
        if (odulTipi === 'free') {
            if (proximityYakin) {
                puanHTML = '<span class="badge badge-green">🎉 Bedava — Yakınında!</span>';
            } else {
                puanHTML = '<span class="badge badge-gold">🆓 Bedava</span>';
            }
        } else {
            puanHTML = '<span class="odul-puan" style="color:' + puanRenk + '">⭐ ' + formatPuan(odul.requiredPoints) + '</span>';
        }

        // Buton
        var butonHTML = '';
        if (odulTipi === 'free') {
            if (proximityYakin) {
                butonHTML = '<button class="btn btn-green btn-sm" onclick="oduluAlOnay(\'' + odul.id + '\')">🎁 Hemen Al</button>';
            } else {
                butonHTML = '<button class="btn btn-sm btn-outline" disabled>📍 Yaklaş (' + formatMesafe(odul.promoRadius || 500) + ')</button>';
            }
        } else {
            butonHTML = '<button class="btn btn-gold btn-sm" onclick="oduluAlOnay(\'' + odul.id + '\')" ' +
                (yeterliMi ? '' : 'disabled') + '>' +
                (yeterliMi ? '🎁 Al' : '🔒 Yetersiz') +
                '</button>';
        }

        html += '<div class="odul-kart">' +
            logoHTML +
            '<div class="odul-kart-icerik">' +
                '<div class="odul-baslik">' + kategoriEmoji + ' ' + htmlEscape(odul.title) + '</div>' +
                '<div class="odul-isletme">' + htmlEscape(odul.businessName) + '</div>' +
                '<div class="odul-aciklama">' + htmlEscape(odul.description || '') + '</div>' +
                '<div class="odul-kart-alt">' +
                    puanHTML +
                    (mesafeMetin ? '<span class="odul-mesafe">📍 ' + mesafeMetin + '</span>' : '') +
                '</div>' +
                '<div style="margin-top:8px;display:flex;gap:8px;">' +
                    butonHTML +
                    '<button class="btn btn-sm btn-outline" onclick="odulNavigasyon(' + odul.latitude + ',' + odul.longitude + ')" style="font-size:0.75rem;">🧭</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    container.innerHTML = html;
}

// ──────────────────────────────────────────────
// ÖDÜL FİLTRELEME
// ──────────────────────────────────────────────
function odulFiltrele(kategori, chipEl) {
    aktifOdulFiltre = kategori;

    // Aktif chip'i güncelle
    var chipler = document.querySelectorAll('#odul-filtre-bar .filtre-chip');
    for (var i = 0; i < chipler.length; i++) {
        chipler[i].classList.remove('aktif');
    }
    if (chipEl) chipEl.classList.add('aktif');

    odulleriGoster();
}

// Kategori emojisi
function kategoriEmojiAl(kategori) {
    var emojiler = {
        'drink': '☕',
        'food': '🍕',
        'shopping': '🛍️',
        'experience': '🎭',
        'ticket': '🎟️',
        'discount': '💰'
    };
    return emojiler[kategori] || '🎁';
}

// Ödül navigasyonu
function odulNavigasyon(lat, lng) {
    navigasyonBaslat(lat, lng);
}

// ──────────────────────────────────────────────
// ÖDÜL AL — ONAY & İŞLEM
// ──────────────────────────────────────────────
function oduluAlOnay(rewardId) {
    var odul = odulBul(rewardId);
    if (!odul) {
        bildirimGoster("Ödül bulunamadı.", "hata");
        return;
    }

    var odulTipi = odul.type || 'points';
    var kullaniciPuan = (kullaniciBilgileri && kullaniciBilgileri.totalPoints) || 0;

    // Free ödül — proximity kontrolü
    if (odulTipi === 'free') {
        if (!mevcutKonum.lat || !mevcutKonum.lng) {
            bildirimGoster("Konumun henüz alınamadı.", "uyari");
            return;
        }
        var mesafe = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, odul.latitude, odul.longitude);
        var promoR = odul.promoRadius || 500;
        if (mesafe > promoR) {
            bildirimGoster("📍 " + formatMesafe(mesafe) + " uzaktasın. " + formatMesafe(promoR) + " içine gelmelisin.", "uyari");
            return;
        }

        onayIste(
            '🎉 <strong>' + htmlEscape(odul.title) + '</strong><br>' +
            '<small>' + htmlEscape(odul.businessName) + '</small><br><br>' +
            '🆓 Bu ödül <strong>bedava</strong>! Puan harcanmayacak.<br><br>' +
            'Almak istiyor musun?',
            function() {
                oduluAl(rewardId);
            }
        );
        return;
    }

    // Points ödül — puan kontrolü
    if (kullaniciPuan < odul.requiredPoints) {
        bildirimGoster("Yetersiz puan. " + formatPuan(odul.requiredPoints - kullaniciPuan) + " puan daha gerekiyor.", "uyari");
        return;
    }

    onayIste(
        '🎁 <strong>' + htmlEscape(odul.title) + '</strong><br>' +
        '<small>' + htmlEscape(odul.businessName) + '</small><br><br>' +
        '⭐ <strong>' + formatPuan(odul.requiredPoints) + '</strong> puan harcanacak.<br>' +
        'Kalan puanın: <strong>' + formatPuan(kullaniciPuan - odul.requiredPoints) + '</strong><br><br>' +
        'Onaylıyor musun?',
        function() {
            oduluAl(rewardId);
        }
    );
}

async function oduluAl(rewardId) {
    console.log("[rewards.js] Ödül alınıyor:", rewardId);

    if (!mevcutKullanici || !kullaniciBilgileri) {
        bildirimGoster("Giriş yapmalısın.", "hata");
        return;
    }

    var odul = odulBul(rewardId);
    if (!odul) {
        bildirimGoster("Ödül bulunamadı.", "hata");
        return;
    }

    var odulTipi = odul.type || 'points';
    var kullaniciPuan = kullaniciBilgileri.totalPoints || 0;

    // Points ödül ise puan kontrolü
    if (odulTipi === 'points' && kullaniciPuan < odul.requiredPoints) {
        bildirimGoster("Yetersiz puan.", "uyari");
        return;
    }

    try {
        // 1. Puandan düş (free ise düşme)
        if (odulTipi === 'points' && odul.requiredPoints > 0) {
            await puanDus(mevcutKullanici.uid, odul.requiredPoints);
        }

        // 2. Benzersiz QR kod üret
        var qrKod = 'MQ-' + Date.now() + '-' + rastgeleKarakter(5);

        // 3. Redemption kaydı oluştur
        var kuponVeri = {
            rewardId: odul.id,
            rewardTitle: odul.title,
            businessName: odul.businessName,
            businessId: odul.businessId || '',
            description: odul.description || '',
            pointsSpent: odulTipi === 'free' ? 0 : odul.requiredPoints,
            rewardType: odulTipi,
            qrCode: qrKod,
            status: 'pending',
            latitude: odul.latitude,
            longitude: odul.longitude,
            createdAt: Date.now(),
            confirmedAt: null
        };

        await oduluKullan(mevcutKullanici.uid, kuponVeri);

        // 4. Ödül sayısını artır
        var yeniOdulSayisi = (kullaniciBilgileri.rewardsWon || 0) + 1;
        await kullaniciProfilGuncelle(mevcutKullanici.uid, {
            rewardsWon: yeniOdulSayisi
        });
        kullaniciBilgileri.rewardsWon = yeniOdulSayisi;

        // 5. İlk ödül rozeti
        if (yeniOdulSayisi === 1) {
            rozetKontrolVeEkle('ilk_odul');
        }

        console.log("[rewards.js] Ödül alındı. QR:", qrKod);
        bildirimGoster("Ödül alındı! QR kuponun hazır 🎉", "basari");

        // 6. QR kupon ekranına yönlendir
        qrKuponGoster(qrKod, odul);

    } catch (error) {
        console.error("[rewards.js] Ödül alma hatası:", error);
        bildirimGoster("Ödül alınırken hata oluştu.", "hata");
    }
}

// Ödül bul (ID ile)
function odulBul(rewardId) {
    var oduller = window.odulListesi || [];
    for (var i = 0; i < oduller.length; i++) {
        if (oduller[i].id === rewardId) return oduller[i];
    }
    return null;
}

// ──────────────────────────────────────────────
// QR KUPON GÖSTER
// ──────────────────────────────────────────────
function qrKuponGoster(qrKod, odul) {
    console.log("[rewards.js] QR kupon gösteriliyor:", qrKod);

    // Durum badge
    var durumEl = document.getElementById('kupon-durum-badge');
    if (durumEl) {
        durumEl.textContent = 'Onay Bekliyor';
        durumEl.className = 'kupon-durum bekliyor';
    }

    // QR kodu oluştur
    var qrContainer = document.getElementById('qr-container');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        try {
            new QRCode(qrContainer, {
                text: qrKod,
                width: 200,
                height: 200,
                colorDark: '#0a0a18',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } catch (e) {
            console.error("[rewards.js] QR oluşturma hatası:", e);
            qrContainer.innerHTML = '<p style="color:var(--text-muted);padding:20px;">QR oluşturulamadı</p>';
        }
    }

    // Kupon kodu
    var kodEl = document.getElementById('kupon-kod');
    if (kodEl) kodEl.textContent = qrKod;

    // Ödül bilgileri
    var baslikEl = document.getElementById('kupon-odul-baslik');
    if (baslikEl) baslikEl.textContent = odul.title;

    var isletmeEl = document.getElementById('kupon-isletme-ad');
    if (isletmeEl) isletmeEl.textContent = odul.businessName;

    var aciklamaEl = document.getElementById('kupon-aciklama');
    if (aciklamaEl) aciklamaEl.textContent = odul.description || '';

    // Navigasyon için koordinatları sakla
    kuponIsletmeLat = odul.latitude;
    kuponIsletmeLng = odul.longitude;

    // Ekranı göster
    ekranGoster('ekran-qr-kupon');
}

// Kupon — işletmeye git
function kuponIsletmeyeGit() {
    if (kuponIsletmeLat && kuponIsletmeLng) {
        navigasyonBaslat(kuponIsletmeLat, kuponIsletmeLng);
    } else {
        bildirimGoster("İşletme konumu bulunamadı.", "uyari");
    }
}

// ──────────────────────────────────────────────
// ÖDÜLÜ ONAYLA (İŞLETME TARAFI)
// ──────────────────────────────────────────────
function oduluOnayla(qrKod) {
    console.log("[rewards.js] Ödül onaylanıyor. QR:", qrKod);

    if (!mevcutKullanici) {
        bildirimGoster("Giriş yapmalısın.", "hata");
        return;
    }

    // Kullanıcının kuponlarında bu QR'ı bul
    kuponlarimOku(mevcutKullanici.uid).then(function(kuponlar) {
        if (!kuponlar) {
            bildirimGoster("Kupon bulunamadı.", "hata");
            return;
        }

        var bulundu = false;
        Object.keys(kuponlar).forEach(function(key) {
            var kupon = kuponlar[key];
            if (kupon.qrCode === qrKod && kupon.status === 'pending') {
                bulundu = true;
                kuponGuncelle(mevcutKullanici.uid, key, {
                    status: 'confirmed',
                    confirmedAt: Date.now()
                }).then(function() {
                    bildirimGoster("Kupon onaylandı! ✅", "basari");
                }).catch(function(error) {
                    console.error("[rewards.js] Kupon onay hatası:", error);
                    bildirimGoster("Onay sırasında hata oluştu.", "hata");
                });
            }
        });

        if (!bulundu) {
            bildirimGoster("Geçerli kupon bulunamadı.", "uyari");
        }
    });
}

// ──────────────────────────────────────────────
// KUPONLARIM
// ──────────────────────────────────────────────
async function kuponlarimGoster() {
    console.log("[rewards.js] Kuponlarım gösteriliyor...");

    if (!mevcutKullanici) {
        bildirimGoster("Giriş yapmalısın.", "hata");
        return;
    }

    var kuponlar = await kuponlarimOku(mevcutKullanici.uid);

    if (!kuponlar || Object.keys(kuponlar).length === 0) {
        modalGoster(
            '<h3 style="margin-bottom:16px;">🎟️ Kuponlarım</h3>' +
            '<p style="color:var(--text-muted);text-align:center;padding:24px 0;">Henüz kuponun yok.<br>Ödül alarak kupon kazan!</p>' +
            '<button class="btn btn-outline btn-block btn-sm" onclick="modalKapat()">Kapat</button>'
        );
        return;
    }

    // Kuponları tarihe göre sırala (yeniden eskiye)
    var kuponDizi = [];
    Object.keys(kuponlar).forEach(function(key) {
        var k = kuponlar[key];
        k._key = key;
        kuponDizi.push(k);
    });
    kuponDizi.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });

    var html = '<h3 style="margin-bottom:16px;">🎟️ Kuponlarım (' + kuponDizi.length + ')</h3>';
    html += '<div style="display:flex;flex-direction:column;gap:10px;max-height:60vh;overflow-y:auto;">';

    for (var i = 0; i < kuponDizi.length; i++) {
        var k = kuponDizi[i];

        // Durum kontrolü (süresi dolmuş mu)
        var durum = k.status;
        var durumMetin = '';
        var durumRenk = '';

        if (durum === 'confirmed') {
            durumMetin = '✅ Onaylandı';
            durumRenk = 'var(--green)';
        } else if (durum === 'expired') {
            durumMetin = '⏰ Süresi Doldu';
            durumRenk = 'var(--red)';
        } else {
            durumMetin = '⏳ Onay Bekliyor';
            durumRenk = 'var(--orange)';
        }

        // Tip badge
        var tipBadge = '';
        if (k.rewardType === 'free') {
            tipBadge = '<span class="badge badge-green" style="font-size:0.65rem;padding:2px 6px;">🆓 Bedava</span> ';
        }

        html += '<div class="card" style="padding:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px;">' +
                '<div>' +
                    '<div style="font-weight:600;font-size:0.9375rem;">' + tipBadge + htmlEscape(k.rewardTitle || '') + '</div>' +
                    '<div style="font-size:0.8rem;color:var(--text-dim);">' + htmlEscape(k.businessName || '') + '</div>' +
                '</div>' +
                '<span style="font-size:0.75rem;font-weight:600;color:' + durumRenk + ';">' + durumMetin + '</span>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">' +
                '<span style="font-size:0.75rem;color:var(--text-muted);">' + formatTarih(k.createdAt) + '</span>' +
                '<span style="font-size:0.75rem;color:var(--gold);letter-spacing:1px;font-weight:600;">' + htmlEscape(k.qrCode || '') + '</span>' +
            '</div>';

        // Bekleyen kupon ise QR göster butonu ekle
        if (durum === 'pending') {
            html += '<button class="btn btn-gold btn-sm btn-block" style="margin-top:8px;" ' +
                'onclick="modalKapat();kuponDetayGoster(\'' + htmlEscape(k._key) + '\')">📱 QR Göster</button>';
        }

        html += '</div>';
    }

    html += '</div>';
    html += '<button class="btn btn-outline btn-block btn-sm" style="margin-top:12px;" onclick="modalKapat()">Kapat</button>';

    modalGoster(html);
}

// Kupon detay — QR tekrar göster
async function kuponDetayGoster(kuponKey) {
    if (!mevcutKullanici) return;

    var kuponlar = await kuponlarimOku(mevcutKullanici.uid);
    if (!kuponlar || !kuponlar[kuponKey]) {
        bildirimGoster("Kupon bulunamadı.", "hata");
        return;
    }

    var k = kuponlar[kuponKey];

    // Ödül bilgilerini bul
    var odul = odulBul(k.rewardId) || {
        title: k.rewardTitle,
        businessName: k.businessName,
        description: k.description || '',
        latitude: k.latitude,
        longitude: k.longitude
    };

    qrKuponGoster(k.qrCode, odul);
}

// ──────────────────────────────────────────────
// PROXIMITY ÖDÜL KONTROLÜ (map.js konumGuncelle'den çağrılır)
// v2.0 — İşletmeler yüklenmemişse async lazy load tetikle
// ──────────────────────────────────────────────
function proximityOdulKontrol() {
    // Konum yoksa çık
    if (!mevcutKonum.lat || !mevcutKonum.lng) return;
    // Kullanıcı giriş yapmamışsa çık
    if (!mevcutKullanici || !kullaniciBilgileri) return;
    // Popup zaten açıksa çık
    if (proximityPopupAcik) return;

    // v2.0 — İşletmeler henüz yüklenmemişse arka planda yükle
    if (!window.isletmelerYuklendi) {
        sehirIsletmeleriniYukle().then(function() {
            // Yüklendikten sonra tekrar kontrol et
            proximityOdulKontrolIslemi();
        });
        return;
    }

    proximityOdulKontrolIslemi();
}

// Proximity kontrol asıl işlemi (ayrılmış — async sonrası da çağrılabilir)
function proximityOdulKontrolIslemi() {
    if (!mevcutKonum.lat || !mevcutKonum.lng) return;
    if (!mevcutKullanici || !kullaniciBilgileri) return;
    if (proximityPopupAcik) return;

    var oduller = window.odulListesi || [];

    for (var i = 0; i < oduller.length; i++) {
        var odul = oduller[i];

        // Sadece aktif free ödülleri kontrol et
        if (!odul.isActive) continue;
        if ((odul.type || 'points') !== 'free') continue;

        // Bu session'da zaten gösterildi mi
        if (gosterilenProximityOduller[odul.id]) continue;

        var promoR = odul.promoRadius || 500;
        var mesafe = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, odul.latitude, odul.longitude);

        if (mesafe <= promoR) {
            // Gösterildi olarak işaretle
            gosterilenProximityOduller[odul.id] = true;
            // Popup göster
            proximityOdulPopupGoster(odul, mesafe);
            break; // Tek seferde bir popup
        }
    }
}

function proximityOdulPopupGoster(odul, mesafe) {
    console.log("[rewards.js] Proximity ödül popup:", odul.title, mesafe.toFixed(0) + "m");
    proximityPopupAcik = true;

    var kategoriEmoji = kategoriEmojiAl(odul.category);
    var mesafeMetin = formatMesafe(mesafe);

    var html = '<div style="text-align:center;">' +
        '<div style="font-size:3rem;margin-bottom:12px;">🎉</div>' +
        '<div style="font-size:1.25rem;font-weight:700;margin-bottom:4px;">Bedava Ödül Yakınında!</div>' +
        '<div style="font-size:0.875rem;color:var(--text-dim);margin-bottom:16px;">Bir işletme sana hediye sunuyor</div>' +
        '<div class="card" style="text-align:left;margin-bottom:16px;border-color:var(--gold);">' +
            '<div style="font-weight:700;font-size:1rem;margin-bottom:4px;">' + kategoriEmoji + ' ' + htmlEscape(odul.title) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:4px;">' + htmlEscape(odul.businessName) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">' + htmlEscape(odul.description || '') + '</div>' +
            '<div style="display:flex;gap:12px;align-items:center;">' +
                '<span class="badge badge-green">🆓 Bedava</span>' +
                '<span style="font-size:0.8rem;color:var(--orange);">📍 ' + mesafeMetin + '</span>' +
            '</div>' +
        '</div>' +
        '<div style="display:flex;gap:12px;">' +
            '<button class="btn btn-outline" style="flex:1;" onclick="proximityPopupKapat()">Sonra</button>' +
            '<button class="btn btn-green" style="flex:1;" onclick="proximityPopupKapat();oduluAlOnay(\'' + odul.id + '\')">🎁 Hemen Al</button>' +
        '</div>' +
    '</div>';

    modalGoster(html);
}

function proximityPopupKapat() {
    proximityPopupAcik = false;
    if (typeof modalKapat === 'function') {
        modalKapat();
    }
}

// ──────────────────────────────────────────────
// PUAN EŞİĞİ BİLDİRİMİ (database.js puanEkle'den çağrılır)
// ──────────────────────────────────────────────
function puanEsigiOdulKontrol(eskiPuan, yeniPuan) {
    // Kullanıcı giriş yapmamışsa çık
    if (!mevcutKullanici || !kullaniciBilgileri) return;
    // Popup açıksa çık
    if (proximityPopupAcik) return;

    // v2.0 — İşletmeler yüklenmemişse bu kontrolü atla
    // (Ödüller zaten yüklenmeden puan eşiği kontrolü anlamsız)
    if (!window.isletmelerYuklendi) return;

    var oduller = window.odulListesi || [];

    for (var i = 0; i < oduller.length; i++) {
        var odul = oduller[i];

        // Sadece aktif points ödüllerini kontrol et
        if (!odul.isActive) continue;
        if ((odul.type || 'points') !== 'points') continue;
        if (!odul.requiredPoints || odul.requiredPoints <= 0) continue;

        // Bu session'da zaten bildirildi mi
        if (bildirilenPuanOduller[odul.id]) continue;

        // Eski puan yetersiz VE yeni puan yeterli ise → bildir
        if (eskiPuan < odul.requiredPoints && yeniPuan >= odul.requiredPoints) {
            bildirilenPuanOduller[odul.id] = true;
            puanEsigiPopupGoster(odul);
            break; // Tek seferde bir popup
        }
    }
}

function puanEsigiPopupGoster(odul) {
    console.log("[rewards.js] Puan eşiği popup:", odul.title);
    proximityPopupAcik = true;

    var kategoriEmoji = kategoriEmojiAl(odul.category);

    // Mesafe
    var mesafeMetin = '';
    if (mevcutKonum.lat && mevcutKonum.lng) {
        var m = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, odul.latitude, odul.longitude);
        mesafeMetin = formatMesafe(m);
    }

    var html = '<div style="text-align:center;">' +
        '<div style="font-size:3rem;margin-bottom:12px;">⭐</div>' +
        '<div style="font-size:1.25rem;font-weight:700;margin-bottom:4px;">Yeni Ödül Açıldı!</div>' +
        '<div style="font-size:0.875rem;color:var(--text-dim);margin-bottom:16px;">Puanın yeni bir ödülü almaya yeter</div>' +
        '<div class="card" style="text-align:left;margin-bottom:16px;border-color:var(--gold);">' +
            '<div style="font-weight:700;font-size:1rem;margin-bottom:4px;">' + kategoriEmoji + ' ' + htmlEscape(odul.title) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:4px;">' + htmlEscape(odul.businessName) + '</div>' +
            '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:8px;">' + htmlEscape(odul.description || '') + '</div>' +
            '<div style="display:flex;gap:12px;align-items:center;">' +
                '<span class="odul-puan" style="color:var(--gold);font-size:0.85rem;font-weight:700;">⭐ ' + formatPuan(odul.requiredPoints) + '</span>' +
                (mesafeMetin ? '<span style="font-size:0.8rem;color:var(--orange);">📍 ' + mesafeMetin + '</span>' : '') +
            '</div>' +
        '</div>' +
        '<div style="display:flex;gap:12px;">' +
            '<button class="btn btn-outline" style="flex:1;" onclick="proximityPopupKapat()">Sonra</button>' +
            '<button class="btn btn-gold" style="flex:1;" onclick="proximityPopupKapat();oduluAlOnay(\'' + odul.id + '\')">🎁 Hemen Al</button>' +
        '</div>' +
    '</div>';

    modalGoster(html);
}

console.log("[rewards.js] Rewards modülü yüklendi. (v2.0 — Lazy Loading)");