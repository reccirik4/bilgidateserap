// ============================================================
// UI.JS
// Museum Quest — Ekran geçişleri, modal, bildirim, ortak UI fonksiyonları
// Bağımlılıklar: index.html (DOM elemanları)
// ============================================================

// Aktif ekran takibi
var aktifEkranId = 'ekran-giris';

// ──────────────────────────────────────────────
// EKRAN GEÇİŞİ
// ──────────────────────────────────────────────
function ekranGoster(ekranId) {
    console.log("[ui.js] Ekran göster:", ekranId);

    // Tüm ekranları gizle
    var ekranlar = document.querySelectorAll('.ekran');
    for (var i = 0; i < ekranlar.length; i++) {
        ekranlar[i].classList.add('gizli');
    }

    // Bottom sheet'i de kapat
    mekanDetayKapat();

    // Hedef ekranı göster
    var hedef = document.getElementById(ekranId);
    if (hedef) {
        hedef.classList.remove('gizli');
        aktifEkranId = ekranId;

        // Sayfanın en üstüne scroll
        window.scrollTo(0, 0);
    } else {
        console.error("[ui.js] Ekran bulunamadı:", ekranId);
        return;
    }

    // Alt menü görünürlüğü — giriş ve profil oluşturda gizle
    var menuGizleEkranlar = ['ekran-giris', 'ekran-profil-olustur'];
    if (menuGizleEkranlar.indexOf(ekranId) !== -1) {
        altMenuGizle();
    } else if (mevcutKullanici) {
        altMenuGoster();
    }

    // Alt menü aktif butonu güncelle
    menuAktifGuncelle(ekranId);

    // Ekrana özel tetiklemeler
    ekranTetikle(ekranId);
}

// Ekrana özel fonksiyon tetiklemeleri
function ekranTetikle(ekranId) {
    switch (ekranId) {
        case 'ekran-harita':
            // Harita varsa yeniden boyutlandır (gizli div'den çıkış sonrası zorunlu)
            if (typeof harita !== 'undefined' && harita) {
                // Birden fazla zamanlama ile resize tetikle (mobil uyum)
                [50, 200, 500, 1000].forEach(function(ms) {
                    setTimeout(function() {
                        if (harita) {
                            google.maps.event.trigger(harita, 'resize');
                            // Konumum varsa oraya merkezle, yoksa harita merkezini koru
                            if (mevcutKonum && mevcutKonum.lat) {
                                harita.setCenter({ lat: mevcutKonum.lat, lng: mevcutKonum.lng });
                            }
                        }
                    }, ms);
                });
            }
            haritaPuanGuncelle();
            break;

        case 'ekran-profil':
            if (typeof profilGoster === 'function') {
                profilGoster();
            }
            break;

        case 'ekran-siralama':
            if (typeof siralamaGoster === 'function') {
                siralamaGoster();
            }
            break;

        case 'ekran-oduller':
            if (typeof odulleriGoster === 'function') {
                odulleriGoster();
            }
            break;
    }
}

// ──────────────────────────────────────────────
// ALT MENÜ
// ──────────────────────────────────────────────
function altMenuGoster() {
    var menu = document.getElementById('alt-menu');
    if (menu) menu.classList.remove('gizli');
}

function altMenuGizle() {
    var menu = document.getElementById('alt-menu');
    if (menu) menu.classList.add('gizli');
}

function menuTikla(ekranId, btn) {
    ekranGoster(ekranId);
}

function menuAktifGuncelle(ekranId) {
    // Tüm menü butonlarından aktif sınıfını kaldır
    var menuButonlar = document.querySelectorAll('#alt-menu button');
    for (var i = 0; i < menuButonlar.length; i++) {
        menuButonlar[i].classList.remove('aktif');
    }

    // Eşleşen butonu aktif yap
    var eslesme = {
        'ekran-harita': 'menu-harita',
        'ekran-siralama': 'menu-siralama',
        'ekran-oduller': 'menu-oduller',
        'ekran-profil': 'menu-profil'
    };

    var butonId = eslesme[ekranId];
    if (butonId) {
        var btn = document.getElementById(butonId);
        if (btn) btn.classList.add('aktif');
    }
}

// ──────────────────────────────────────────────
// BİLDİRİM
// ──────────────────────────────────────────────
var bildirimTimeout = null;

function bildirimGoster(mesaj, tip) {
    // tip: "basari", "hata", "uyari", "bilgi"
    tip = tip || 'bilgi';
    console.log("[ui.js] Bildirim [" + tip + "]:", mesaj);

    var el = document.getElementById('bildirim');
    if (!el) return;

    // Önceki timeout'u temizle
    if (bildirimTimeout) {
        clearTimeout(bildirimTimeout);
    }

    // Önceki tüm tip sınıflarını kaldır
    el.classList.remove('basari', 'hata', 'uyari', 'bilgi', 'goster');

    // Yeni içerik ve tip
    el.textContent = mesaj;
    el.classList.add(tip);

    // Göster (animasyonlu)
    requestAnimationFrame(function() {
        el.classList.add('goster');
    });

    // 3.5 saniye sonra gizle
    bildirimTimeout = setTimeout(function() {
        el.classList.remove('goster');
    }, 3500);
}

// ──────────────────────────────────────────────
// MODAL
// ──────────────────────────────────────────────
function modalGoster(icerikHTML) {
    var overlay = document.getElementById('modal-overlay');
    var body = document.getElementById('modal-body');
    if (!overlay || !body) return;

    body.innerHTML = icerikHTML;
    overlay.classList.remove('gizli');
    document.body.style.overflow = 'hidden';
}

function modalKapat() {
    var overlay = document.getElementById('modal-overlay');
    if (overlay) {
        overlay.classList.add('gizli');
    }
    document.body.style.overflow = '';
}

// ──────────────────────────────────────────────
// ONAY DİALOGU
// ──────────────────────────────────────────────
function onayIste(mesaj, evetCallback, hayirCallback) {
    var html = '<div class="onay-dialog">' +
        '<p class="onay-mesaj">' + mesaj + '</p>' +
        '<div class="onay-butonlar">' +
            '<button class="btn btn-outline" onclick="modalKapat(); ' +
                (hayirCallback ? 'window._onayHayir && window._onayHayir();' : '') +
            '">İptal</button>' +
            '<button class="btn btn-gold" onclick="modalKapat(); window._onayEvet && window._onayEvet();">Onayla</button>' +
        '</div>' +
    '</div>';

    window._onayEvet = evetCallback || null;
    window._onayHayir = hayirCallback || null;

    modalGoster(html);
}

// ──────────────────────────────────────────────
// YÜKLEME (LOADING SPINNER)
// ──────────────────────────────────────────────
var yuklemeAcik = false;

function yuklemeGoster(metin) {
    var overlay = document.getElementById('yukleme-overlay');
    if (!overlay) return;

    if (metin) {
        var metinEl = overlay.querySelector('.yukleme-metin');
        if (metinEl) metinEl.textContent = metin;
    }

    overlay.classList.remove('gizli');
    yuklemeAcik = true;
}

function yuklemeKapat() {
    var overlay = document.getElementById('yukleme-overlay');
    if (overlay) {
        overlay.classList.add('gizli');
    }
    yuklemeAcik = false;
}

// ──────────────────────────────────────────────
// LIGHTBOX (FOTOĞRAF BÜYÜTME)
// ──────────────────────────────────────────────
function lightboxAc(imgSrc) {
    var lightbox = document.getElementById('lightbox');
    var img = document.getElementById('lightbox-img');
    if (!lightbox || !img) return;

    img.src = imgSrc;
    lightbox.classList.remove('gizli');
    document.body.style.overflow = 'hidden';
}

function lightboxKapat() {
    var lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.classList.add('gizli');
    }
    document.body.style.overflow = '';
}

// ──────────────────────────────────────────────
// MEKAN DETAY (BOTTOM SHEET)
// ──────────────────────────────────────────────
function mekanDetayAc() {
    var el = document.getElementById('ekran-mekan-detay');
    if (el) el.classList.remove('gizli');
}

function mekanDetayKapat() {
    var el = document.getElementById('ekran-mekan-detay');
    if (el) el.classList.add('gizli');
}

// ──────────────────────────────────────────────
// DAVET POPUP
// ──────────────────────────────────────────────
function davetPopupAc() {
    var el = document.getElementById('davet-popup');
    if (el) el.classList.remove('gizli');
}

function davetPopupKapat() {
    var el = document.getElementById('davet-popup');
    if (el) el.classList.add('gizli');
}

// ──────────────────────────────────────────────
// KONFETİ ANİMASYONU
// ──────────────────────────────────────────────
function konfetiGoster() {
    var renkler = ['#f0c040', '#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
    var parcaSayisi = 60;

    for (var i = 0; i < parcaSayisi; i++) {
        var parca = document.createElement('div');
        parca.className = 'konfeti-parca';
        parca.style.left = Math.random() * 100 + 'vw';
        parca.style.top = '-10px';
        parca.style.backgroundColor = renkler[Math.floor(Math.random() * renkler.length)];
        parca.style.width = (Math.random() * 8 + 6) + 'px';
        parca.style.height = (Math.random() * 8 + 6) + 'px';
        parca.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
        parca.style.animationDelay = (Math.random() * 0.5) + 's';

        // Rastgele şekiller
        if (Math.random() > 0.5) {
            parca.style.borderRadius = '50%';
        } else {
            parca.style.borderRadius = '2px';
            parca.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
        }

        document.body.appendChild(parca);

        // Animasyon bitince DOM'dan kaldır
        (function(p) {
            setTimeout(function() {
                if (p.parentNode) p.parentNode.removeChild(p);
            }, 3000);
        })(parca);
    }
}

// ──────────────────────────────────────────────
// FORMAT FONKSİYONLARI
// ──────────────────────────────────────────────

// Puan formatla: 12450 → "12.450"
function formatPuan(sayi) {
    if (sayi === null || sayi === undefined) return '0';
    return sayi.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Mesafe formatla: 340 → "340m", 1500 → "1.5km"
function formatMesafe(metre) {
    if (metre === null || metre === undefined) return '?';
    metre = Math.round(metre);
    if (metre < 1000) {
        return metre + 'm';
    } else {
        return (metre / 1000).toFixed(1) + 'km';
    }
}

// Süre formatla: 125 → "2:05"
function formatSure(saniye) {
    if (saniye === null || saniye === undefined) return '0:00';
    var dk = Math.floor(saniye / 60);
    var sn = saniye % 60;
    return dk + ':' + (sn < 10 ? '0' : '') + sn;
}

// Tarih formatla
function formatTarih(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    return d.toLocaleDateString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Saat formatla
function formatSaat(timestamp) {
    if (!timestamp) return '';
    var d = new Date(timestamp);
    return d.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Zorluk metni
function formatZorluk(difficulty) {
    var zorluklar = {
        'easy': { metin: 'Kolay', renk: '#10b981', emoji: '🟢' },
        'medium': { metin: 'Orta', renk: '#f59e0b', emoji: '🟡' },
        'hard': { metin: 'Zor', renk: '#ef4444', emoji: '🔴' },
        'expert': { metin: 'Uzman', renk: '#8b5cf6', emoji: '🟣' }
    };
    return zorluklar[difficulty] || zorluklar['medium'];
}

// ──────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ──────────────────────────────────────────────

// Rastgele karakter üret
function rastgeleKarakter(uzunluk) {
    var karakterler = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var sonuc = '';
    for (var i = 0; i < uzunluk; i++) {
        sonuc += karakterler.charAt(Math.floor(Math.random() * karakterler.length));
    }
    return sonuc;
}

// Diziyi karıştır (Fisher-Yates shuffle)
function diziKaristir(dizi) {
    var kopya = dizi.slice();
    for (var i = kopya.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = kopya[i];
        kopya[i] = kopya[j];
        kopya[j] = temp;
    }
    return kopya;
}

// Varsayılan profil fotoğrafı
function varsayilanFoto() {
    return 'data:image/svg+xml;base64,' + btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
        '<rect width="100" height="100" fill="#1e1e3a"/>' +
        '<circle cx="50" cy="38" r="18" fill="#555577"/>' +
        '<ellipse cx="50" cy="80" rx="30" ry="22" fill="#555577"/>' +
        '</svg>'
    );
}

// HTML escape (XSS önleme)
function htmlEscape(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Debounce
function debounce(fonksiyon, gecikme) {
    var timeout;
    return function() {
        var context = this;
        var args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(function() {
            fonksiyon.apply(context, args);
        }, gecikme);
    };
}

console.log("[ui.js] UI modülü yüklendi.");