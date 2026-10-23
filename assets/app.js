
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CFGK = "rira_cfg", CACHEK = "rira_cache";
  function cfg() { try { return JSON.parse(localStorage.getItem(CFGK) || "{}"); } catch (e) { return {}; } }
  function api(action, body) {
    var c = cfg();
    if (!c.url || !c.key) return Promise.reject({ code: "config", message: "Hubungkan ke Google Sheets dulu di tab Pengaturan." });
    return fetch(c.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ key: c.key, action: action, pin: S.pin || "" }, body || {})) })
      .then(function (r) { return r.json(); }, function () { throw { code: "network", message: "Tidak bisa terhubung. Periksa internet dan alamat Apps Script." }; })
      .then(function (j) { if (j && j.error) throw { code: j.error, message: j.message }; return j; }, function (e) {
        if (e && e.code) throw e; throw { code: "bad", message: "Jawaban dari Apps Script tidak terbaca. Periksa alamat dan pengaturan akses (Anyone)." };
      });
  }
  var S = { mode: null, pin: "", last: Date.now(), offline: false, pasien: [], tarif: [], icd: [], tt: 20, ym: "", editing: null, user: null, loaded: { pasien: false, tarif: false, icd: false } };

  var BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
  var rupiah = new Intl.NumberFormat("id-ID");
  function rp(n) { return "Rp " + rupiah.format(Math.round(n || 0)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dn(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function fmtDate(s) { if (!s) return ""; var p = s.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function monthBounds(ym) { var p = ym.split("-"); var y = +p[0], m = +p[1]; return { start: Date.UTC(y, m - 1, 1) / 864e5, end: Date.UTC(y, m, 1) / 864e5, days: (Date.UTC(y, m, 1) - Date.UTC(y, m - 1, 1)) / 864e5 }; }
  function monthLabel(ym) { var p = ym.split("-"); return BULAN[+p[1] - 1] + " " + p[0]; }
  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 2600); }
  function num(v) { var n = parseInt(String(v || "").replace(/[^\d]/g, ""), 10); return isNaN(n) ? 0 : n; }

  /* ---------- perhitungan ---------- */
  function tarifOf(kelas) { for (var i = 0; i < S.tarif.length; i++) if (S.tarif[i].nama === kelas) return S.tarif[i].harga || 0; return 0; }
  function icdName(kode) { var k = (kode || "").trim().toUpperCase(); for (var i = 0; i < S.icd.length; i++) if (S.icd[i].kode.toUpperCase() === k) return S.icd[i].nama; return ""; }
  // Hari keluar efektif: minimal 1 hari menginap. Pasien yang belum keluar dihitung sampai hari ini.
  function outDay(p) { var a = dn(p.masuk); var e = p.keluar ? dn(p.keluar) : dn(todayStr()); return Math.max(e, a + 1); }
  function lama(p) { return outDay(p) - dn(p.masuk); }
  function biaya(p) { return lama(p) * tarifOf(p.kelas) + (p.extra || 0); }
  function hpIn(p, ym) { var b = monthBounds(ym); var s = Math.max(dn(p.masuk), b.start), e = Math.min(outDay(p), b.end); return Math.max(0, e - s); }
  function overlaps(p, ym) { return hpIn(p, ym) > 0; }
  function sorted(list) { return list.slice().sort(function (a, b) { return a.masuk < b.masuk ? -1 : a.masuk > b.masuk ? 1 : (a.createdAt || 0) - (b.createdAt || 0); }); }

  /* ---------- periode ---------- */
  function setPeriod(ym) { S.ym = ym; $("#period").value = ym; renderAll(); }
  function shift(d) { var p = S.ym.split("-"); var dt = new Date(+p[0], +p[1] - 1 + d, 1); setPeriod(dt.getFullYear() + "-" + pad(dt.getMonth() + 1)); }
  function defaultPeriod() {
    var cur = todayStr().slice(0, 7);
    if (!S.pasien.length || S.pasien.some(function (p) { return overlaps(p, cur); })) return cur;
    var last = sorted(S.pasien).pop(); return last.masuk.slice(0, 7);
  }

  /* ---------- render ---------- */
  function renderAll() { if (!S.ym) return; renderReg(); renderRekap(); renderMaster(); renderFormSelects(); updateBill(); }

  function periodPatients() { return sorted(S.pasien.filter(function (p) { return overlaps(p, S.ym); })); }

  function kTag(p) { return p.kondisi === "mati48" ? '<span class="pill dead">Meninggal ≥48 jam</span>' : p.kondisi === "mati" ? '<span class="pill dead">Meninggal &lt;48 jam</span>' : ""; }
  function renderReg() {
    var list = periodPatients();
    $("#bukuTitle").textContent = "Buku registrasi · " + monthLabel(S.ym);
    $("#bukuNote").textContent = list.length + " pasien tercatat pada periode ini";
    var tb = $("#tblReg tbody");
    if (!list.length) {
      tb.innerHTML = '<tr><td class="empty" colspan="12">' + (S.loaded.pasien ? "Belum ada pasien pada " + monthLabel(S.ym) + ". Isi formulir di atas untuk mencatat pasien pertama." : "Memuat data…") + "</td></tr>";
      $("#tblReg tfoot").innerHTML = ""; return;
    }
    var totHP = 0, totBiaya = 0;
    tb.innerHTML = list.map(function (p, i) {
      var l = lama(p), b = biaya(p); totHP += hpIn(p, S.ym); totBiaya += b;
      var run = !p.keluar;
      return '<tr class="' + (S.editing === p.id ? "sel" : "") + '"><td class="num">' + (i + 1) + "</td><td>" + esc(p.nama) + '</td><td class="num">' + esc(p.rm) + "</td><td>" + esc(p.kelas) +
        '</td><td class="num">' + fmtDate(p.masuk) + '</td><td class="num">' + (run ? '<span class="pill in">Dirawat</span>' : fmtDate(p.keluar) + kTag(p)) + '</td><td class="num">' + esc(p.icd) + "</td><td>" + (esc(icdName(p.icd)) || '<span class="note">Kode belum ada di master</span>') +
        '</td><td class="num r">' + l + (run ? "*" : "") + '</td><td class="num r">' + rupiah.format(tarifOf(p.kelas)) + '</td><td class="num r">' + rp(b) + (run ? "*" : "") + '</td><td><div class="rowbtns"><button class="btn small" data-edit="' + esc(p.id) + '">Ubah</button><button class="btn small danger" data-del="' + esc(p.id) + '">Hapus</button></div></td></tr>';
    }).join("");
    $("#tblReg tfoot").innerHTML = '<tr><td colspan="8">Total HP (Hari Perawatan) · biaya <span class="note">* masih dirawat, dihitung sampai hari ini</span></td><td class="num r">' + totHP + '</td><td></td><td class="num r">' + rp(totBiaya) + "</td><td></td></tr>";
  }

  function stats() {
    var b = monthBounds(S.ym), list = periodPatients();
    var hp = 0, keluar = 0, income = 0, mati = 0, mati48 = 0, ld = 0;
    list.forEach(function (p) { hp += hpIn(p, S.ym); });
    S.pasien.forEach(function (p) { if (p.keluar && p.keluar.slice(0, 7) === S.ym) { keluar++; income += biaya(p); ld += lama(p); if (p.kondisi === "mati" || p.kondisi === "mati48") mati++; if (p.kondisi === "mati48") mati48++; } });
    var tt = S.tt || 0;
    var bor = tt ? hp / (tt * b.days) * 100 : 0;
    var bto = tt ? keluar / tt : 0;
    var toi = keluar ? ((tt * b.days) - hp) / keluar : null;
    var avlos = keluar ? ld / keluar : null;
    var ndr = keluar ? mati48 / keluar * 1000 : null;
    var gdr = keluar ? mati / keluar * 1000 : null;
    return { list: list, hp: hp, keluar: keluar, income: income, bor: bor, bto: bto, toi: toi, days: b.days, tt: tt, avlos: avlos, ndr: ndr, gdr: gdr, mati: mati, mati48: mati48, ld: ld };
  }

  function renderRekap() {
    var st = stats();
    $("#rekapTitle").textContent = "Rekap " + monthLabel(S.ym);
    var borOk = st.bor >= 60 && st.bor <= 85;
    var toiOk = st.toi != null && st.toi >= 1 && st.toi <= 3;
    var btoYear = st.bto * 12;
    var btoOk = btoYear >= 40 && btoYear <= 50;
    function chip(ok, txt) { return '<span class="pill ' + (ok ? "ok" : "no") + '">' + txt + "</span>"; }
    $("#kpis").innerHTML =
      '<div class="kpi"><span class="label">Pasien keluar</span><span class="v">' + st.keluar + '</span><span class="s">' + st.list.length + " pasien tercatat pada bulan ini</span></div>" +
      '<div class="kpi"><span class="label">Hari perawatan (HP)</span><span class="v">' + st.hp + '</span><span class="s">dari ' + st.tt + " TT × " + st.days + " hari</span></div>" +
      '<div class="kpi"><span class="label">BOR</span><span class="v">' + st.bor.toFixed(1) + '%</span><div class="meter" aria-hidden="true"><u style="left:60%;width:25%"></u><i style="width:' + Math.min(100, st.bor) + '%"></i></div><span class="s">' + chip(borOk, borOk ? "Dalam standar" : "Di luar standar") + " ideal 60–85%</span></div>" +
      '<div class="kpi"><span class="label">BTO</span><span class="v">' + st.bto.toFixed(2) + '×</span><span class="s">setara ' + btoYear.toFixed(1) + "×/tahun " + chip(btoOk, "ideal 40–50") + "</span></div>" +
      '<div class="kpi"><span class="label">TOI</span><span class="v">' + (st.toi == null ? "–" : st.toi.toFixed(1)) + '</span><span class="s">hari ' + (st.toi == null ? "" : chip(toiOk, "ideal 1–3")) + "</span></div>" +
      '<div class="kpi"><span class="label">Pendapatan</span><span class="v" style="font-size:22px">' + rp(st.income) + '</span><span class="s">dari pasien yang keluar bulan ini</span></div>' +
      '<div class="kpi"><span class="label">AVLOS</span><span class="v">' + (st.avlos == null ? "–" : st.avlos.toFixed(1)) + '</span><span class="s">hari rata-rata rawat ' + (st.avlos == null ? "" : chip(st.avlos >= 6 && st.avlos <= 9, "ideal 6–9")) + "</span></div>" +
      '<div class="kpi"><span class="label">NDR</span><span class="v">' + (st.ndr == null ? "–" : st.ndr.toFixed(1)) + '</span><span class="s">‰ meninggal ≥48 jam (' + st.mati48 + " pasien) " + (st.ndr == null ? "" : chip(st.ndr < 25, "ideal &lt; 25‰")) + "</span></div>" +
      '<div class="kpi"><span class="label">GDR</span><span class="v">' + (st.gdr == null ? "–" : st.gdr.toFixed(1)) + '</span><span class="s">‰ semua meninggal (' + st.mati + " pasien) " + (st.gdr == null ? "" : chip(st.gdr < 45, "ideal &lt; 45‰")) + "</span></div>";

    var tb = $("#tblRekap tbody");
    if (!st.list.length) { tb.innerHTML = '<tr><td class="empty" colspan="10">Belum ada data pada ' + monthLabel(S.ym) + ".</td></tr>"; $("#tblRekap tfoot").innerHTML = ""; }
    else {
      var tb2 = 0;
      tb.innerHTML = st.list.map(function (p, i) {
        var b = (p.keluar && p.keluar.slice(0, 7) === S.ym) ? biaya(p) : 0; tb2 += b;
        return '<tr><td class="num">' + (i + 1) + "</td><td>" + esc(p.nama) + '</td><td class="num">' + esc(p.rm) + "</td><td>" + esc(p.kelas) + '</td><td class="num">' + fmtDate(p.masuk) + '</td><td class="num">' + (p.keluar ? fmtDate(p.keluar) : '<span class="pill in">Dirawat</span>') + '</td><td class="num">' + esc(p.icd) + "</td><td>" + esc(icdName(p.icd)) + '</td><td class="num r">' + hpIn(p, S.ym) + '</td><td class="num r">' + (b ? rp(b) : '<span class="note">–</span>') + "</td></tr>";
      }).join("");
      $("#tblRekap tfoot").innerHTML = '<tr><td colspan="8">Total HP (Hari Perawatan)</td><td class="num r">' + st.hp + '</td><td class="num r">' + rp(tb2) + "</td></tr>";
    }

    var byK = {}; st.list.forEach(function (p) { var o = byK[p.kelas] || (byK[p.kelas] = { n: 0, hp: 0, inc: 0 }); o.n++; o.hp += hpIn(p, S.ym); if (p.keluar && p.keluar.slice(0, 7) === S.ym) o.inc += biaya(p); });
    var kr = Object.keys(byK).sort();
    $("#tblKelas tbody").innerHTML = kr.length ? kr.map(function (k) { return "<tr><td>" + esc(k) + '</td><td class="num r">' + byK[k].n + '</td><td class="num r">' + byK[k].hp + '</td><td class="num r">' + rp(byK[k].inc) + "</td></tr>"; }).join("") : '<tr><td class="empty" colspan="4">Belum ada data.</td></tr>';

    var byD = {}; st.list.forEach(function (p) { var k = (p.icd || "").toUpperCase(); byD[k] = (byD[k] || 0) + 1; });
    var dk = Object.keys(byD).sort(function (a, b) { return byD[b] - byD[a] || (a < b ? -1 : 1); });
    $("#tblDx tbody").innerHTML = dk.length ? dk.map(function (k) { return '<tr><td class="num">' + esc(k) + "</td><td>" + esc(icdName(k)) + '</td><td class="num r">' + byD[k] + "</td></tr>"; }).join("") : '<tr><td class="empty" colspan="3">Belum ada data.</td></tr>';
  }

  function renderMaster() {
    if (document.activeElement !== $("#m-tt")) $("#m-tt").value = S.tt;
    $("#tblTarif tbody").innerHTML = S.tarif.length ? S.tarif.slice().sort(function (a, b) { return a.nama < b.nama ? -1 : 1; }).map(function (t) { return "<tr><td>" + esc(t.nama) + '</td><td class="num r">' + rp(t.harga) + '</td><td><div class="rowbtns"><button class="btn small" data-tedit="' + esc(t.id) + '">Ubah</button><button class="btn small danger" data-tdel="' + esc(t.id) + '">Hapus</button></div></td></tr>'; }).join("") : '<tr><td class="empty" colspan="3">Belum ada tarif. Tambahkan ruangan di atas.</td></tr>';
    $("#tblIcd tbody").innerHTML = S.icd.length ? S.icd.slice().sort(function (a, b) { return a.kode < b.kode ? -1 : 1; }).map(function (t) { return '<tr><td class="num">' + esc(t.kode) + "</td><td>" + esc(t.nama) + '</td><td><div class="rowbtns"><button class="btn small" data-iedit="' + esc(t.id) + '">Ubah</button><button class="btn small danger" data-idel="' + esc(t.id) + '">Hapus</button></div></td></tr>'; }).join("") : '<tr><td class="empty" colspan="3">Belum ada kode ICD-10.</td></tr>';
  }

  function renderFormSelects() {
    var sel = $("#f-kelas"), cur = sel.value;
    var opts = '<option value="">Pilih ruangan…</option>' + S.tarif.slice().sort(function (a, b) { return a.nama < b.nama ? -1 : 1; }).map(function (t) { return '<option value="' + esc(t.nama) + '">' + esc(t.nama) + " · " + rupiah.format(t.harga) + "/hari</option>"; }).join("");
    if (sel.dataset.sig !== opts) { sel.innerHTML = opts; sel.dataset.sig = opts; sel.value = cur; }
    var dl = S.icd.map(function (i) { return '<option value="' + esc(i.kode) + '">' + esc(i.nama) + "</option>"; }).join("");
    if ($("#icdlist").dataset.sig !== dl) { $("#icdlist").innerHTML = dl; $("#icdlist").dataset.sig = dl; }
  }

  /* ---------- form & harga langsung ---------- */
  function formData() {
    return { nama: $("#f-nama").value.trim(), rm: $("#f-rm").value.trim(), kelas: $("#f-kelas").value, masuk: $("#f-masuk").value, keluar: $("#f-keluar").value, icd: $("#f-icd").value.trim().toUpperCase(), extra: num($("#f-extra").value), kondisi: $("#f-kondisi").value };
  }
  function updateBill() {
    var f = formData(), calc = $("#calc"), total = $("#total");
    var nm = icdName(f.icd), h = $("#icdHint");
    h.className = "hint"; h.textContent = f.icd ? (nm || "Kode belum ada di Master ICD-10") : "Diagnosa muncul otomatis";
    if (f.icd && !nm) h.className = "hint err";
    if (!f.kelas || !f.masuk) { calc.textContent = "Isi ruangan dan tanggal masuk untuk melihat harga."; total.textContent = "Rp 0"; return; }
    if (f.keluar && f.keluar < f.masuk) { calc.innerHTML = '<span style="color:var(--bad)">Tanggal keluar lebih awal dari tanggal masuk.</span>'; total.textContent = "Rp 0"; return; }
    var p = { masuk: f.masuk, keluar: f.keluar, kelas: f.kelas, extra: f.extra };
    var l = lama(p), t = tarifOf(f.kelas);
    calc.innerHTML = "<b>" + l + " hari</b>" + (f.keluar ? "" : " (sampai hari ini)") + " × <b>" + rp(t) + "</b> / hari" + (f.extra ? " + biaya lain <b>" + rp(f.extra) + "</b>" : "");
    total.textContent = rp(biaya(p));
  }
  function clearForm() {
    S.editing = null; $("#form").reset(); $("#formTitle").textContent = "Pasien baru"; $("#save").textContent = "Simpan pasien"; $("#cancel").hidden = true;
    var d = todayStr(); $("#f-masuk").value = S.ym === d.slice(0, 7) ? d : S.ym + "-01"; updateBill(); renderReg();
  }
  function startEdit(id) {
    var p = S.pasien.find(function (x) { return x.id === id; }); if (!p) return;
    S.editing = id; $("#formTitle").textContent = "Ubah data pasien"; $("#save").textContent = "Simpan perubahan"; $("#cancel").hidden = false;
    $("#f-nama").value = p.nama; $("#f-rm").value = p.rm; $("#f-kelas").value = p.kelas; $("#f-masuk").value = p.masuk; $("#f-keluar").value = p.keluar || ""; $("#f-icd").value = p.icd; $("#f-extra").value = p.extra || ""; $("#f-kondisi").value = p.kondisi || "hidup";
    updateBill(); renderReg(); $("#form").scrollIntoView({ behavior: "smooth", block: "start" }); $("#f-nama").focus();
  }

  function guard() {
    if (S.mode !== "input") { toast("Mode monitoring tidak bisa mengubah data."); return false; }
    if (!navigator.onLine) { toast("Tidak ada koneksi internet."); return false; }
    if (S.offline) { toast("Belum tersambung ke Google Sheets."); return false; }
    return true;
  }
  function fail(e) {
    if (e && (e.code === "pin" || e.code === "locked")) { lock(e.message); return; }
    toast((e && e.message) || "Gagal menyimpan. Coba lagi.");
  }
  var pendingDel = {};
  function confirmDel(btn, key, fn) {
    if (pendingDel[key]) { clearTimeout(pendingDel[key]); delete pendingDel[key]; fn(); return; }
    var old = btn.textContent; btn.textContent = "Yakin?";
    pendingDel[key] = setTimeout(function () { delete pendingDel[key]; btn.textContent = old; }, 3000);
  }

  $("#form").addEventListener("input", updateBill);
  $("#form").addEventListener("submit", function (e) {
    e.preventDefault(); if (!guard()) return;
    var f = formData();
    if (!f.nama || !f.rm || !f.kelas || !f.masuk || !f.icd) { toast("Lengkapi data yang wajib diisi."); return; }
    if (f.keluar && f.keluar < f.masuk) { toast("Tanggal keluar lebih awal dari tanggal masuk."); return; }
    if (!f.keluar && f.kondisi !== "hidup") { toast("Isi tanggal keluar untuk pasien yang meninggal."); return; }
    var id = S.editing;
    var body = { id: id || "", nama: f.nama, rm: f.rm, kelas: f.kelas, masuk: f.masuk, keluar: f.keluar || "", icd: f.icd, extra: f.extra, kondisi: f.keluar ? f.kondisi : "hidup" };
    $("#save").disabled = true;
    api("pasien_save", body).then(function () { return load(); }).then(function () {
      toast(id ? "Perubahan disimpan." : "Pasien tersimpan: " + rp(biaya(body)));
      var ym = f.masuk.slice(0, 7); clearForm(); if (ym !== S.ym) setPeriod(ym);
    }, fail).then(function () { $("#save").disabled = false; });
  });
  $("#cancel").addEventListener("click", clearForm);

  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    var d = b.dataset;
    if (d.edit) startEdit(d.edit);
    else if (d.del) confirmDel(b, d.del, function () { if (guard()) api("pasien_delete", { id: d.del }).then(load).then(function () { if (S.editing === d.del) clearForm(); toast("Data pasien dihapus."); }, fail); });
    else if (d.tedit) { var t = S.tarif.find(function (x) { return x.id === d.tedit; }); if (t) { $("#t-nama").value = t.nama; $("#t-harga").value = t.harga; $("#t-nama").focus(); } }
    else if (d.tdel) confirmDel(b, d.tdel, function () { if (guard()) api("tarif_delete", { id: d.tdel }).then(load).then(function () { toast("Tarif dihapus."); }, fail); });
    else if (d.iedit) { var i = S.icd.find(function (x) { return x.id === d.iedit; }); if (i) { $("#i-kode").value = i.kode; $("#i-nama").value = i.nama; $("#i-nama").focus(); } }
    else if (d.idel) confirmDel(b, d.idel, function () { if (guard()) api("icd_delete", { id: d.idel }).then(load).then(function () { toast("Kode ICD dihapus."); }, fail); });
  });

    $("#tarifForm").addEventListener("submit", function (e) {
    e.preventDefault(); if (!guard()) return;
    var nama = $("#t-nama").value.trim(), harga = num($("#t-harga").value); if (!nama) return;
    api("tarif_save", { nama: nama, harga: harga }).then(load).then(function () { $("#tarifForm").reset(); toast("Tarif disimpan."); }, fail);
  });
  $("#icdForm").addEventListener("submit", function (e) {
    e.preventDefault(); if (!guard()) return;
    var kode = $("#i-kode").value.trim().toUpperCase(), nama = $("#i-nama").value.trim(); if (!kode || !nama) return;
    api("icd_save", { kode: kode, nama: nama }).then(load).then(function () { $("#icdForm").reset(); toast("Kode ICD disimpan."); }, fail);
  });
  var ttTimer;
  $("#m-tt").addEventListener("input", function () {
    var v = Math.max(1, num(this.value)); S.tt = v; renderRekap();
    clearTimeout(ttTimer); ttTimer = setTimeout(function () { api("tt_save", { tt: v }).then(function () { toast("Jumlah TT disimpan."); }, fail); }, 600);
  });
  /* ---------- tab & periode ---------- */
  function showTab(name) {
    ["reg", "rekap", "master"].forEach(function (t) { $("#tab-" + t).hidden = t !== name; });
    document.querySelectorAll("nav.tabs button").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === name)); });
    try { history.replaceState(null, "", "#" + name); } catch (e) {}
  }
  document.querySelectorAll("nav.tabs button").forEach(function (b) { b.addEventListener("click", function () { showTab(b.dataset.tab); }); });
  $("#prev").addEventListener("click", function () { shift(-1); });
  $("#next").addEventListener("click", function () { shift(1); });
  $("#period").addEventListener("change", function () { if (this.value) setPeriod(this.value); });

  /* ---------- unduh CSV (format Excel Indonesia: pemisah titik koma) ---------- */
  function csv(rows) { return "﻿" + rows.map(function (r) { return r.map(function (c) { c = String(c == null ? "" : c); return /[;"\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(";"); }).join("\r\n"); }
  function save(name, rows) {
    var blob = new Blob([csv(rows)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("File diunduh.");
  }
  $("#dlReg").addEventListener("click", function () {
    var rows = [["No", "Nama Pasien", "No. RM", "Ruangan / Kelas", "Tanggal Masuk", "Tanggal Keluar", "Kode ICD-10", "Diagnosa Utama", "Lama Inap (Hari)", "Tarif per Hari", "Biaya Lain", "Total Biaya", "Kondisi Keluar"]];
    periodPatients().forEach(function (p, i) { rows.push([i + 1, p.nama, p.rm, p.kelas, p.masuk, p.keluar, p.icd, icdName(p.icd), lama(p), tarifOf(p.kelas), p.extra || 0, biaya(p), p.keluar ? (p.kondisi === "mati48" ? "Meninggal >=48 jam" : p.kondisi === "mati" ? "Meninggal <48 jam" : "Hidup") : ""]); });
    save("Registrasi_Rawat_Inap_" + S.ym + ".csv", rows);
  });
  $("#dlRekap").addEventListener("click", function () {
    var st = stats();
    var rows = [["Rekap Rawat Inap", monthLabel(S.ym)], [], ["No", "Nama Pasien", "No. RM", "Ruangan / Kelas", "Tanggal Masuk", "Tanggal Keluar", "Kode ICD-10", "Diagnosa Utama", "HP Bulan Ini", "Total Biaya (pasien keluar bulan ini)"]];
    st.list.forEach(function (p, i) { rows.push([i + 1, p.nama, p.rm, p.kelas, p.masuk, p.keluar, p.icd, icdName(p.icd), hpIn(p, S.ym), (p.keluar && p.keluar.slice(0, 7) === S.ym) ? biaya(p) : 0]); });
    rows.push(["Total HP (Hari Perawatan)", "", "", "", "", "", "", "", st.hp, st.income], [],
      ["Jumlah TT", st.tt], ["Hari dalam periode", st.days], ["Pasien keluar", st.keluar],
      ["BOR (%)", st.bor.toFixed(2)], ["BTO (kali/bulan)", st.bto.toFixed(2)], ["TOI (hari)", st.toi == null ? "" : st.toi.toFixed(2)],
      ["AVLOS (hari)", st.avlos == null ? "" : st.avlos.toFixed(2)], ["Pasien meninggal >=48 jam", st.mati48], ["NDR (permil)", st.ndr == null ? "" : st.ndr.toFixed(2)], ["Pasien meninggal (semua)", st.mati], ["GDR (permil)", st.gdr == null ? "" : st.gdr.toFixed(2)]);
    save("Rekap_Rawat_Inap_" + S.ym + ".csv", rows);
  });

  /* ---------- sambungan & data ---------- */
  var firstLoad = true;
  function banner(msg) { var b = $("#banner"); b.hidden = !msg; if (msg) b.textContent = msg; }
  function cacheSave(j) { try { localStorage.setItem(CACHEK, JSON.stringify({ t: Date.now(), d: j })); } catch (e) {} }
  function cacheRead() { try { return JSON.parse(localStorage.getItem(CACHEK) || "null"); } catch (e) { return null; } }
  function applyData(j) {
    S.pasien = j.pasien; S.tarif = j.tarif; S.icd = j.icd;
    if (typeof j.tt === "number" && document.activeElement !== $("#m-tt")) S.tt = j.tt;
    S.loaded.pasien = S.loaded.tarif = S.loaded.icd = true;
    if (firstLoad) {
      firstLoad = false;
      var ym = defaultPeriod(); S.ym = ym; $("#period").value = ym;
      var dd = todayStr(); $("#f-masuk").value = ym === dd.slice(0, 7) ? dd : ym + "-01";
    }
    renderAll();
  }
  function load() {
    var c = cfg();
    if (!c.url || !c.key) { S.offline = true; S.loaded.pasien = true; banner("Belum tersambung ke Google Sheets. Buka tab Pengaturan untuk menghubungkan."); renderAll(); return Promise.resolve(); }
    return api("bootstrap").then(function (j) { S.offline = false; cacheSave(j); applyData(j); banner(""); }, function (e) {
      S.offline = true;
      var c2 = cacheRead();
      if (e && e.code === "network" && c2) { applyData(c2.d); banner("Tidak ada koneksi. Menampilkan data terakhir (" + new Date(c2.t).toLocaleString("id-ID") + "). Perubahan belum bisa disimpan."); }
      else { S.loaded.pasien = true; banner((e && e.message) || "Gagal memuat data."); renderAll(); }
    });
  }
  var IDLE_MS = 5 * 60 * 1000;
  function showGate(showCfg) {
    S.mode = null; S.pin = "";
    document.body.classList.remove("mode-input", "mode-monitor");
    $("#app").hidden = true; $("#gate").hidden = false;
    $("#pinForm").hidden = true; $("#pin").value = ""; $("#pinMsg").textContent = "";
    $("#gateMsg").hidden = true; $("#gateMsg").textContent = "";
    var configured = !!cfg().url;
    $("#gateChoices").hidden = !!showCfg || !configured;
    $("#cfgBox").hidden = !(showCfg || !configured);
    $("#cfgBack").hidden = !configured;
    window.scrollTo(0, 0);
  }
  function enter(mode) {
    S.mode = mode; S.last = Date.now();
    document.body.classList.toggle("mode-input", mode === "input");
    document.body.classList.toggle("mode-monitor", mode === "monitor");
    $("#gate").hidden = true; $("#app").hidden = false;
    $("#modeLabel").textContent = mode === "input" ? "Mode input" : "Mode monitoring";
    showTab(mode === "input" ? "reg" : "rekap");
    renderAll(); load(); window.scrollTo(0, 0);
  }
  function lock(msg) {
    var was = S.mode; if (was === "input") clearForm();
    showGate(false);
    if (msg) { $("#gateMsg").textContent = msg; $("#gateMsg").hidden = false; }
  }
  function idleCheck() { if (S.mode === "input" && Date.now() - S.last > IDLE_MS) lock("Terkunci otomatis karena lama tidak dipakai."); }

  $("#chMon").addEventListener("click", function () { enter("monitor"); });
  $("#chInput").addEventListener("click", function () { $("#pinForm").hidden = false; $("#pin").focus(); });
  $("#pinCancel").addEventListener("click", function () { $("#pinForm").hidden = true; $("#pin").value = ""; $("#pinMsg").textContent = ""; });
  $("#pinForm").addEventListener("submit", function (e) {
    e.preventDefault(); var pin = $("#pin").value.trim(); if (!pin) return;
    $("#pinGo").disabled = true; $("#pinMsg").textContent = "Memeriksa PIN…";
    api("pin_check", { pin: pin }).then(function () { S.pin = pin; $("#pin").value = ""; $("#pinMsg").textContent = ""; enter("input"); },
      function (er) { $("#pin").value = ""; $("#pinMsg").textContent = (er && er.message) || "Gagal memeriksa PIN."; })
      .then(function () { $("#pinGo").disabled = false; });
  });
  $("#lockBtn").addEventListener("click", function () { lock(); });
  $("#gateCfg").addEventListener("click", function () { showGate(true); });
  $("#cfgBack").addEventListener("click", function () { showGate(false); });
  ["pointerdown", "keydown", "touchstart", "input"].forEach(function (ev) { document.addEventListener(ev, function () { S.last = Date.now(); }, true); });

  $("#cfgForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var url = $("#c-url").value.trim(), key = $("#c-key").value, res = $("#cfgRes");
    if (!/^https:\/\/script\.google\.com\//.test(url) && !/^https:\/\/script\.googleusercontent\.com\//.test(url)) { res.textContent = "Alamat harus diawali https://script.google.com/ ..."; return; }
    try { localStorage.setItem(CFGK, JSON.stringify({ url: url, key: key })); } catch (x) { res.textContent = "Browser tidak mengizinkan menyimpan pengaturan."; return; }
    res.textContent = "Menguji koneksi…"; $("#cfgSave").disabled = true;
    api("bootstrap").then(function (j) {
      S.offline = false; cacheSave(j); applyData(j); res.textContent = "";
      $("#c-key").value = ""; showGate(false);
    }, function (er) { S.offline = true; res.textContent = (er && er.message) || "Gagal tersambung."; }).then(function () { $("#cfgSave").disabled = false; });
  });
  $("#cfgClear").addEventListener("click", function () {
    try { localStorage.removeItem(CFGK); localStorage.removeItem(CACHEK); } catch (e) {}
    S.pasien = []; S.offline = true; $("#c-url").value = ""; $("#c-key").value = ""; showGate(true);
    $("#cfgRes").textContent = "Sambungan diputus di perangkat ini. Data di spreadsheet tidak berubah.";
  });
  function init() {
    var sp = $("#splash"); if (sp) { sp.addEventListener("click", function () { sp.style.display = "none"; }); setTimeout(function () { sp.style.display = "none"; }, 3700); }
    var d = todayStr();
    $("#f-masuk").value = d; S.ym = d.slice(0, 7); $("#period").value = S.ym;
    var c = cfg(); $("#c-url").value = c.url || "";
    renderAll();
    var cached = c.url ? cacheRead() : null; if (cached) applyData(cached.d);
    showGate(false);
    setInterval(function () { if (S.mode && document.visibilityState === "visible" && !S.offline) load(); }, 60000);
    setInterval(idleCheck, 15000);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") { idleCheck(); if (S.mode) load(); } });
    window.addEventListener("online", function () { if (S.mode) load(); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  init();
})();
