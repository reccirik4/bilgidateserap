// ============================================================
// QUIZ.JS
// Museum Quest — Bilgi yarışması motoru
// Bağımlılıklar: auth.js (mevcutKullanici, kullaniciBilgileri)
//                database.js (puanEkle, oyunSayisiArtir, xpSeviyeGuncelle)
//                github-storage.js (window.soruHavuzu)
//                map.js (mevcutKonum, mesafeHesapla, mevcutMekanVeri)
//                ui.js (ekranGoster, bildirimGoster, formatSure, diziKaristir, konfetiGoster)
//                profile.js (rozetKontrolVeEkle)
// ============================================================

// Global quiz değişkenleri
var mevcutQuiz = {
    locationId: null,
    lokasyonVeri: null,
    sorular: [],
    mevcutSoruIndex: 0,
    hamPuan: 0,
    dogruSayisi: 0,
    yanlisSayisi: 0,
    baslangicZamani: null,
    birlikteCarpan: 1,
    zamanlayici: null,
    kalanSure: 0,
    cevapVerildi: false,
    arkaArkayaDogru: 0,
    mesafeKontrolInterval: null
};

// ──────────────────────────────────────────────
// QUIZ BAŞLAT
// ──────────────────────────────────────────────
function quizBaslat(locationId) {
    console.log("[quiz.js] Quiz başlatılıyor. Lokasyon:", locationId);

    if (!locationId) {
        bildirimGoster("Lokasyon bilgisi bulunamadı.", "hata");
        return;
    }

    // Soru havuzunda bu lokasyon var mı kontrol et
    var havuz = window.soruHavuzu[locationId];
    if (!havuz || havuz.length === 0) {
        bildirimGoster("Bu mekan için henüz soru eklenmemiş.", "uyari");
        return;
    }

    // Lokasyon verisini bul
    var lokVeri = null;
    for (var i = 0; i < window.oyunLokasyonlari.length; i++) {
        if (window.oyunLokasyonlari[i].id === locationId) {
            lokVeri = window.oyunLokasyonlari[i];
            break;
        }
    }

    // Quiz nesnesini sıfırla
    mevcutQuiz.locationId = locationId;
    mevcutQuiz.lokasyonVeri = lokVeri;
    mevcutQuiz.mevcutSoruIndex = 0;
    mevcutQuiz.hamPuan = 0;
    mevcutQuiz.dogruSayisi = 0;
    mevcutQuiz.yanlisSayisi = 0;
    mevcutQuiz.baslangicZamani = Date.now();
    mevcutQuiz.cevapVerildi = false;
    mevcutQuiz.arkaArkayaDogru = 0;

    // birlikteCarpan dışarıdan ayarlanmış olabilir (multiplayer.js)
    // Sıfırlamıyoruz, birlikteQuizBaslat() 2 yapar

    // Rastgele 10 soru seç (veya havuzdaki kadar)
    var karistirmis = diziKaristir(havuz);
    mevcutQuiz.sorular = karistirmis.slice(0, Math.min(10, karistirmis.length));

    console.log("[quiz.js] " + mevcutQuiz.sorular.length + " soru seçildi. Çarpan:", mevcutQuiz.birlikteCarpan + "x");

    // Quiz ekranını göster
    ekranGoster('ekran-quiz');

    // Mesafe takibini başlat
    quizMesafeTakibiBaslat();

    // İlk soruyu göster
    soruGoster();
}

// ──────────────────────────────────────────────
// SORU GÖSTER
// ──────────────────────────────────────────────
function soruGoster() {
    var index = mevcutQuiz.mevcutSoruIndex;
    var toplam = mevcutQuiz.sorular.length;
    var soru = mevcutQuiz.sorular[index];

    if (!soru) {
        console.error("[quiz.js] Soru bulunamadı, index:", index);
        quizBitir();
        return;
    }

    mevcutQuiz.cevapVerildi = false;

    console.log("[quiz.js] Soru gösteriliyor:", (index + 1) + "/" + toplam, "-", soru.id);

    // Üst bar güncelle
    var soruNoEl = document.getElementById('quiz-soru-no');
    if (soruNoEl) soruNoEl.textContent = (index + 1) + ' / ' + toplam;

    var puanEl = document.getElementById('quiz-puan');
    if (puanEl) puanEl.textContent = '⭐ ' + mevcutQuiz.hamPuan;

    // İlerleme barı
    var ilerlemEl = document.getElementById('quiz-ilerleme-bar');
    if (ilerlemEl) ilerlemEl.style.width = ((index + 1) / toplam * 100) + '%';

    // Soru metni
    var metinEl = document.getElementById('quiz-soru-metin');
    if (metinEl) metinEl.textContent = soru.text;

    // Soru görseli
    var gorselEl = document.getElementById('quiz-soru-gorsel');
    if (gorselEl) {
        if (soru.imageURL) {
            gorselEl.src = soru.imageURL;
            gorselEl.classList.remove('gizli');
            gorselEl.onerror = function() { this.classList.add('gizli'); };
        } else {
            gorselEl.classList.add('gizli');
        }
    }

    // Açıklama gizle
    var aciklamaEl = document.getElementById('quiz-aciklama');
    if (aciklamaEl) aciklamaEl.classList.add('gizli');

    // Şıkları oluştur (karıştırılmış sırada)
    var seceneklerEl = document.getElementById('quiz-secenekler');
    if (seceneklerEl) {
        var karisikSecenekler = diziKaristir(soru.options);
        var html = '';
        for (var i = 0; i < karisikSecenekler.length; i++) {
            html += '<button class="quiz-secenek" onclick="cevapSec(this, ' + i + ', ' +
                karisikSecenekler[i].correct + ')" data-correct="' +
                karisikSecenekler[i].correct + '">' +
                htmlEscape(karisikSecenekler[i].text) +
                '</button>';
        }
        seceneklerEl.innerHTML = html;
    }

    // Zamanlayıcıyı başlat
    var sure = soru.timeLimit || 15;
    zamanlayiciBaslat(sure);
}

// ──────────────────────────────────────────────
// ZAMANLAYICI
// ──────────────────────────────────────────────
function zamanlayiciBaslat(sure) {
    mevcutQuiz.kalanSure = sure;

    // Önceki zamanlayıcıyı temizle
    if (mevcutQuiz.zamanlayici) {
        clearInterval(mevcutQuiz.zamanlayici);
    }

    zamanlayiciGuncelle();

    mevcutQuiz.zamanlayici = setInterval(function() {
        mevcutQuiz.kalanSure--;
        zamanlayiciGuncelle();

        if (mevcutQuiz.kalanSure <= 0) {
            clearInterval(mevcutQuiz.zamanlayici);
            mevcutQuiz.zamanlayici = null;
            sureDoldu();
        }
    }, 1000);
}

function zamanlayiciGuncelle() {
    var sureEl = document.getElementById('quiz-sure');
    var zamanlayiciEl = document.getElementById('quiz-zamanlayici');

    if (sureEl) sureEl.textContent = mevcutQuiz.kalanSure;

    if (zamanlayiciEl) {
        if (mevcutQuiz.kalanSure <= 5) {
            zamanlayiciEl.classList.add('kritik');
        } else {
            zamanlayiciEl.classList.remove('kritik');
        }
    }
}

function zamanlayiciDurdur() {
    if (mevcutQuiz.zamanlayici) {
        clearInterval(mevcutQuiz.zamanlayici);
        mevcutQuiz.zamanlayici = null;
    }
}

// ──────────────────────────────────────────────
// SÜRE DOLDU
// ──────────────────────────────────────────────
function sureDoldu() {
    console.log("[quiz.js] Süre doldu!");

    if (mevcutQuiz.cevapVerildi) return;
    mevcutQuiz.cevapVerildi = true;

    mevcutQuiz.yanlisSayisi++;
    mevcutQuiz.arkaArkayaDogru = 0;

    // Tüm seçenekleri devre dışı bırak ve doğruyu göster
    secenekleriKilitle(null);

    // Açıklamayı göster
    aciklamaGoster();

    bildirimGoster("⏱️ Süre doldu!", "uyari");

    // 2.5 saniye sonra sonraki soruya geç
    setTimeout(function() {
        sonrakiSoru();
    }, 2500);
}

// ──────────────────────────────────────────────
// CEVAP SEÇ
// ──────────────────────────────────────────────
function cevapSec(butonEl, secenekIndex, dogruMu) {
    if (mevcutQuiz.cevapVerildi) return;
    mevcutQuiz.cevapVerildi = true;

    // Zamanlayıcıyı durdur
    zamanlayiciDurdur();

    var soru = mevcutQuiz.sorular[mevcutQuiz.mevcutSoruIndex];
    var harcananSure = (soru.timeLimit || 15) - mevcutQuiz.kalanSure;

    console.log("[quiz.js] Cevap seçildi. Doğru:", dogruMu, "Süre:", harcananSure + "sn");

    if (dogruMu) {
        // DOĞRU CEVAP
        mevcutQuiz.dogruSayisi++;
        mevcutQuiz.arkaArkayaDogru++;
        butonEl.classList.add('dogru');

        // Puan hesapla
        var kazanilanPuan = puanHesapla(soru.points || 25, harcananSure);
        mevcutQuiz.hamPuan += kazanilanPuan;

        // Puan göster
        var puanEl = document.getElementById('quiz-puan');
        if (puanEl) puanEl.textContent = '⭐ ' + mevcutQuiz.hamPuan;

        // 5 arka arkaya doğru rozeti
        if (mevcutQuiz.arkaArkayaDogru >= 5) {
            rozetKontrolVeEkle('arka_arkaya_5');
        }

    } else {
        // YANLIŞ CEVAP
        mevcutQuiz.yanlisSayisi++;
        mevcutQuiz.arkaArkayaDogru = 0;
        butonEl.classList.add('yanlis');
    }

    // Tüm seçenekleri kilitle ve doğruyu göster
    secenekleriKilitle(butonEl);

    // Açıklamayı göster
    aciklamaGoster();

    // 2 saniye sonra sonraki soruya geç
    setTimeout(function() {
        sonrakiSoru();
    }, 2000);
}

// ──────────────────────────────────────────────
// PUAN HESAPLA
// ──────────────────────────────────────────────
function puanHesapla(soruPuani, harcananSure) {
    // Hız bonusu: ilk 5 saniyede doğru → 1.5x
    var carpan = 1;
    if (harcananSure <= 5) {
        carpan = 1.5;
    }

    var puan = Math.round(soruPuani * carpan);
    console.log("[quiz.js] Puan hesaplandı:", soruPuani, "x", carpan, "=", puan);
    return puan;
}

// ──────────────────────────────────────────────
// SEÇENEKLERİ KİLİTLE & DOĞRUYU GÖSTER
// ──────────────────────────────────────────────
function secenekleriKilitle(tiklanmisBuon) {
    var secenekler = document.querySelectorAll('.quiz-secenek');
    for (var i = 0; i < secenekler.length; i++) {
        secenekler[i].disabled = true;

        // Doğru olan seçeneği yeşil yap
        if (secenekler[i].getAttribute('data-correct') === 'true') {
            secenekler[i].classList.add('dogru');
        }
    }
}

// Açıklama göster
function aciklamaGoster() {
    var soru = mevcutQuiz.sorular[mevcutQuiz.mevcutSoruIndex];
    if (!soru || !soru.explanation) return;

    var aciklamaEl = document.getElementById('quiz-aciklama');
    if (aciklamaEl) {
        aciklamaEl.textContent = '💡 ' + soru.explanation;
        aciklamaEl.classList.remove('gizli');
    }
}

// ──────────────────────────────────────────────
// SONRAKİ SORU
// ──────────────────────────────────────────────
function sonrakiSoru() {
    mevcutQuiz.mevcutSoruIndex++;

    if (mevcutQuiz.mevcutSoruIndex >= mevcutQuiz.sorular.length) {
        // Tüm sorular bitti
        quizBitir();
    } else {
        soruGoster();
    }
}

// ──────────────────────────────────────────────
// QUIZ BİTİR
// ──────────────────────────────────────────────
function quizBitir() {
    console.log("[quiz.js] Quiz bitiyor. Ham puan:", mevcutQuiz.hamPuan);

    // Zamanlayıcıyı durdur
    zamanlayiciDurdur();

    // Mesafe takibini durdur
    quizMesafeTakibiDurdur();

    // Oyun sayısını artır
    if (mevcutKullanici) {
        oyunSayisiArtir(mevcutKullanici.uid);
    }

    // İlk müze rozeti
    if (mevcutKullanici && kullaniciBilgileri) {
        if ((kullaniciBilgileri.gamesPlayed || 0) <= 1) {
            rozetKontrolVeEkle('ilk_muze');
        }
    }

    // Çark ekranına yönlendir
    carkGoster();
}

// ──────────────────────────────────────────────
// QUIZ SIRASINDA MESAFE TAKİBİ
// ──────────────────────────────────────────────
function quizMesafeTakibiBaslat() {
    console.log("[quiz.js] Quiz mesafe takibi başlatılıyor...");

    // Önceki interval'i temizle
    quizMesafeTakibiDurdur();

    mevcutQuiz.mesafeKontrolInterval = setInterval(function() {
        quizMesafeKontrol();
    }, 5000); // Her 5 saniyede bir
}

function quizMesafeTakibiDurdur() {
    if (mevcutQuiz.mesafeKontrolInterval) {
        clearInterval(mevcutQuiz.mesafeKontrolInterval);
        mevcutQuiz.mesafeKontrolInterval = null;
    }
    // Uyarı mesajını temizle
    var uyariEl = document.getElementById('quiz-mesafe-uyari-alani');
    if (uyariEl) uyariEl.innerHTML = '';
}

function quizMesafeKontrol() {
    if (!mevcutQuiz.lokasyonVeri || !mevcutKonum.lat || !mevcutKonum.lng) return;

    var lok = mevcutQuiz.lokasyonVeri;
    var exitRadius = lok.exitRadius || 2000;

    var mesafe = mesafeHesapla(
        mevcutKonum.lat, mevcutKonum.lng,
        lok.latitude, lok.longitude
    );

    var uyariEl = document.getElementById('quiz-mesafe-uyari-alani');

    if (mesafe > exitRadius) {
        // 2km'yi aştı — quiz'i zorla bitir
        console.warn("[quiz.js] Mesafe aşıldı:", Math.round(mesafe) + "m. Quiz zorla bitiriliyor.");

        zamanlayiciDurdur();
        quizMesafeTakibiDurdur();

        bildirimGoster("📍 Mekandan çok uzaklaştın! Quiz sona erdi.", "uyari");

        // Mevcut puanları koru ve çarka git
        setTimeout(function() {
            carkGoster();
        }, 1500);

    } else if (mesafe > exitRadius * 0.8) {
        // %80 uyarı
        if (uyariEl) {
            uyariEl.innerHTML = '<div class="quiz-mesafe-uyari">⚠️ Mekandan uzaklaşıyorsun! ' +
                formatMesafe(exitRadius - mesafe) + ' kaldı</div>';
        }
    } else {
        // Güvendeyiz
        if (uyariEl) uyariEl.innerHTML = '';
    }
}

// ──────────────────────────────────────────────
// QUIZ'İ ZORLA BİTİR (dış çağrı için)
// ──────────────────────────────────────────────
function quizZorlaBitir(neden) {
    console.log("[quiz.js] Quiz zorla bitiriliyor. Neden:", neden);

    zamanlayiciDurdur();
    quizMesafeTakibiDurdur();

    bildirimGoster(neden || "Quiz sona erdi.", "uyari");

    setTimeout(function() {
        carkGoster();
    }, 1000);
}

console.log("[quiz.js] Quiz modülü yüklendi.");
