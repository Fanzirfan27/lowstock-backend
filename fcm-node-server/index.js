// index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";

/* =========================
 * 1) Load Service Account
 * ========================= */
function loadServiceAccount() {
  // Opsi A: path file .json => .env: GOOGLE_APPLICATION_CREDENTIALS=C:\path\serviceAccount.json
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath && fs.existsSync(filePath)) {
    const raw = fs.readFileSync(path.resolve(filePath), "utf8");
    const sa = JSON.parse(raw);
    if (!sa.project_id)
      throw new Error("Missing project_id in service account file");
    if (typeof sa.private_key === "string")
      sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    return sa;
  }

  // Opsi B: JSON inline => .env: GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}
  const inline = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (inline) {
    const sa = JSON.parse(inline);
    if (!sa.project_id)
      throw new Error("Missing project_id in inline service account JSON");
    if (typeof sa.private_key === "string")
      sa.private_key = sa.private_key.replace(/\\n/g, "\n");
    return sa;
  }

  throw new Error(
    "No credentials found. Set GOOGLE_APPLICATION_CREDENTIALS (file path) or GOOGLE_APPLICATION_CREDENTIALS_JSON (inline JSON)."
  );
}

const serviceAccount = loadServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const fcm = admin.messaging();

/* =========================
 * 2) App & Middleware
 * ========================= */
const app = express();
app.use(cors());
app.use(express.json());

// (Opsional) API key sederhana untuk proteksi endpoint
const API_KEY = process.env.API_KEY || ""; // isi di .env kalau mau aktifkan
app.use((req, res, next) => {
  if (!API_KEY) return next(); // tidak diaktifkan
  const key = req.get("x-api-key");
  if (key !== API_KEY)
    return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
});

/* =========================
 * 3) Helpers
 * ========================= */
async function removeBrokenTokens(tokens) {
  if (!tokens?.length) return;
  // Cari dokumen users yang mengandung token-token ini, lalu remove dari array
  const tasks = tokens.map(async (t) => {
    try {
      const qs = await db
        .collection("users")
        .where("fcm_tokens", "array-contains", t)
        .get();
      const batch = db.batch();
      qs.forEach((doc) =>
        batch.update(doc.ref, {
          fcm_tokens: admin.firestore.FieldValue.arrayRemove(t),
        })
      );
      await batch.commit();
    } catch {
      // ignore cleanup errors
    }
  });
  await Promise.all(tasks);
}

/* =========================
 * 4) Routes
 * ========================= */

// Health
app.get("/", (_, res) => res.send("lowstock-server up"));
app.get("/healthz", (_, res) => res.json({ ok: true }));

// Simpan token FCM ke dokumen user
app.post("/fcm/register", async (req, res) => {
  try {
    const { uid, token } = req.body || {};
    if (!uid || !token)
      return res.status(400).json({ ok: false, error: "uid & token wajib" });

    await db
      .collection("users")
      .doc(uid)
      .set(
        { fcm_tokens: admin.firestore.FieldValue.arrayUnion(token) },
        { merge: true }
      );

    res.json({ ok: true });
  } catch (e) {
    console.error("register token error", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Hapus token FCM saat logout
app.post("/fcm/unregister", async (req, res) => {
  try {
    const { uid, token } = req.body || {};
    if (!uid || !token)
      return res.status(400).json({ ok: false, error: "uid & token wajib" });

    await db
      .collection("users")
      .doc(uid)
      .set(
        { fcm_tokens: admin.firestore.FieldValue.arrayRemove(token) },
        { merge: true }
      );

    res.json({ ok: true });
  } catch (e) {
    console.error("unregister token error", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Kirim notif stok menipis ke semua super_admin
app.post("/notify/lowstock", async (req, res) => {
  try {
    const { title, body, produkId, stok, min_stok } = req.body ?? {};

    // Ambil token admin
    const qs = await db
      .collection("users")
      .where("role", "==", "super_admin")
      .get();
    const tokens = [];
    qs.forEach((d) => {
      const many = d.get("fcm_tokens") || [];
      if (Array.isArray(many)) tokens.push(...many.filter(Boolean));
      const single = d.get("fcm_token"); // legacy
      if (single) tokens.push(single);
    });

    if (!tokens.length)
      return res.json({ ok: true, sent: 0, note: "no tokens" });

    const resp = await fcm.sendEachForMulticast({
      tokens,
      notification: {
        title: title || "Stok Menipis",
        body:
          body ||
          `Produk ${produkId ?? ""} sisa ${stok ?? "-"} (batas ${
            min_stok ?? "-"
          })`,
      },
      data: {
        type: "LOW_STOCK",
        ...(produkId ? { produkId: String(produkId) } : {}),
        ...(stok != null ? { stok: String(stok) } : {}),
        ...(min_stok != null ? { min_stok: String(min_stok) } : {}),
      },
      android: { priority: "high", notification: { channelId: "alerts" } },
    });

    // Bersihkan token rusak
    const badTokens =
      resp.responses
        ?.map((r, i) => (!r.success ? tokens[i] : null))
        .filter(Boolean) || [];
    if (badTokens.length) await removeBrokenTokens(badTokens);

    res.json({ ok: true, sent: resp.successCount, failed: resp.failureCount });
  } catch (e) {
    console.error("lowstock error", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// (Opsional) Notif shift ditutup ke admin
app.post("/notify/shiftClosed", async (req, res) => {
  try {
    const { shiftId, kasirUid, total, selisih } = req.body ?? {};

    const qs = await db
      .collection("users")
      .where("role", "==", "super_admin")
      .get();
    const tokens = qs.docs
      .flatMap((d) => d.get("fcm_tokens") || [])
      .filter(Boolean);
    if (!tokens.length)
      return res.json({ ok: true, sent: 0, note: "no tokens" });

    const body =
      `Kasir ${kasirUid || "-"} • Total: Rp ${Number(total || 0).toLocaleString(
        "id-ID"
      )} • ` + `Selisih: Rp ${Number(selisih || 0).toLocaleString("id-ID")}`;

    const resp = await fcm.sendEachForMulticast({
      tokens,
      notification: { title: "Shift Ditutup", body },
      data: { type: "SHIFT_CLOSED", shiftId: String(shiftId || "") },
      android: { priority: "high", notification: { channelId: "alerts" } },
    });

    const badTokens =
      resp.responses
        ?.map((r, i) => (!r.success ? tokens[i] : null))
        .filter(Boolean) || [];
    if (badTokens.length) await removeBrokenTokens(badTokens);

    res.json({ ok: true, sent: resp.successCount, failed: resp.failureCount });
  } catch (e) {
    console.error("shiftClosed error", e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

/* =========================
 * 5) Start
 * ========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on :${PORT}`);
});
