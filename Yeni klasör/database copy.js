// ============================================================
// DATABASE.JS
// Museum Quest — Firebase Realtime Database okuma/yazma fonksiyonları
// Bağımlılıklar: firebase-config.js (db)
// ============================================================

// ──────────────────────────────────────────────
// TEMEL CRUD FONKSİYONLARI
// ──────────────────────────────────────────────

// Veri yazma (üzerine yazar)
function dbYaz(yol, veri) {
    console.log("[database.js] dbYaz:", yol);
    return db.ref(yol).set(veri);
}

// Veri güncelleme (sadece belirtilen alanlar)
function dbGuncelle(yol, veri) {
    console.log("[database.js] dbGuncelle:", yol);
    return db.ref(yol).update(veri);
}

// Veri ekleme (benzersiz ID ile)
function dbEkle(yol, veri) {
    console.log("[database.js] dbEkle:", yol);
    return db.ref(yol).push(veri);
}

// Tek seferlik okuma
async function dbOku(yol) {
    console.log("[database.js] dbOku:", yol);
    try {
        var snapshot = await db.ref(yol).once('value');
        return snapshot.val();
    } catch (error) {
        console.error("[database.js] dbOku hatası:", yol, error);
        return null;
    }
}

// Real-time dinleme
function dbDinle(yol, callback) {
    console.log("[database.js] dbDinle başlatıldı:", yol);
    db.ref(yol).on('value', function(snapshot) {
        callback(snapshot.val());
    });
}

// Dinlemeyi bırak
function dbDinlemeyiBirak(yol) {
    console.log("[database.js] dbDinlemeyiBirak:", yol);
    db.ref(yol).off();
}

// Silme
function dbSil(yol) {
    console.log("[database.js] dbSil:", yol);
    return db.ref(yol).remove();
}

// ──────────────────────────────────────────────
// KULLANICI PROFİL
// ──────────────────────────────────────────────

async function kullaniciProfilOku(uid) {
    console.log("[database.js] Kullanıcı profil oku:", uid);
    return await dbOku('users/' + uid);
}

function kullaniciProfilYaz(uid, veri) {
    console.log("[database.js] Kullanıcı profil yaz:", uid);
    return dbYaz('users/' + uid, veri);
}

function kullaniciProfilGuncelle(uid, veri) {
    console.log("[database.js] Kullanıcı profil güncelle:", uid);
    return dbGuncelle('users/' + uid, veri);
}

// ──────────────────────────────────────────────
// LEADERBOARD
// ──────────────────────────────────────────────

function leaderboardGuncelle(uid, veri) {
    console.log("[database.js] Leaderboard güncelle:", uid);
    return dbYaz('leaderboard/' + uid, veri);
}

async function leaderboardOku() {
    console.log("[database.js] Leaderboard oku");
    return await dbOku('leaderboard');
}

// ──────────────────────────────────────────────
// AKTİF OYUNCULAR
// ──────────────────────────────────────────────

function aktifOyuncuEkle(locationId, uid, veri) {
    console.log("[database.js] Aktif oyuncu ekle:", locationId, uid);

    // onDisconnect ile bağlantı kopunca otomatik sil
    db.ref('active_players/' + locationId + '/' + uid).onDisconnect().remove();

    return dbYaz('active_players/' + locationId + '/' + uid, veri);
}

function aktifOyuncuSil(locationId, uid) {
    console.log("[database.js] Aktif oyuncu sil:", locationId, uid);

    // onDisconnect'i de iptal et
    db.ref('active_players/' + locationId + '/' + uid).onDisconnect().cancel();

    return dbSil('active_players/' + locationId + '/' + uid);
}

function aktifOyunculariDinle(locationId, callback) {
    console.log("[database.js] Aktif oyuncuları dinle:", locationId);
    dbDinle('active_players/' + locationId, callback);
}

function aktifOyunculariDinlemeyiBirak(locationId) {
    dbDinlemeyiBirak('active_players/' + locationId);
}

// ──────────────────────────────────────────────
// EŞLEŞTİRME (PAIR REQUESTS)
// ──────────────────────────────────────────────

function eslesmeOlustur(veri) {
    console.log("[database.js] Eşleşme oluştur");
    return dbEkle('pair_requests', veri);
}

function eslesmeDinle(requestId, callback) {
    console.log("[database.js] Eşleşme dinle:", requestId);
    dbDinle('pair_requests/' + requestId, callback);
}

function eslesmeGuncelle(requestId, veri) {
    console.log("[database.js] Eşleşme güncelle:", requestId);
    return dbGuncelle('pair_requests/' + requestId, veri);
}

function eslesmeDinlemeyiBirak(requestId) {
    dbDinlemeyiBirak('pair_requests/' + requestId);
}

// Gelen davetleri dinle (receiver olarak)
function gelenDavetleriDinle(uid, callback) {
    console.log("[database.js] Gelen davetleri dinle:", uid);
    db.ref('pair_requests')
        .orderByChild('receiverId')
        .equalTo(uid)
        .on('child_added', function(snapshot) {
            var request = snapshot.val();
            request._key = snapshot.key;
            if (request.status === 'pending') {
                callback(request);
            }
        });
}

function gelenDavetleriDinlemeyiBirak() {
    db.ref('pair_requests').off('child_added');
}

// ──────────────────────────────────────────────
// CHAT
// ──────────────────────────────────────────────

function chatMesajGonder(pairId, veri) {
    console.log("[database.js] Chat mesaj gönder:", pairId);
    return dbEkle('chat_messages/' + pairId, veri);
}

function chatDinle(pairId, callback) {
    console.log("[database.js] Chat dinle:", pairId);
    db.ref('chat_messages/' + pairId)
        .orderByChild('timestamp')
        .on('child_added', function(snapshot) {
            var mesaj = snapshot.val();
            mesaj._key = snapshot.key;
            callback(mesaj);
        });
}

function chatDinlemeyiBirak(pairId) {
    console.log("[database.js] Chat dinlemeyi bırak:", pairId);
    db.ref('chat_messages/' + pairId).off('child_added');
}

// ──────────────────────────────────────────────
// ÖDÜL KULLANIMI (REDEMPTIONS)
// ──────────────────────────────────────────────

function oduluKullan(uid, veri) {
    console.log("[database.js] Ödül kullan:", uid);
    return dbEkle('redemptions/' + uid, veri);
}

async function kuponlarimOku(uid) {
    console.log("[database.js] Kuponlarım oku:", uid);
    return await dbOku('redemptions/' + uid);
}

function kuponGuncelle(uid, redemptionId, veri) {
    console.log("[database.js] Kupon güncelle:", uid, redemptionId);
    return dbGuncelle('redemptions/' + uid + '/' + redemptionId, veri);
}

// ──────────────────────────────────────────────
// YARDIMCI: PUAN GÜNCELLEME (ATOMIK)
// ──────────────────────────────────────────────

async function puanEkle(uid, eklenecekPuan) {
    console.log("[database.js] Puan ekle:", uid, "+" + eklenecekPuan);
    try {
        // Mevcut puanı oku
        var mevcutPuan = await dbOku('users/' + uid + '/totalPoints');
        var yeniPuan = (mevcutPuan || 0) + eklenecekPuan;

        // Users tablosunu güncelle
        await kullaniciProfilGuncelle(uid, {
            totalPoints: yeniPuan,
            lastSeen: Date.now()
        });

        // Leaderboard'u güncelle
        await leaderboardGuncelle(uid, {
            displayName: kullaniciBilgileri.displayName,
            photoURL: kullaniciBilgileri.photoURL || '',
            totalPoints: yeniPuan,
            lastUpdated: Date.now()
        });

        // Lokal bilgiyi güncelle
        if (kullaniciBilgileri) {
            kullaniciBilgileri.totalPoints = yeniPuan;
        }

        // Harita puanını güncelle
        haritaPuanGuncelle();

        console.log("[database.js] Puan güncellendi:", yeniPuan);
        return yeniPuan;
    } catch (error) {
        console.error("[database.js] Puan ekleme hatası:", error);
        throw error;
    }
}

async function puanDus(uid, dusulecekPuan) {
    console.log("[database.js] Puan düş:", uid, "-" + dusulecekPuan);
    try {
        var mevcutPuan = await dbOku('users/' + uid + '/totalPoints');
        var yeniPuan = Math.max(0, (mevcutPuan || 0) - dusulecekPuan);

        await kullaniciProfilGuncelle(uid, {
            totalPoints: yeniPuan,
            lastSeen: Date.now()
        });

        await leaderboardGuncelle(uid, {
            displayName: kullaniciBilgileri.displayName,
            photoURL: kullaniciBilgileri.photoURL || '',
            totalPoints: yeniPuan,
            lastUpdated: Date.now()
        });

        if (kullaniciBilgileri) {
            kullaniciBilgileri.totalPoints = yeniPuan;
        }

        haritaPuanGuncelle();

        console.log("[database.js] Puan düşürüldü:", yeniPuan);
        return yeniPuan;
    } catch (error) {
        console.error("[database.js] Puan düşürme hatası:", error);
        throw error;
    }
}

// ──────────────────────────────────────────────
// YARDIMCI: OYUN SAYISI ARTIRMA
// ──────────────────────────────────────────────

async function oyunSayisiArtir(uid) {
    try {
        var mevcut = await dbOku('users/' + uid + '/gamesPlayed');
        var yeni = (mevcut || 0) + 1;
        await kullaniciProfilGuncelle(uid, { gamesPlayed: yeni });
        if (kullaniciBilgileri) {
            kullaniciBilgileri.gamesPlayed = yeni;
        }
        console.log("[database.js] Oyun sayısı artırıldı:", yeni);
    } catch (error) {
        console.error("[database.js] Oyun sayısı artırma hatası:", error);
    }
}

// ──────────────────────────────────────────────
// YARDIMCI: XP SEVİYE HESAPLA
// ──────────────────────────────────────────────

function xpSeviyeHesapla(toplamPuan) {
    // Her 2000 puanda 1 seviye, minimum 1
    return Math.max(1, Math.floor((toplamPuan || 0) / 2000) + 1);
}

async function xpSeviyeGuncelle(uid) {
    try {
        var toplamPuan = kullaniciBilgileri ? kullaniciBilgileri.totalPoints : 0;
        var yeniSeviye = xpSeviyeHesapla(toplamPuan);
        await kullaniciProfilGuncelle(uid, { xpLevel: yeniSeviye });
        if (kullaniciBilgileri) {
            kullaniciBilgileri.xpLevel = yeniSeviye;
        }
        console.log("[database.js] XP seviye güncellendi:", yeniSeviye);
    } catch (error) {
        console.error("[database.js] XP seviye güncelleme hatası:", error);
    }
}

console.log("[database.js] Database modülü yüklendi.");
