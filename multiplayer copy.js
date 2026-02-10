// ============================================================
// MULTIPLAYER.JS
// Museum Quest — Birlikte oyna: davet, eşleşme, sohbet, TKM, 2x quiz
// Bağımlılıklar: auth.js (mevcutKullanici, kullaniciBilgileri)
//                database.js (aktifOyuncuEkle/Sil, aktifOyunculariDinle, eslesmeOlustur/Guncelle/Dinle,
//                             chatMesajGonder/Dinle, gelenDavetleriDinle, dbOku)
//                map.js (mevcutKonum, mesafeHesapla, navigasyonBaslat)
//                quiz.js (mevcutQuiz, quizBaslat)
//                ui.js (ekranGoster, bildirimGoster, formatMesafe, davetPopupAc/Kapat, lightboxAc,
//                       htmlEscape, varsayilanFoto, formatSaat)
// ============================================================

// Global multiplayer değişkenleri
var eslesmeAktif = false;
var mevcutEslesme = null;           // pair_request nesnesi
var mevcutEslesmeKey = null;        // pair_request firebase key
var partnerBilgileri = null;        // Partner kullanıcı bilgileri
var partnerKonum = { lat: null, lng: null };
var mesafeKontrolInterval = null;
var birlikteQuizMesafeInterval = null;
var mevcutBirlikteLokayon = null;   // Birlikte oynanan lokasyon ID
var bekleyenDavetKey = null;        // Bekleyen gelen davet key'i
var pairingOpenDurum = false;       // Görünürlük durumu

// ──────────────────────────────────────────────
// ADIM 1 — BİRLİKTE OYNA TOGGLE (GÖRÜNÜR OL)
// ──────────────────────────────────────────────
function birlikteOynaToggle() {
    if (!mevcutKullanici || !kullaniciBilgileri) {
        bildirimGoster("Önce giriş yapmalısın.", "uyari");
        return;
    }

    if (!mevcutMekanId) {
        bildirimGoster("Önce bir mekan seç.", "uyari");
        return;
    }

    // Lokasyona 1 km yakınlık kontrolü
    if (!pairingOpenDurum) {
        if (!mevcutKonum.lat || !mevcutKonum.lng) {
            bildirimGoster("Konum henüz alınamadı. Lütfen bekle.", "uyari");
            return;
        }
        if (mevcutMekanLat && mevcutMekanLng) {
            var lokasyonMesafe = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, mevcutMekanLat, mevcutMekanLng);
            if (lokasyonMesafe > 1000) {
                bildirimGoster("📍 Mekana " + formatMesafe(lokasyonMesafe) + " uzaktasın. 1 km içinde olmalısın.", "uyari");
                return;
            }
        }
    }

    pairingOpenDurum = !pairingOpenDurum;

    var btn = document.getElementById('eslestirme-toggle-btn');

    if (pairingOpenDurum) {
        console.log("[multiplayer.js] Görünürlük açıldı:", mevcutMekanId);

        // Firebase'e aktif oyuncu olarak kayıt ekle
        var oyuncuVeri = {
            displayName: kullaniciBilgileri.displayName || '',
            photoURL: kullaniciBilgileri.photoURL || '',
            age: kullaniciBilgileri.age || 0,
            gender: kullaniciBilgileri.gender || 'unspecified',
            xpLevel: kullaniciBilgileri.xpLevel || 1,
            latitude: mevcutKonum.lat || 0,
            longitude: mevcutKonum.lng || 0,
            pairingOpen: true,
            lastUpdate: Date.now()
        };

        aktifOyuncuEkle(mevcutMekanId, mevcutKullanici.uid, oyuncuVeri);

        // Kullanıcı profilini güncelle
        kullaniciProfilGuncelle(mevcutKullanici.uid, { pairingOpen: true });

        if (btn) {
            btn.innerHTML = '🟢 Görünürsün';
            btn.classList.remove('btn-outline');
            btn.classList.add('btn-green');
        }

        bildirimGoster("Artık diğer oyuncular seni görebilir! 📡", "basari");

        // Konum güncellemesi başlat
        aktifOyuncuKonumGuncelle();

        // Gelen davetleri dinlemeye başla
        gelenDavetleriDinlemeBaslat();

    } else {
        console.log("[multiplayer.js] Görünürlük kapatıldı.");

        // Firebase'den aktif oyuncu kaydını sil
        aktifOyuncuSil(mevcutMekanId, mevcutKullanici.uid);
        kullaniciProfilGuncelle(mevcutKullanici.uid, { pairingOpen: false });

        if (btn) {
            btn.innerHTML = '📡 Görünür Ol';
            btn.classList.remove('btn-green');
            btn.classList.add('btn-outline');
        }

        bildirimGoster("Görünürlük kapatıldı.", "bilgi");
    }
}

// Aktif oyuncu konum güncelleme (her 10 saniye)
var konumGuncelleInterval = null;

function aktifOyuncuKonumGuncelle() {
    if (konumGuncelleInterval) clearInterval(konumGuncelleInterval);

    konumGuncelleInterval = setInterval(function() {
        if (!pairingOpenDurum || !mevcutKullanici || !mevcutMekanId) {
            clearInterval(konumGuncelleInterval);
            return;
        }
        if (mevcutKonum.lat && mevcutKonum.lng) {
            dbGuncelle('active_players/' + mevcutMekanId + '/' + mevcutKullanici.uid, {
                latitude: mevcutKonum.lat,
                longitude: mevcutKonum.lng,
                lastUpdate: Date.now()
            });
        }
    }, 10000);
}

// ──────────────────────────────────────────────
// ADIM 2 — YAKINDAKI OYUNCULARI LİSTELE
// ──────────────────────────────────────────────
function yakinOyunculariGoster(locationId) {
    console.log("[multiplayer.js] Yakın oyuncular gösteriliyor:", locationId);

    mevcutBirlikteLokayon = locationId;
    var container = document.getElementById('yakin-oyuncular');
    if (!container) return;

    // Dinlemeyi başlat
    aktifOyunculariDinle(locationId, function(oyuncular) {
        if (!oyuncular) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">Yakınında henüz oyuncu yok</p>';
            return;
        }

        var html = '';
        var oyuncuSayisi = 0;

        Object.keys(oyuncular).forEach(function(uid) {
            // Kendini gösterme
            if (mevcutKullanici && uid === mevcutKullanici.uid) return;

            var o = oyuncular[uid];
            if (!o.pairingOpen) return;

            oyuncuSayisi++;

            // Mesafe hesapla
            var mesafe = '';

            var foto = o.photoURL || varsayilanFoto();
            var cinsiyet = o.gender === 'male' ? '♂️' : (o.gender === 'female' ? '♀️' : '');
            var yas = o.age ? o.age + ' yaş' : '';

            // 1 km mesafe kontrolü
            var davetAktif = true;
            var mesafeMetin = '';
            if (mevcutKonum.lat && mevcutKonum.lng && o.latitude && o.longitude) {
                var m = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, o.latitude, o.longitude);
                mesafe = formatMesafe(m);
                if (m > 1000) {
                    davetAktif = false;
                    mesafeMetin = '🔒 1 km\'den uzak';
                }
            }

            var davetBtnHTML = davetAktif
                ? '<button class="btn btn-gold btn-sm" onclick="davetGonder(\'' + uid + '\')">Davet</button>'
                : '<button class="btn btn-outline btn-sm" disabled title="1 km içinde olmalısınız">🔒 Uzak</button>';

            html += '<div class="oyuncu-kart">' +
                '<div class="oyuncu-kart-foto" onclick="lightboxAc(\'' + htmlEscape(foto) + '\')">' +
                    '<img class="avatar" src="' + htmlEscape(foto) + '" alt="' + htmlEscape(o.displayName) + '" onerror="this.src=varsayilanFoto()">' +
                '</div>' +
                '<div class="oyuncu-kart-bilgi">' +
                    '<div class="oyuncu-ad">' + htmlEscape(o.displayName || 'Oyuncu') + '</div>' +
                    '<div class="oyuncu-detay">' +
                        (yas ? '<span>' + yas + '</span>' : '') +
                        (cinsiyet ? '<span>' + cinsiyet + '</span>' : '') +
                        '<span>⭐ Lv.' + (o.xpLevel || 1) + '</span>' +
                    '</div>' +
                    (mesafe ? '<div class="oyuncu-mesafe">📍 ' + mesafe + (mesafeMetin ? ' — ' + mesafeMetin : '') + '</div>' : '') +
                '</div>' +
                davetBtnHTML +
            '</div>';
        });

        if (oyuncuSayisi === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">Yakınında henüz eşleşmeye açık oyuncu yok</p>';
        } else {
            container.innerHTML = html;
        }
    });
}

// ──────────────────────────────────────────────
// ADIM 3 — DAVET GÖNDER & YANIT
// ──────────────────────────────────────────────
function davetGonder(hedefUid) {
    console.log("[multiplayer.js] Davet gönderiliyor:", hedefUid);

    if (!mevcutKullanici || !kullaniciBilgileri) {
        bildirimGoster("Giriş yapmalısın.", "uyari");
        return;
    }

    if (hedefUid === mevcutKullanici.uid) {
        bildirimGoster("Kendine davet gönderemezsin. 😄", "uyari");
        return;
    }

    // Hedef oyuncunun konumunu kontrol et (1 km limiti)
    var locationId = mevcutBirlikteLokayon || mevcutMekanId;
    if (locationId && mevcutKonum.lat && mevcutKonum.lng) {
        dbOku('active_players/' + locationId + '/' + hedefUid).then(function(hedefOyuncu) {
            if (hedefOyuncu && hedefOyuncu.latitude && hedefOyuncu.longitude) {
                var mesafe = mesafeHesapla(mevcutKonum.lat, mevcutKonum.lng, hedefOyuncu.latitude, hedefOyuncu.longitude);
                if (mesafe > 1000) {
                    bildirimGoster("📍 Bu oyuncu " + formatMesafe(mesafe) + " uzakta. 1 km içinde olmalısınız.", "uyari");
                    return;
                }
            }
            // Mesafe uygun — daveti gönder
            davetOlusturVeGonder(hedefUid, locationId);
        }).catch(function() {
            // Konum okunamazsa yine de gönder
            davetOlusturVeGonder(hedefUid, locationId);
        });
    } else {
        davetOlusturVeGonder(hedefUid, locationId);
    }
}

function davetOlusturVeGonder(hedefUid, locationId) {
    var davetVeri = {
        senderId: mevcutKullanici.uid,
        senderName: kullaniciBilgileri.displayName || '',
        senderPhoto: kullaniciBilgileri.photoURL || '',
        receiverId: hedefUid,
        locationId: mevcutBirlikteLokayon || mevcutMekanId,
        status: 'pending',
        hostUserId: null,
        rpsResult: null,
        senderReady: false,
        receiverReady: false,
        createdAt: Date.now(),
        respondedAt: null
    };

    eslesmeOlustur(davetVeri).then(function(ref) {
        var requestKey = ref.key;
        console.log("[multiplayer.js] Davet oluşturuldu:", requestKey);
        bildirimGoster("Davet gönderildi! Yanıt bekleniyor... ⏳", "bilgi");

        // Bu daveti dinle (yanıt gelecek)
        eslesmeDinle(requestKey, function(data) {
            if (!data) return;

            if (data.status === 'accepted') {
                eslesmeDinlemeyiBirak(requestKey);
                bildirimGoster(data.receiverName + " daveti kabul etti! 🎉", "basari");
                eslesmeKabulEdildi(requestKey, data);
            } else if (data.status === 'rejected') {
                eslesmeDinlemeyiBirak(requestKey);
                bildirimGoster("Davet reddedildi. 😕", "uyari");
            } else if (data.status === 'expired') {
                eslesmeDinlemeyiBirak(requestKey);
                bildirimGoster("Davet zaman aşımına uğradı.", "uyari");
            }
        });

        // 60 saniye timeout
        setTimeout(function() {
            dbOku('pair_requests/' + requestKey).then(function(data) {
                if (data && data.status === 'pending') {
                    eslesmeGuncelle(requestKey, { status: 'expired' });
                    bildirimGoster("Davet zaman aşımına uğradı.", "uyari");
                }
            });
        }, 60000);

    }).catch(function(error) {
        console.error("[multiplayer.js] Davet gönderme hatası:", error);
        bildirimGoster("Davet gönderilemedi.", "hata");
    });
}

// ──────────────────────────────────────────────
// GELEN DAVETLERİ DİNLE
// ──────────────────────────────────────────────
function gelenDavetleriDinlemeBaslat() {
    if (!mevcutKullanici) return;

    console.log("[multiplayer.js] Gelen davetler dinleniyor...");

    gelenDavetleriDinle(mevcutKullanici.uid, function(request) {
        console.log("[multiplayer.js] Gelen davet:", request._key);
        davetPopupGoster(request);
    });
}

function davetPopupGoster(request) {
    bekleyenDavetKey = request._key;

    var fotoEl = document.getElementById('davet-foto');
    if (fotoEl) {
        fotoEl.src = request.senderPhoto || varsayilanFoto();
        fotoEl.onerror = function() { this.src = varsayilanFoto(); };
    }

    var baslikEl = document.getElementById('davet-baslik');
    if (baslikEl) baslikEl.textContent = (request.senderName || 'Bir oyuncu') + ' seni davet ediyor!';

    var aciklamaEl = document.getElementById('davet-aciklama');
    if (aciklamaEl) aciklamaEl.textContent = 'Birlikte quiz oynayıp 2x puan kazanmak ister misin?';

    davetPopupAc();

    // 60 saniye timeout
    setTimeout(function() {
        if (bekleyenDavetKey === request._key) {
            davetPopupKapat();
            dbOku('pair_requests/' + request._key).then(function(data) {
                if (data && data.status === 'pending') {
                    eslesmeGuncelle(request._key, { status: 'expired' });
                }
            });
        }
    }, 60000);
}

function davetiKabulEtUI() {
    if (!bekleyenDavetKey) return;
    davetPopupKapat();
    davetiKabulEt(bekleyenDavetKey);
}

function davetiReddetUI() {
    if (!bekleyenDavetKey) return;
    davetPopupKapat();
    davetiReddet(bekleyenDavetKey);
}

function davetiKabulEt(requestKey) {
    console.log("[multiplayer.js] Davet kabul ediliyor:", requestKey);

    eslesmeGuncelle(requestKey, {
        status: 'accepted',
        receiverName: kullaniciBilgileri.displayName || '',
        receiverPhoto: kullaniciBilgileri.photoURL || '',
        respondedAt: Date.now()
    }).then(function() {
        bildirimGoster("Davet kabul edildi! Sohbete yönlendiriliyorsun... 💬", "basari");

        // Eşleşme verisini oku
        dbOku('pair_requests/' + requestKey).then(function(data) {
            if (data) {
                eslesmeKabulEdildi(requestKey, data);
            }
        });
    }).catch(function(error) {
        console.error("[multiplayer.js] Davet kabul hatası:", error);
        bildirimGoster("Bir hata oluştu.", "hata");
    });
}

function davetiReddet(requestKey) {
    console.log("[multiplayer.js] Davet reddediliyor:", requestKey);
    eslesmeGuncelle(requestKey, {
        status: 'rejected',
        respondedAt: Date.now()
    });
}

// ──────────────────────────────────────────────
// EŞLEŞME KABUL EDİLDİ — SOHBETE GEÇ
// ──────────────────────────────────────────────
function eslesmeKabulEdildi(requestKey, data) {
    console.log("[multiplayer.js] Eşleşme kabul edildi, sohbete geçiliyor...");

    mevcutEslesmeKey = requestKey;
    mevcutEslesme = data;

    // Partner bilgilerini belirle
    var benSenderMiyim = (mevcutKullanici.uid === data.senderId);

    partnerBilgileri = {
        uid: benSenderMiyim ? data.receiverId : data.senderId,
        displayName: benSenderMiyim ? (data.receiverName || 'Oyuncu') : (data.senderName || 'Oyuncu'),
        photoURL: benSenderMiyim ? (data.receiverPhoto || '') : (data.senderPhoto || '')
    };

    // Sohbete geç
    sohbetBaslat(requestKey);
}

// ──────────────────────────────────────────────
// ADIM 4 — SOHBET & NAVİGASYON
// ──────────────────────────────────────────────
function sohbetBaslat(pairId) {
    console.log("[multiplayer.js] Sohbet başlatılıyor:", pairId);

    // Partner bilgilerini ekrana yaz
    var fotoEl = document.getElementById('sohbet-partner-foto');
    if (fotoEl) {
        fotoEl.src = partnerBilgileri.photoURL || varsayilanFoto();
        fotoEl.onerror = function() { this.src = varsayilanFoto(); };
    }

    var adEl = document.getElementById('sohbet-partner-ad');
    if (adEl) adEl.textContent = partnerBilgileri.displayName;

    // Mesajları temizle
    var mesajlarEl = document.getElementById('sohbet-mesajlar');
    if (mesajlarEl) mesajlarEl.innerHTML = '';

    // Buluşma barını göster
    var bulusmaBar = document.getElementById('sohbet-bulusma-bar');
    if (bulusmaBar) bulusmaBar.classList.remove('gizli');

    // Ekranı göster
    ekranGoster('ekran-sohbet');

    // Chat mesajlarını dinle
    chatDinle(pairId, function(mesaj) {
        chatMesajGoster(mesaj);
    });

    // Mesafe takibini başlat
    mesafeKontrolBaslat();

    // Partner konumunu dinle
    partnerKonumDinle();
}

function chatMesajGoster(mesaj) {
    var mesajlarEl = document.getElementById('sohbet-mesajlar');
    if (!mesajlarEl) return;

    var benMiyim = (mevcutKullanici && mesaj.senderId === mevcutKullanici.uid);

    var div = document.createElement('div');
    div.className = 'mesaj ' + (benMiyim ? 'ben' : 'partner');
    div.innerHTML = htmlEscape(mesaj.text) +
        '<div class="mesaj-zaman">' + formatSaat(mesaj.timestamp) + '</div>';

    mesajlarEl.appendChild(div);

    // En alta scroll
    mesajlarEl.scrollTop = mesajlarEl.scrollHeight;
}

function mesajGonderUI() {
    var inputEl = document.getElementById('sohbet-input');
    if (!inputEl) return;

    var metin = inputEl.value.trim();
    if (!metin) return;
    if (!mevcutEslesmeKey || !mevcutKullanici) return;

    chatMesajGonder(mevcutEslesmeKey, {
        senderId: mevcutKullanici.uid,
        text: metin,
        timestamp: Date.now()
    });

    inputEl.value = '';
    inputEl.focus();
}

function sohbettenCik() {
    console.log("[multiplayer.js] Sohbetten çıkılıyor...");

    // Dinlemeleri durdur
    if (mevcutEslesmeKey) {
        chatDinlemeyiBirak(mevcutEslesmeKey);
    }
    mesafeKontrolDurdur();
    partnerKonumDinlemeyiBirak();

    // Haritaya dön
    ekranGoster('ekran-harita');
}

// Partner navigasyonu
function partnerNavigasyonBaslat() {
    if (partnerKonum.lat && partnerKonum.lng) {
        navigasyonBaslat(partnerKonum.lat, partnerKonum.lng);
    } else {
        bildirimGoster("Partner konumu henüz alınamadı.", "uyari");
    }
}

// Partner konumunu dinle
function partnerKonumDinle() {
    if (!partnerBilgileri || !mevcutBirlikteLokayon) return;

    dbDinle('active_players/' + mevcutBirlikteLokayon + '/' + partnerBilgileri.uid, function(data) {
        if (data && data.latitude && data.longitude) {
            partnerKonum.lat = data.latitude;
            partnerKonum.lng = data.longitude;
        }
    });
}

function partnerKonumDinlemeyiBirak() {
    if (partnerBilgileri && mevcutBirlikteLokayon) {
        dbDinlemeyiBirak('active_players/' + mevcutBirlikteLokayon + '/' + partnerBilgileri.uid);
    }
}

// ──────────────────────────────────────────────
// ADIM 5 — BULUŞMA ONAYI (≤30m)
// ──────────────────────────────────────────────
function mesafeKontrolBaslat() {
    console.log("[multiplayer.js] Mesafe kontrol başlatılıyor...");
    mesafeKontrolDurdur();

    mesafeKontrolInterval = setInterval(function() {
        bulusmaKontrol();
    }, 3000); // Her 3 saniyede bir
}

function mesafeKontrolDurdur() {
    if (mesafeKontrolInterval) {
        clearInterval(mesafeKontrolInterval);
        mesafeKontrolInterval = null;
    }
}

function bulusmaKontrol() {
    if (!mevcutKonum.lat || !partnerKonum.lat) return;

    var mesafe = mesafeHesapla(
        mevcutKonum.lat, mevcutKonum.lng,
        partnerKonum.lat, partnerKonum.lng
    );

    // Partner mesafe göster (sohbet üst bar)
    var mesafeEl = document.getElementById('sohbet-partner-mesafe');
    if (mesafeEl) mesafeEl.textContent = '📍 ' + formatMesafe(mesafe);

    // Buluşma butonu
    var bulusmaBtn = document.getElementById('bulusma-btn');
    var bulumaMesajEl = document.getElementById('bulusma-mesafe-metin');

    if (mesafe <= 30) {
        // ≤30m — Buluşma butonu aktif
        if (bulusmaBtn) bulusmaBtn.disabled = false;
        if (bulumaMesajEl) bulumaMesajEl.textContent = '✅ Buluşma mesafesi içindesiniz! (' + Math.round(mesafe) + 'm)';
    } else {
        // >30m — Buton pasif
        if (bulusmaBtn) bulusmaBtn.disabled = true;
        if (bulumaMesajEl) bulumaMesajEl.textContent = '🚶 Daha yaklaşmanız gerekiyor (' + formatMesafe(mesafe) + ')';
    }
}

function bulustukOnayla() {
    console.log("[multiplayer.js] Buluşma onaylanıyor...");

    if (!mevcutEslesmeKey || !mevcutKullanici) return;

    var benSenderMiyim = (mevcutEslesme && mevcutKullanici.uid === mevcutEslesme.senderId);
    var guncelAlan = benSenderMiyim ? 'senderReady' : 'receiverReady';

    var update = {};
    update[guncelAlan] = true;
    eslesmeGuncelle(mevcutEslesmeKey, update);

    bildirimGoster("Onayın kaydedildi! Partner bekleniyor... ⏳", "bilgi");

    // Eşleşmeyi dinle — iki taraf da ready olunca TKM'ye geç
    eslesmeDinle(mevcutEslesmeKey, function(data) {
        if (!data) return;

        if (data.senderReady && data.receiverReady) {
            eslesmeDinlemeyiBirak(mevcutEslesmeKey);
            mesafeKontrolDurdur();
            mevcutEslesme = data;

            bildirimGoster("Buluştunuz! Taş Kağıt Makas'a geçiliyor... ✊✋✌️", "basari");

            setTimeout(function() {
                tasKagitMakasEkraniniHazirla();
            }, 1000);
        }
    });
}

// ──────────────────────────────────────────────
// ADIM 6 — TAŞ KAĞIT MAKAS
// ──────────────────────────────────────────────
function tasKagitMakasEkraniniHazirla() {
    console.log("[multiplayer.js] TKM ekranı hazırlanıyor...");

    var benSenderMiyim = (mevcutEslesme && mevcutKullanici.uid === mevcutEslesme.senderId);

    // Oyuncu 1 (ben)
    var foto1El = document.getElementById('rps-oyuncu1-foto');
    if (foto1El) {
        foto1El.src = kullaniciBilgileri.photoURL || varsayilanFoto();
        foto1El.onerror = function() { this.src = varsayilanFoto(); };
    }
    var ad1El = document.getElementById('rps-oyuncu1-ad');
    if (ad1El) ad1El.textContent = kullaniciBilgileri.displayName || 'Ben';

    // Oyuncu 2 (partner)
    var foto2El = document.getElementById('rps-oyuncu2-foto');
    if (foto2El) {
        foto2El.src = (partnerBilgileri && partnerBilgileri.photoURL) || varsayilanFoto();
        foto2El.onerror = function() { this.src = varsayilanFoto(); };
    }
    var ad2El = document.getElementById('rps-oyuncu2-ad');
    if (ad2El) ad2El.textContent = (partnerBilgileri && partnerBilgileri.displayName) || 'Partner';

    // Elleri sıfırla
    var el1 = document.getElementById('rps-oyuncu1-el');
    var el2 = document.getElementById('rps-oyuncu2-el');
    if (el1) { el1.textContent = '✊'; el1.classList.remove('durdu'); }
    if (el2) { el2.textContent = '✊'; el2.classList.remove('durdu'); }

    // Geri sayımı ve sonucu gizle
    var gsEl = document.getElementById('rps-geri-sayim');
    if (gsEl) gsEl.classList.add('gizli');
    var sonucEl = document.getElementById('rps-sonuc-metin');
    if (sonucEl) sonucEl.classList.add('gizli');

    // Butonları ayarla
    var baslatBtn = document.getElementById('rps-baslat-btn');
    if (baslatBtn) { baslatBtn.classList.remove('gizli'); baslatBtn.disabled = false; }
    var quizBtn = document.getElementById('rps-quiz-btn');
    if (quizBtn) quizBtn.classList.add('gizli');

    ekranGoster('ekran-tas-kagit-makas');
}

function tasKagitMakasOynat() {
    console.log("[multiplayer.js] TKM oynatılıyor...");

    var baslatBtn = document.getElementById('rps-baslat-btn');
    if (baslatBtn) baslatBtn.disabled = true;

    var secenekler = ['rock', 'paper', 'scissors'];
    var emojiler = { rock: '✊', paper: '✋', scissors: '✌️' };

    // Rastgele seç
    var oyuncu1Secim = secenekler[Math.floor(Math.random() * 3)];
    var oyuncu2Secim = secenekler[Math.floor(Math.random() * 3)];

    // Geri sayım göster
    var gsEl = document.getElementById('rps-geri-sayim');
    if (gsEl) gsEl.classList.remove('gizli');

    var sayac = 3;
    gsEl.textContent = sayac;

    var geriSayimInterval = setInterval(function() {
        sayac--;
        if (sayac > 0) {
            gsEl.textContent = sayac;
        } else {
            clearInterval(geriSayimInterval);
            gsEl.classList.add('gizli');

            // Elleri göster
            tkmSonucGoster(oyuncu1Secim, oyuncu2Secim, emojiler);
        }
    }, 800);
}

function tkmSonucGoster(secim1, secim2, emojiler) {
    var el1 = document.getElementById('rps-oyuncu1-el');
    var el2 = document.getElementById('rps-oyuncu2-el');

    if (el1) { el1.textContent = emojiler[secim1]; el1.classList.add('durdu'); }
    if (el2) { el2.textContent = emojiler[secim2]; el2.classList.add('durdu'); }

    // Kazananı belirle
    var kazanan = tkmKazananBelirle(secim1, secim2);
    var sonucEl = document.getElementById('rps-sonuc-metin');
    var baslatBtn = document.getElementById('rps-baslat-btn');
    var quizBtn = document.getElementById('rps-quiz-btn');

    if (kazanan === 'draw') {
        // Berabere — tekrar oyna
        if (sonucEl) {
            sonucEl.classList.remove('gizli');
            sonucEl.innerHTML = '<span style="color:var(--orange);">🤝 Berabere! Tekrar atılıyor...</span>';
        }
        setTimeout(function() {
            if (sonucEl) sonucEl.classList.add('gizli');
            if (el1) { el1.textContent = '✊'; el1.classList.remove('durdu'); }
            if (el2) { el2.textContent = '✊'; el2.classList.remove('durdu'); }
            if (baslatBtn) baslatBtn.disabled = false;
            tasKagitMakasOynat();
        }, 1500);
        return;
    }

    // Kazanan belirlendi
    var benKazandimMi = (kazanan === 'player1');
    var kazananUid = benKazandimMi ? mevcutKullanici.uid : (partnerBilgileri ? partnerBilgileri.uid : null);
    var kazananAd = benKazandimMi ? kullaniciBilgileri.displayName : (partnerBilgileri ? partnerBilgileri.displayName : 'Partner');

    console.log("[multiplayer.js] TKM kazanan:", kazananAd);

    // Firebase'e sonucu yaz
    if (mevcutEslesmeKey) {
        var benSenderMiyim = (mevcutEslesme && mevcutKullanici.uid === mevcutEslesme.senderId);
        eslesmeGuncelle(mevcutEslesmeKey, {
            hostUserId: kazananUid,
            rpsResult: {
                sender: benSenderMiyim ? secim1 : secim2,
                receiver: benSenderMiyim ? secim2 : secim1,
                winner: kazananUid
            }
        });
    }

    if (sonucEl) {
        sonucEl.classList.remove('gizli');
        if (benKazandimMi) {
            sonucEl.innerHTML = '<span style="color:var(--green);">🎉 Sen kazandın! Quiz senin telefonundan oynanacak!</span>';
        } else {
            sonucEl.innerHTML = '<span style="color:var(--blue);">👏 ' + htmlEscape(kazananAd) + ' kazandı! Quiz onun telefonundan oynanacak.</span>';
        }
    }

    // Quiz butonunu göster (sadece kazanan görür)
    if (baslatBtn) baslatBtn.classList.add('gizli');
    if (quizBtn) {
        if (benKazandimMi) {
            quizBtn.classList.remove('gizli');
        } else {
            // Kaybeden için bilgi mesajı
            quizBtn.classList.remove('gizli');
            quizBtn.textContent = '⏳ Kazanan quiz başlatsın...';
            quizBtn.disabled = true;
        }
    }
}

function tkmKazananBelirle(secim1, secim2) {
    if (secim1 === secim2) return 'draw';

    var kazanmaKurallari = {
        rock: 'scissors',
        paper: 'rock',
        scissors: 'paper'
    };

    if (kazanmaKurallari[secim1] === secim2) return 'player1';
    return 'player2';
}

// ──────────────────────────────────────────────
// ADIM 7 — 2x QUIZ
// ──────────────────────────────────────────────
function birlikteQuizBaslatUI() {
    console.log("[multiplayer.js] Birlikte quiz başlatılıyor...");

    var locationId = mevcutBirlikteLokayon || mevcutMekanId;
    if (!locationId) {
        bildirimGoster("Lokasyon bulunamadı.", "hata");
        return;
    }

    birlikteQuizBaslat(locationId);
}

function birlikteQuizBaslat(locationId) {
    console.log("[multiplayer.js] 2x quiz başlatılıyor. Lokasyon:", locationId);

    // 2x çarpanı ayarla
    mevcutQuiz.birlikteCarpan = 2;

    // Quiz başlat
    quizBaslat(locationId);

    // Birlikte quiz mesafe takibini başlat
    birlikteQuizMesafeTakibiBaslat();

    bildirimGoster("🎮 2x Puan ile quiz başlıyor!", "basari");
}

// ──────────────────────────────────────────────
// BİRLİKTE QUIZ MESAFE TAKİBİ (≤50m → 2x, >50m → 1x kalıcı)
// ──────────────────────────────────────────────
var birlikteMesafeKayip = false; // Bir kez 50m aşıldıysa geri dönmez

function birlikteQuizMesafeTakibiBaslat() {
    console.log("[multiplayer.js] Birlikte quiz mesafe takibi başlatılıyor...");

    birlikteMesafeKayip = false;

    if (birlikteQuizMesafeInterval) clearInterval(birlikteQuizMesafeInterval);

    birlikteQuizMesafeInterval = setInterval(function() {
        birlikteQuizMesafeKontrol();
    }, 5000); // Her 5 saniyede bir
}

function birlikteQuizMesafeTakibiDurdur() {
    if (birlikteQuizMesafeInterval) {
        clearInterval(birlikteQuizMesafeInterval);
        birlikteQuizMesafeInterval = null;
    }
}

function birlikteQuizMesafeKontrol() {
    // Zaten kayıp olduysa tekrar kontrol etme
    if (birlikteMesafeKayip) return;

    if (!mevcutKonum.lat || !partnerKonum.lat) return;

    var mesafe = mesafeHesapla(
        mevcutKonum.lat, mevcutKonum.lng,
        partnerKonum.lat, partnerKonum.lng
    );

    if (mesafe > 50) {
        // 50m aşıldı — 1x'e düşür, KALICI
        birlikteMesafeKayip = true;
        mevcutQuiz.birlikteCarpan = 1;

        console.warn("[multiplayer.js] Birlikte mesafe aşıldı:", Math.round(mesafe) + "m. Çarpan 1x'e düştü.");
        bildirimGoster("⚠️ Ayrıldınız! Çarpan 1x'e düştü. Tekrar 2x'e dönülmez.", "uyari");

        // Mesafe takibini durdur (artık geri dönüşü yok)
        birlikteQuizMesafeTakibiDurdur();
    }
}

// ──────────────────────────────────────────────
// TEMİZLİK
// ──────────────────────────────────────────────
function multiplayerTemizle() {
    mesafeKontrolDurdur();
    birlikteQuizMesafeTakibiDurdur();
    partnerKonumDinlemeyiBirak();

    if (konumGuncelleInterval) {
        clearInterval(konumGuncelleInterval);
        konumGuncelleInterval = null;
    }

    if (mevcutEslesmeKey) {
        eslesmeDinlemeyiBirak(mevcutEslesmeKey);
        chatDinlemeyiBirak(mevcutEslesmeKey);
    }

    gelenDavetleriDinlemeyiBirak();

    eslesmeAktif = false;
    mevcutEslesme = null;
    mevcutEslesmeKey = null;
    partnerBilgileri = null;
    partnerKonum = { lat: null, lng: null };
    bekleyenDavetKey = null;
    birlikteMesafeKayip = false;

    console.log("[multiplayer.js] Multiplayer temizlendi.");
}

console.log("[multiplayer.js] Multiplayer modülü yüklendi.");