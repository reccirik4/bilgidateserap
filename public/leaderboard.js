// ============================================================
// LEADERBOARD.JS
// Museum Quest — Sıralama tabloları (genel, haftalık)
// Bağımlılıklar: auth.js (mevcutKullanici, kullaniciBilgileri)
//                database.js (leaderboardOku)
//                ui.js (formatPuan, htmlEscape, varsayilanFoto)
// ============================================================

// Aktif tab
var aktifSiralamaTab = 'genel';

// ──────────────────────────────────────────────
// SIRALAMA GÖSTER
// ──────────────────────────────────────────────
async function siralamaGoster() {
    console.log("[leaderboard.js] Sıralama gösteriliyor. Tab:", aktifSiralamaTab);

    var ilk3Container = document.getElementById('siralama-ilk3');
    var listeContainer = document.getElementById('siralama-listesi');

    if (!ilk3Container || !listeContainer) return;

    ilk3Container.innerHTML = '<div class="spinner" style="margin:20px auto;width:32px;height:32px;border-width:2px;"></div>';
    listeContainer.innerHTML = '';

    try {
        var veriler = await leaderboardOku();

        if (!veriler) {
            ilk3Container.innerHTML = '';
            listeContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">Henüz sıralama verisi yok.</p>';
            return;
        }

        // Object → Array dönüştür
        var oyuncular = [];
        Object.keys(veriler).forEach(function(uid) {
            var o = veriler[uid];
            o._uid = uid;
            oyuncular.push(o);
        });

        // Haftalık filtre
        if (aktifSiralamaTab === 'haftalik') {
            var birHaftaOnce = Date.now() - (7 * 24 * 60 * 60 * 1000);
            oyuncular = oyuncular.filter(function(o) {
                return (o.lastUpdated || 0) >= birHaftaOnce;
            });
        }

        // Puana göre sırala (büyükten küçüğe)
        oyuncular.sort(function(a, b) {
            return (b.totalPoints || 0) - (a.totalPoints || 0);
        });

        // İlk 100
        oyuncular = oyuncular.slice(0, 100);

        if (oyuncular.length === 0) {
            ilk3Container.innerHTML = '';
            listeContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px 0;">' +
                (aktifSiralamaTab === 'haftalik' ? 'Bu hafta henüz puan kazanan yok.' : 'Henüz sıralama verisi yok.') + '</p>';
            return;
        }

        // İlk 3'ü özel göster
        ilk3Container.innerHTML = ilk3HTML(oyuncular);

        // 4. sıradan itibaren liste
        var listeHTML = '';
        for (var i = 3; i < oyuncular.length; i++) {
            listeHTML += siraSatirHTML(oyuncular[i], i + 1);
        }
        listeContainer.innerHTML = listeHTML;

        // Kullanıcının sıralaması listede yoksa alta ekle
        kullanicSirasiGoster(oyuncular, listeContainer);

    } catch (error) {
        console.error("[leaderboard.js] Sıralama yükleme hatası:", error);
        ilk3Container.innerHTML = '';
        listeContainer.innerHTML = '<p style="text-align:center;color:var(--red);padding:32px 0;">Sıralama yüklenirken hata oluştu.</p>';
    }
}

// ──────────────────────────────────────────────
// İLK 3 ÖZEL TASARIM
// ──────────────────────────────────────────────
function ilk3HTML(oyuncular) {
    if (oyuncular.length === 0) return '';

    var html = '';

    // Sıralama: 2. — 1. — 3. (görsel düzen)
    var sira = [];
    if (oyuncular.length >= 2) sira.push({ o: oyuncular[1], sira: 2 });
    if (oyuncular.length >= 1) sira.push({ o: oyuncular[0], sira: 1 });
    if (oyuncular.length >= 3) sira.push({ o: oyuncular[2], sira: 3 });

    for (var i = 0; i < sira.length; i++) {
        var item = sira[i];
        var o = item.o;
        var s = item.sira;

        var tac = '';
        var avatarBorder = '';
        var boyut = 'avatar';

        if (s === 1) {
            tac = '👑';
            avatarBorder = 'border-color: #ffd700;';
            boyut = 'avatar avatar-lg';
        } else if (s === 2) {
            tac = '🥈';
            avatarBorder = 'border-color: #c0c0c0;';
        } else {
            tac = '🥉';
            avatarBorder = 'border-color: #cd7f32;';
        }

        var foto = o.photoURL || varsayilanFoto();
        var benMiyim = mevcutKullanici && o._uid === mevcutKullanici.uid;

        html += '<div class="siralama-ilk3-item' + (s === 1 ? ' birincilik' : '') + '">' +
            '<div class="tac">' + tac + '</div>' +
            '<img class="' + boyut + '" src="' + htmlEscape(foto) + '" alt="" ' +
                'style="' + avatarBorder + (benMiyim ? 'box-shadow:0 0 12px rgba(240,192,64,0.5);' : '') + '" ' +
                'onerror="this.src=varsayilanFoto()">' +
            '<div class="ilk3-ad" ' + (benMiyim ? 'style="color:var(--gold);"' : '') + '>' +
                htmlEscape(o.displayName || 'Oyuncu') +
            '</div>' +
            '<div class="ilk3-puan">⭐ ' + formatPuan(o.totalPoints || 0) + '</div>' +
        '</div>';
    }

    return html;
}

// ──────────────────────────────────────────────
// SIRA SATIRI (4. ve sonrası)
// ──────────────────────────────────────────────
function siraSatirHTML(oyuncu, siraNo) {
    var foto = oyuncu.photoURL || varsayilanFoto();
    var benMiyim = mevcutKullanici && oyuncu._uid === mevcutKullanici.uid;

    var siraClass = 'siralama-sira';
    if (siraNo === 1) siraClass += ' altin';
    else if (siraNo === 2) siraClass += ' gumus';
    else if (siraNo === 3) siraClass += ' bronz';

    return '<div class="siralama-satir' + (benMiyim ? ' ben' : '') + '">' +
        '<span class="' + siraClass + '">' + siraNo + '</span>' +
        '<img class="avatar avatar-sm" src="' + htmlEscape(foto) + '" alt="" onerror="this.src=varsayilanFoto()">' +
        '<div class="siralama-bilgi">' +
            '<div class="sir-ad">' + htmlEscape(oyuncu.displayName || 'Oyuncu') + '</div>' +
            '<div class="sir-seviye">Seviye ' + xpSeviyeHesapla(oyuncu.totalPoints || 0) + '</div>' +
        '</div>' +
        '<span class="siralama-puan">' + formatPuan(oyuncu.totalPoints || 0) + '</span>' +
    '</div>';
}

// ──────────────────────────────────────────────
// KULLANICININ SIRASI (listede yoksa alta ekle)
// ──────────────────────────────────────────────
function kullanicSirasiGoster(oyuncular, container) {
    if (!mevcutKullanici) return;

    // İlk 100'de var mı kontrol et
    var bulundu = false;
    for (var i = 0; i < oyuncular.length; i++) {
        if (oyuncular[i]._uid === mevcutKullanici.uid) {
            bulundu = true;
            break;
        }
    }

    if (bulundu) return; // Zaten listede

    // Listede değil — ayırıcı ve kendi sırasını göster
    // Tüm oyuncular arasındaki sırasını bul
    var siraNo = oyuncular.length + 1; // En kötü ihtimal

    // Kendi bilgileriyle satır ekle
    if (kullaniciBilgileri) {
        var ayirici = '<div style="text-align:center;padding:12px 0;color:var(--text-muted);font-size:0.8rem;">• • •</div>';

        var kendi = {
            _uid: mevcutKullanici.uid,
            displayName: kullaniciBilgileri.displayName || '',
            photoURL: kullaniciBilgileri.photoURL || '',
            totalPoints: kullaniciBilgileri.totalPoints || 0
        };

        container.innerHTML += ayirici + siraSatirHTML(kendi, siraNo);
    }
}

// ──────────────────────────────────────────────
// TAB DEĞİŞTİR
// ──────────────────────────────────────────────
function siralamaTabDegistir(tab, btnEl) {
    aktifSiralamaTab = tab;

    // Aktif tab butonunu güncelle
    var tablar = document.querySelectorAll('.siralama-tab');
    for (var i = 0; i < tablar.length; i++) {
        tablar[i].classList.remove('aktif');
    }
    if (btnEl) btnEl.classList.add('aktif');

    // Yeniden yükle
    siralamaGoster();
}

console.log("[leaderboard.js] Leaderboard modülü yüklendi.");
