// ============================================================
// SPIN-WHEEL.JS
// Museum Quest — Şans çarkı: animasyon, olasılık, çarpan uygulama
// Bağımlılıklar: auth.js (mevcutKullanici, kullaniciBilgileri)
//                database.js (puanEkle, xpSeviyeGuncelle)
//                quiz.js (mevcutQuiz)
//                ui.js (ekranGoster, bildirimGoster, formatPuan, konfetiGoster)
// ============================================================

// Çark dilimleri: { etiket, carpan, olasilik, renk }
var CARK_DILIMLERI = [
    { etiket: '0x',  carpan: 0,  olasilik: 0.10, renk: '#ef4444' },
    { etiket: '1x',  carpan: 1,  olasilik: 0.40, renk: '#3b82f6' },
    { etiket: '2x',  carpan: 2,  olasilik: 0.30, renk: '#10b981' },
    { etiket: '3x',  carpan: 3,  olasilik: 0.15, renk: '#f59e0b' },
    { etiket: '5x',  carpan: 5,  olasilik: 0.05, renk: '#8b5cf6' }
];

// Çark durumu
var carkDonuyor = false;
var carkSonucCarpan = null;

// ──────────────────────────────────────────────
// ÇARKI GÖSTER
// ──────────────────────────────────────────────
function carkGoster() {
    console.log("[spin-wheel.js] Çark ekranı gösteriliyor. Ham puan:", mevcutQuiz.hamPuan);

    // Ekranı göster
    ekranGoster('ekran-cark');

    // Ham puanı göster
    var hamPuanEl = document.getElementById('cark-ham-puan-deger');
    if (hamPuanEl) hamPuanEl.textContent = formatPuan(mevcutQuiz.hamPuan);

    // Sonuç ve devam butonunu gizle
    var sonucEl = document.getElementById('cark-sonuc');
    if (sonucEl) sonucEl.classList.add('gizli');

    var devamBtn = document.getElementById('cark-devam-btn');
    if (devamBtn) devamBtn.classList.add('gizli');

    // Çevir butonunu aktif et
    var cevirBtn = document.getElementById('cark-cevir-btn');
    if (cevirBtn) {
        cevirBtn.disabled = false;
        cevirBtn.textContent = 'ÇEVİR';
    }

    // Durumu sıfırla
    carkDonuyor = false;
    carkSonucCarpan = null;

    // Çarkı çiz
    carkCiz();
}

// ──────────────────────────────────────────────
// ÇARKI ÇİZ (Canvas)
// ──────────────────────────────────────────────
function carkCiz() {
    var canvas = document.getElementById('cark-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var cx = canvas.width / 2;
    var cy = canvas.height / 2;
    var r = cx - 4; // Border için küçük boşluk

    var toplamDilim = CARK_DILIMLERI.length;
    var dilimAci = (2 * Math.PI) / toplamDilim;
    var baslangicAci = -Math.PI / 2; // Üstten başla

    // Canvas temizle
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < toplamDilim; i++) {
        var dilim = CARK_DILIMLERI[i];
        var aciBasla = baslangicAci + (i * dilimAci);
        var aciBitis = aciBasla + dilimAci;

        // Dilim çiz
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, aciBasla, aciBitis);
        ctx.closePath();
        ctx.fillStyle = dilim.renk;
        ctx.fill();

        // Dilim kenarlığı
        ctx.strokeStyle = '#0a0a18';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Etiket yaz
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(aciBasla + dilimAci / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px "Segoe UI", sans-serif';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(dilim.etiket, r * 0.6, 0);
        ctx.shadowBlur = 0;
        ctx.restore();
    }

    // Merkez dairesi (butonun arkası)
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
    ctx.fillStyle = '#0a0a18';
    ctx.fill();
    ctx.strokeStyle = '#f0c040';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// ──────────────────────────────────────────────
// ÇARKI ÇEVİR
// ──────────────────────────────────────────────
function carkiCevir() {
    if (carkDonuyor) return;
    carkDonuyor = true;

    console.log("[spin-wheel.js] Çark çevriliyor...");

    var cevirBtn = document.getElementById('cark-cevir-btn');
    if (cevirBtn) {
        cevirBtn.disabled = true;
        cevirBtn.textContent = '...';
    }

    // Sonucu olasılığa göre belirle
    var secilen = olasiligaGoreSec();
    carkSonucCarpan = secilen.carpan;

    console.log("[spin-wheel.js] Sonuç belirlendi:", secilen.etiket, "(" + secilen.carpan + "x)");

    // Hedef dilim indeksini bul
    var dilimIndex = CARK_DILIMLERI.indexOf(secilen);
    var toplamDilim = CARK_DILIMLERI.length;
    var dilimAci = 360 / toplamDilim;

    // Hedef açı hesapla: dilimin ortasına denk gelecek şekilde
    // Ok üstte (0 derece) olduğu için, hedef dilimin üste gelmesi lazım
    var hedefAci = 360 - (dilimIndex * dilimAci + dilimAci / 2);

    // Birkaç tam tur + hedef açı
    var turSayisi = 5 + Math.floor(Math.random() * 3); // 5-7 tur
    var toplamDonme = turSayisi * 360 + hedefAci + (Math.random() * 10 - 5); // Küçük rastgelelik

    // Canvas'ı döndür
    var canvas = document.getElementById('cark-canvas');
    if (canvas) {
        canvas.style.transition = 'none';
        canvas.style.transform = 'rotate(0deg)';

        // Reflow tetikle
        canvas.offsetHeight;

        canvas.style.transition = 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        canvas.style.transform = 'rotate(' + toplamDonme + 'deg)';
    }

    // 3.5 saniye sonra sonucu göster
    setTimeout(function() {
        carkDonuyor = false;
        carkSonucuGoster(secilen);
    }, 3700);
}

// ──────────────────────────────────────────────
// OLASILIK HESABI
// ──────────────────────────────────────────────
function olasiligaGoreSec() {
    var rastgele = Math.random();
    var kumulatif = 0;

    for (var i = 0; i < CARK_DILIMLERI.length; i++) {
        kumulatif += CARK_DILIMLERI[i].olasilik;
        if (rastgele <= kumulatif) {
            return CARK_DILIMLERI[i];
        }
    }

    // Fallback: son dilim
    return CARK_DILIMLERI[CARK_DILIMLERI.length - 1];
}

// ──────────────────────────────────────────────
// ÇARK SONUCU GÖSTER
// ──────────────────────────────────────────────
function carkSonucuGoster(dilim) {
    console.log("[spin-wheel.js] Çark sonucu gösteriliyor:", dilim.etiket);

    var sonucEl = document.getElementById('cark-sonuc');
    var devamBtn = document.getElementById('cark-devam-btn');

    // Nihai puan hesapla
    var nihai = mevcutQuiz.hamPuan * mevcutQuiz.birlikteCarpan * dilim.carpan;
    nihai = Math.round(nihai);

    if (sonucEl) {
        sonucEl.classList.remove('gizli');

        if (dilim.carpan === 0) {
            sonucEl.innerHTML = '<span style="color: var(--red);">💀 0x — Puan sıfırlandı!</span>';
            bildirimGoster("Şanssızlık! Bu turda puan kazanamadın. 😔", "hata");
        } else if (dilim.carpan === 1) {
            sonucEl.innerHTML = '<span style="color: var(--blue);">👍 1x — ' + formatPuan(nihai) + ' puan</span>';
            bildirimGoster("Puanın aynen kaldı! " + formatPuan(nihai) + " puan", "bilgi");
        } else if (dilim.carpan === 2) {
            sonucEl.innerHTML = '<span style="color: var(--green);">🎉 2x — ' + formatPuan(nihai) + ' puan!</span>';
            bildirimGoster("Harika! Puanın 2 katına çıktı! 🎉", "basari");
            konfetiGoster();
        } else if (dilim.carpan === 3) {
            sonucEl.innerHTML = '<span style="color: var(--orange);">🔥 3x — ' + formatPuan(nihai) + ' puan!</span>';
            bildirimGoster("Muhteşem! 3x çarpan! 🔥", "basari");
            konfetiGoster();
        } else if (dilim.carpan === 5) {
            sonucEl.innerHTML = '<span style="color: #8b5cf6;">🚀 5x — ' + formatPuan(nihai) + ' puan!!!</span>';
            bildirimGoster("İNANILMAZ! 5x ÇARPAN! 🚀🚀🚀", "basari");
            konfetiGoster();
        }
    }

    // Devam butonunu göster
    if (devamBtn) {
        devamBtn.classList.remove('gizli');
    }

    // Puanı geçici olarak kaydet (devam butonunda yazılacak)
    carkSonucCarpan = dilim.carpan;
    window._carkNihaiPuan = nihai;
}

// ──────────────────────────────────────────────
// ÇARK SONUCU DEVAM — PUANI YAZ VE SONUÇ EKRANI
// ──────────────────────────────────────────────
async function carkSonucuDevam() {
    console.log("[spin-wheel.js] Çark sonucu kaydediliyor...");

    var nihai = window._carkNihaiPuan || 0;

    // Firebase'e puanı yaz
    if (mevcutKullanici && nihai > 0) {
        try {
            await puanEkle(mevcutKullanici.uid, nihai);
            await xpSeviyeGuncelle(mevcutKullanici.uid);
            console.log("[spin-wheel.js] Puan kaydedildi:", nihai);
        } catch (error) {
            console.error("[spin-wheel.js] Puan kaydetme hatası:", error);
            bildirimGoster("Puan kaydedilirken hata oluştu.", "hata");
        }
    }

    // Sonuç ekranını doldur ve göster
    sonucEkraniGoster(nihai);
}

// ──────────────────────────────────────────────
// SONUÇ EKRANI
// ──────────────────────────────────────────────
function sonucEkraniGoster(nihaiPuan) {
    console.log("[spin-wheel.js] Sonuç ekranı gösteriliyor. Nihai:", nihaiPuan);

    // Emoji ve başlık
    var emojiEl = document.getElementById('sonuc-emoji');
    var baslikEl = document.getElementById('sonuc-baslik');

    if (nihaiPuan === 0) {
        if (emojiEl) emojiEl.textContent = '😔';
        if (baslikEl) baslikEl.textContent = 'Bu sefer olmadı...';
    } else if (nihaiPuan < 100) {
        if (emojiEl) emojiEl.textContent = '👍';
        if (baslikEl) baslikEl.textContent = 'İyi deneme!';
    } else if (nihaiPuan < 500) {
        if (emojiEl) emojiEl.textContent = '🎉';
        if (baslikEl) baslikEl.textContent = 'Harika!';
    } else {
        if (emojiEl) emojiEl.textContent = '🏆';
        if (baslikEl) baslikEl.textContent = 'Muhteşem!';
        konfetiGoster();
    }

    // Puan
    var puanEl = document.getElementById('sonuc-puan');
    if (puanEl) puanEl.textContent = '+' + formatPuan(nihaiPuan);

    // Detaylar
    var dogruEl = document.getElementById('sonuc-dogru');
    if (dogruEl) dogruEl.textContent = mevcutQuiz.dogruSayisi;

    var yanlisEl = document.getElementById('sonuc-yanlis');
    if (yanlisEl) yanlisEl.textContent = mevcutQuiz.yanlisSayisi;

    var carpanEl = document.getElementById('sonuc-carpan');
    if (carpanEl) carpanEl.textContent = (carkSonucCarpan !== null ? carkSonucCarpan : 1) + 'x';

    var birlikteEl = document.getElementById('sonuc-birlikte');
    if (birlikteEl) birlikteEl.textContent = mevcutQuiz.birlikteCarpan + 'x';

    // Ekranı göster
    ekranGoster('ekran-sonuc');

    // Quiz çarpanını sıfırla (birlikte oyna için)
    mevcutQuiz.birlikteCarpan = 1;
}

console.log("[spin-wheel.js] Spin wheel modülü yüklendi.");
