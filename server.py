# -*- coding: utf-8 -*-
"""
أوتو أويل — نظام نقاط البيع وإدارة المخزون لمحطات خدمة زيوت السيارات
Auto Oil — POS & Inventory ERP for automotive oil change service stations.
Back-end: Python standard library only (http.server + sqlite3). No dependencies.
Run:  python server.py   →  http://localhost:8000
Files: server.py + index.html  (pos.db is created automatically on first run)
"""
import json
import os
import random
import re
import sqlite3
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "pos.db")
HTML_PATH = os.path.join(BASE_DIR, "index.html")
PORT = 8000
LOW_STOCK = 5          # حد المخزون المنخفض
EGYPT_BARCODE_PREFIX = "622"   # GS1 Egypt prefix


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ------------------------------------------------------------------ schema --
SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    category TEXT DEFAULT '',
    viscosity TEXT DEFAULT '',
    size TEXT DEFAULT '',
    sku TEXT UNIQUE NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total REAL NOT NULL,
    profit REAL NOT NULL,
    items_count INTEGER NOT NULL,
    returned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name TEXT NOT NULL,
    qty INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL,
    subtotal REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    type TEXT NOT NULL,              -- supply | sale | return | adjust
    qty INTEGER NOT NULL,            -- +24 / -2 / -1 ...
    balance INTEGER NOT NULL,        -- remaining stock after movement
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supplier_tx (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    type TEXT NOT NULL,              -- invoice | payment_cash | payment_bank
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
);
"""


# -------------------------------------------------------------- seed data --
def seed():
    """بيانات تجريبية واقعية بالجنيه المصري + مبيعات آخر ٧ أيام + حركات مخزون متسقة."""
    conn = db()
    cur = conn.cursor()
    if cur.execute("SELECT COUNT(*) FROM products").fetchone()[0] > 0:
        conn.close()
        return

    def ts(days_ago, hour=10, minute=0):
        t = datetime.now() - timedelta(days=days_ago)
        return t.replace(hour=hour, minute=minute, second=random.randint(0, 59)).strftime("%Y-%m-%d %H:%M:%S")

    # suppliers -------------------------------------------------------------
    sup = [
        ("شركة النيل لتوزيع الزيوت", "0100 123 4567"),
        ("مؤسسة الدلتا أوتو بارتس", "0111 987 6543"),
        ("المصريون للزيوت الصناعية", "0122 345 6789"),
    ]
    for i, (n, p) in enumerate(sup):
        cur.execute("INSERT INTO suppliers (name, phone, created_at) VALUES (?,?,?)",
                    (n, p, ts(30, 9)))

    # products (أسعار السوق المصري التقريبية بالجنيه) ------------------------
    products = [
        # name, brand, category, viscosity, size, price, cost, stock
        ("كاسترول ماجناتك",      "Castrol",     "زيت محرك",   "5W-30",  "4 لتر",   620,  520, 24),
        ("شل هيلكس ألترا",       "Shell",       "زيت محرك",   "5W-40",  "4 لتر",   680,  570, 18),
        ("موبيل 1 FS",           "Mobil",       "زيت محرك",   "0W-30",  "4 لتر",  1150,  980,  6),
        ("توتال كوارتز 9000",    "Total",       "زيت محرك",   "5W-40",  "4 لتر",   590,  490, 12),
        ("بترمين تيك",           "Petromin",    "زيت محرك",   "10W-40", "4 لتر",   385,  310, 30),
        ("فالفولين ماكس لايف",   "Valvoline",   "زيت محرك",   "10W-40", "4 لتر",   540,  450,  9),
        ("ليكوي مولي مولي جين",  "Liqui Moly",  "زيت محرك",   "5W-40",  "4 لتر",   990,  830,  4),
        ("كاسترول إيدج",         "Castrol",     "زيت محرك",   "0W-20",  "4 لتر",   890,  740,  0),
        ("زيت جيربوكس أوتوماتيك ATF", "Mobil",   "زيت جيربوكس", "ATF",    "1 لتر",   165,  120, 40),
        ("شل سبارم",             "Shell",       "زيت دفرنش",  "75W-90", "1 لتر",   210,  160, 15),
        ("بريكسي كلاسيك",        "Brexi",       "زيت محرك",   "20W-50", "4 لتر",   240,  185,  3),
        ("مبرد رادياتير جاهز",   "Total",       "سوائل أخرى",  "-",     "4 لتر",   180,  130, 26),
        ("فلتر زيت هونداي / كيا", "OEM",        "فلاتر",      "-",      "قطعة",    95,   60, 36),
        ("فلتر زيت تويوتا",      "OEM",         "فلاتر",      "-",      "قطعة",   110,   72, 22),
    ]
    for (n, b, c, v, s, price, cost, stock) in products:
        cur.execute(
            "INSERT INTO products (name,brand,category,viscosity,size,sku,price,cost,stock,created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (n, b, c, v, s, f"{EGYPT_BARCODE_PREFIX}{random.randint(10**9, 10**10 - 1)}",
             price, cost, stock, ts(29, 9)))
    conn.commit()
    pids = [r["id"] for r in cur.execute("SELECT id FROM products ORDER BY id")]

    # supplier invoices / payments -------------------------------------------
    ledger = [
        (1, "invoice",       18500, "فاتورة توريد زيوت شهرية",            ts(25, 11)),
        (1, "payment_cash",  10000, "دفعة نقدية",                        ts(12, 13)),
        (2, "invoice",        7300, "فاتورة توريد فلاتر وزيوت",           ts(20, 12)),
        (2, "payment_bank",   2500, "تحويل بنكي على حساب الشركة",          ts(6, 10)),
        (3, "invoice",       12400, "فاتورة توريد زيوت صناعية",            ts(18, 14)),
        (3, "payment_bank",  12400, "سداد كامل بتحويل بنكي",              ts(3, 9)),
    ]
    for sid, t, amt, note, d in ledger:
        cur.execute("INSERT INTO supplier_tx (supplier_id,type,amount,note,created_at) VALUES (?,?,?,?,?)",
                    (sid, t, amt, note, d))
    conn.commit()

    # sales over the last 7 days (sold qty per product drives supply movements) --
    sales_plan = [
        (6, 10, [(0, 1), (12, 2)]),
        (5, 12, [(1, 1), (8, 1), (13, 1)]),
        (4, 11, [(0, 1), (9, 2)]),
        (3, 15, [(3, 1), (11, 1), (12, 1)]),
        (2, 13, [(4, 2), (8, 3)]),
        (1, 16, [(1, 1), (5, 1), (13, 1)]),
        (0, 10, [(0, 1), (12, 1)]),            # اليوم
        (0, 12, [(4, 1), (9, 1)]),             # اليوم
        (0, 14, [(3, 2), (8, 1), (13, 1)]),    # اليوم
    ]
    sold = {}
    for days_ago, hour, items in sales_plan:
        created = ts(days_ago, hour)
        total = profit = 0
        n_items = 0
        for pidx, q in items:
            p = cur.execute("SELECT * FROM products WHERE id=?", (pids[pidx],)).fetchone()
            total += p["price"] * q
            profit += (p["price"] - p["cost"]) * q
            n_items += q
            sold[pidx] = sold.get(pidx, 0) + q
        cur.execute("INSERT INTO sales (total,profit,items_count,returned,created_at) VALUES (?,?,?,0,?)",
                    (total, profit, n_items, created))
        sale_id = cur.lastrowid
        for pidx, q in items:
            p = cur.execute("SELECT * FROM products WHERE id=?", (pids[pidx],)).fetchone()
            cur.execute("INSERT INTO sale_items (sale_id,product_id,product_name,qty,unit_price,unit_cost,subtotal) "
                        "VALUES (?,?,?,?,?,?,?)",
                        (sale_id, p["id"], p["name"], q, p["price"], p["cost"], p["price"] * q))

    # consistent stock audit trail: initial supply then each cash sale ----------
    for pidx, pid in enumerate(pids):
        p = cur.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
        sold_qty = sold.get(pidx, 0)
        balance = p["stock"] + sold_qty
        cur.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) VALUES (?,?,?,?,?,?)",
                    (pid, "supply", balance, balance, "رصيد افتتاحي من التوريد الأول", ts(28, 9)))
        for days_ago, hour, items in sorted(sales_plan, key=lambda x: (x[0], x[1]), reverse=True):
            for idx, q in items:
                if idx != pidx:
                    continue
                balance -= q
                cur.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) VALUES (?,?,?,?,?,?)",
                            (pid, "sale", -q, balance, "بيع نقدي", ts(days_ago, hour)))
    conn.commit()
    conn.close()


# ------------------------------------------------------------------- api --
def gen_sku(conn):
    while True:
        sku = f"{EGYPT_BARCODE_PREFIX}{random.randint(10**9, 10**10 - 1)}"
        if not conn.execute("SELECT 1 FROM products WHERE sku=?", (sku,)).fetchone():
            return sku


def supplier_outstanding(conn, supplier_id=None):
    q = ("SELECT s.id, COALESCE(SUM(CASE WHEN t.type='invoice' THEN t.amount ELSE -t.amount END),0) AS bal "
         "FROM suppliers s LEFT JOIN supplier_tx t ON t.supplier_id=s.id")
    if supplier_id:
        rows = conn.execute(q + " WHERE s.id=? GROUP BY s.id", (supplier_id,)).fetchall()
        return rows[0]["bal"] if rows else 0
    return {r["id"]: r["bal"] for r in conn.execute(q + " GROUP BY s.id").fetchall()}


def get_products(conn, search="", flt="all"):
    sql, params = "SELECT * FROM products", []
    if search:
        sql += " WHERE (name LIKE ? OR brand LIKE ? OR sku LIKE ? OR viscosity LIKE ?)"
        s = f"%{search}%"
        params += [s, s, s, s]
    rows = [dict(r) for r in conn.execute(sql + " ORDER BY name", params)]
    if flt == "low":
        rows = [r for r in rows if 0 < r["stock"] <= LOW_STOCK]
    elif flt == "out":
        rows = [r for r in rows if r["stock"] == 0]
    return rows


def make_sale(conn, items):
    """items: [{product_id, qty}] → sale + stock movements + profit."""
    total = profit = items_count = 0
    lines = []
    for it in items:
        p = conn.execute("SELECT * FROM products WHERE id=?", (it["product_id"],)).fetchone()
        if not p:
            raise ValueError("صنف غير موجود")
        qty = int(it["qty"])
        if qty <= 0:
            raise ValueError("كمية غير صالحة")
        if p["stock"] < qty:
            raise ValueError(f"المخزون غير كافٍ للصنف «{p['name']}» (المتاح: {p['stock']})")
        total += p["price"] * qty
        profit += (p["price"] - p["cost"]) * qty
        items_count += qty
        lines.append((p, qty))
    created = now_str()
    cur = conn.execute("INSERT INTO sales (total,profit,items_count,returned,created_at) VALUES (?,?,?,0,?)",
                       (total, profit, items_count, created))
    sale_id = cur.lastrowid
    for p, qty in lines:
        conn.execute("INSERT INTO sale_items (sale_id,product_id,product_name,qty,unit_price,unit_cost,subtotal) "
                     "VALUES (?,?,?,?,?,?,?)",
                     (sale_id, p["id"], p["name"], qty, p["price"], p["cost"], p["price"] * qty))
        balance = p["stock"] - qty
        conn.execute("UPDATE products SET stock=? WHERE id=?", (balance, p["id"]))
        conn.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) "
                     "VALUES (?,?,?,?, 'بيع نقدي', ?)", (p["id"], "sale", -qty, balance, created))
    conn.commit()
    return {"id": sale_id, "total": total, "profit": profit, "items_count": items_count, "created_at": created}


def api(request, body):
    """Router: request = dict(path, query). Returns (status, data)."""
    path = request["path"]
    conn = db()
    try:
        # ---- dashboard ----
        if path == "/api/dashboard":
            today = datetime.now().strftime("%Y-%m-%d")
            r = conn.execute("SELECT COALESCE(SUM(total),0) s, COALESCE(SUM(profit),0) p, COUNT(*) c "
                             "FROM sales WHERE returned=0 AND date(created_at)=?", (today,)).fetchone()
            week = []
            for i in range(6, -1, -1):
                d = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
                w = conn.execute("SELECT COALESCE(SUM(total),0) s, COUNT(*) c FROM sales "
                                 "WHERE returned=0 AND date(created_at)=?", (d,)).fetchone()
                name = (datetime.now() - timedelta(days=i)).strftime("%A")
                week.append({"date": d, "day": name, "sales": w["s"], "count": w["c"]})
            liabilities = supplier_outstanding(conn)
            out = {
                "today_sales": r["s"], "today_profit": r["p"], "today_count": r["c"],
                "liabilities": sum(liabilities.values()),
                "week": week,
                "products": conn.execute("SELECT COUNT(*) FROM products").fetchone()[0],
                "low_stock": conn.execute("SELECT COUNT(*) FROM products WHERE stock>0 AND stock<=?",
                                          (LOW_STOCK,)).fetchone()[0],
                "out_stock": conn.execute("SELECT COUNT(*) FROM products WHERE stock=0").fetchone()[0],
            }
            return 200, out

        # ---- products ----
        if path == "/api/products" and request["method"] == "GET":
            return 200, get_products(conn, request["query"].get("search", [""])[0],
                                     request["query"].get("filter", ["all"])[0])

        if path == "/api/products" and request["method"] == "POST":
            b = body
            for f in ("name", "price"):
                if not b.get(f):
                    raise ValueError("اسم الصنف وسعر البيع مطلوبان")
            sku = (b.get("sku") or "").strip() or gen_sku(conn)
            if conn.execute("SELECT 1 FROM products WHERE sku=?", (sku,)).fetchone():
                raise ValueError("هذا الباركود مستخدم بالفعل لصنف آخر")
            stock = int(b.get("stock") or 0)
            created = now_str()
            cur = conn.execute(
                "INSERT INTO products (name,brand,category,viscosity,size,sku,price,cost,stock,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (b["name"].strip(), b.get("brand", ""), b.get("category", ""), b.get("viscosity", ""),
                 b.get("size", ""), sku, float(b["price"]), float(b.get("cost") or 0), stock, created))
            pid = cur.lastrowid
            if stock > 0:
                conn.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) "
                             "VALUES (?,?,?,?, 'رصيد افتتاحي', ?)", (pid, "supply", stock, stock, created))
            conn.commit()
            return 200, {"id": pid}

        m = re.match(r"^/api/products/(\d+)$", path)
        if m and request["method"] == "POST":   # تعديل صنف
            p = conn.execute("SELECT * FROM products WHERE id=?", (m.group(1),)).fetchone()
            if not p:
                raise ValueError("الصنف غير موجود")
            b = body
            sku = (b.get("sku") or p["sku"]).strip()
            other = conn.execute("SELECT 1 FROM products WHERE sku=? AND id<>?", (sku, p["id"])).fetchone()
            if other:
                raise ValueError("هذا الباركود مستخدم بالفعل لصنف آخر")
            conn.execute("UPDATE products SET name=?,brand=?,category=?,viscosity=?,size=?,sku=?,price=?,cost=? "
                         "WHERE id=?",
                         (b.get("name", p["name"]).strip(), b.get("brand", p["brand"]), b.get("category", p["category"]),
                          b.get("viscosity", p["viscosity"]), b.get("size", p["size"]), sku,
                          float(b.get("price", p["price"])), float(b.get("cost", p["cost"])), p["id"]))
            conn.commit()
            return 200, {"ok": True}

        m = re.match(r"^/api/products/(\d+)/restock$", path)
        if m:
            p = conn.execute("SELECT * FROM products WHERE id=?", (m.group(1),)).fetchone()
            if not p:
                raise ValueError("الصنف غير موجود")
            qty = int(body.get("qty") or 0)
            if qty <= 0:
                raise ValueError("أدخل كمية صحيحة")
            cost = float(body.get("cost") or p["cost"])
            balance = p["stock"] + qty
            created = now_str()
            if body.get("update_cost"):
                conn.execute("UPDATE products SET stock=?, cost=? WHERE id=?", (balance, cost, p["id"]))
            else:
                conn.execute("UPDATE products SET stock=? WHERE id=?", (balance, p["id"]))
            conn.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) "
                         "VALUES (?,?,?,?, 'فاتورة توريد', ?)", (p["id"], "supply", qty, balance, created))
            sid = int(body.get("supplier_id") or 0)
            if sid:
                conn.execute("INSERT INTO supplier_tx (supplier_id,type,amount,note,created_at) "
                             "VALUES (?,?,?, 'فاتورة توريد', ?)",
                             (sid, "invoice", round(qty * cost, 2), created))
            conn.commit()
            return 200, {"ok": True, "stock": balance}

        m = re.match(r"^/api/products/(\d+)/adjust$", path)
        if m:
            p = conn.execute("SELECT * FROM products WHERE id=?", (m.group(1),)).fetchone()
            if not p:
                raise ValueError("الصنف غير موجود")
            delta = int(body.get("delta") or 0)
            if delta == 0:
                raise ValueError("أدخل قيمة التسوية (+/-)")
            balance = p["stock"] + delta
            if balance < 0:
                raise ValueError("لا يمكن أن يكون الرصيد سلبياً")
            conn.execute("UPDATE products SET stock=? WHERE id=?", (balance, p["id"]))
            conn.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) "
                         "VALUES (?,?,?,?, ?, ?)",
                         (p["id"], "adjust", delta, balance, body.get("note") or "تسوية يدوية", now_str()))
            conn.commit()
            return 200, {"ok": True, "stock": balance}

        if path == "/api/sku":
            return 200, {"sku": gen_sku(conn)}

        # ---- movements ----
        if path == "/api/movements":
            pid = request["query"].get("product_id", [""])[0]
            if not pid:
                raise ValueError("حدد الصنف")
            rows = [dict(r) for r in conn.execute(
                "SELECT * FROM movements WHERE product_id=? ORDER BY id DESC", (pid,))]
            return 200, rows

        # ---- sales ----
        if path == "/api/sales" and request["method"] == "GET":
            rows = [dict(r) for r in conn.execute(
                "SELECT * FROM sales ORDER BY id DESC LIMIT 300")]
            return 200, rows

        if path == "/api/sales" and request["method"] == "POST":
            return 200, make_sale(conn, body.get("items") or [])

        m = re.match(r"^/api/sales/(\d+)$", path)
        if m and request["method"] == "GET":
            s = conn.execute("SELECT * FROM sales WHERE id=?", (m.group(1),)).fetchone()
            if not s:
                raise ValueError("الفاتورة غير موجودة")
            items = [dict(r) for r in conn.execute(
                "SELECT * FROM sale_items WHERE sale_id=?", (s["id"],))]
            return 200, {"sale": dict(s), "items": items}

        m = re.match(r"^/api/sales/(\d+)/return$", path)
        if m:
            s = conn.execute("SELECT * FROM sales WHERE id=?", (m.group(1),)).fetchone()
            if not s:
                raise ValueError("الفاتورة غير موجودة")
            if s["returned"]:
                raise ValueError("تم إرجاع هذه الفاتورة بالفعل")
            items = conn.execute("SELECT * FROM sale_items WHERE sale_id=?", (s["id"],)).fetchall()
            created = now_str()
            for it in items:
                p = conn.execute("SELECT * FROM products WHERE id=?", (it["product_id"],)).fetchone()
                balance = (p["stock"] if p else 0) + it["qty"]
                conn.execute("UPDATE products SET stock=? WHERE id=?", (balance, it["product_id"]))
                conn.execute("INSERT INTO movements (product_id,type,qty,balance,note,created_at) "
                             "VALUES (?,?,?,?, 'مرتجع بيع', ?)",
                             (it["product_id"], "return", it["qty"], balance, created))
            conn.execute("UPDATE sales SET returned=1 WHERE id=?", (s["id"],))
            conn.commit()
            return 200, {"ok": True}

        # ---- suppliers ----
        if path == "/api/suppliers" and request["method"] == "GET":
            out = []
            for s in conn.execute("SELECT * FROM suppliers ORDER BY name"):
                d = dict(s)
                d["outstanding"] = supplier_outstanding(conn, s["id"])
                out.append(d)
            return 200, out

        if path == "/api/suppliers" and request["method"] == "POST":
            if not body.get("name"):
                raise ValueError("اسم المورد مطلوب")
            cur = conn.execute("INSERT INTO suppliers (name,phone,created_at) VALUES (?,?,?)",
                               (body["name"].strip(), body.get("phone", ""), now_str()))
            conn.commit()
            return 200, {"id": cur.lastrowid}

        m = re.match(r"^/api/suppliers/(\d+)$", path)
        if m and request["method"] == "GET":    # كشف حساب
            sid = int(m.group(1))
            s = conn.execute("SELECT * FROM suppliers WHERE id=?", (sid,)).fetchone()
            if not s:
                raise ValueError("المورد غير موجود")
            txs = [dict(r) for r in conn.execute(
                "SELECT * FROM supplier_tx WHERE supplier_id=? ORDER BY id DESC", (sid,))]
            return 200, {"supplier": dict(s), "outstanding": supplier_outstanding(conn, sid), "tx": txs}

        m = re.match(r"^/api/suppliers/(\d+)/tx$", path)
        if m:
            sid = int(m.group(1))
            if not conn.execute("SELECT 1 FROM suppliers WHERE id=?", (sid,)).fetchone():
                raise ValueError("المورد غير موجود")
            t = body.get("type")
            if t not in ("invoice", "payment_cash", "payment_bank"):
                raise ValueError("نوع الحركة غير صالح")
            amount = float(body.get("amount") or 0)
            if amount <= 0:
                raise ValueError("أدخل مبلغاً صحيحاً")
            conn.execute("INSERT INTO supplier_tx (supplier_id,type,amount,note,created_at) VALUES (?,?,?,?,?)",
                         (sid, t, amount, body.get("note", ""), now_str()))
            conn.commit()
            return 200, {"outstanding": supplier_outstanding(conn, sid)}

        raise ValueError("مسار غير معروف")
    except ValueError as e:
        return 400, {"error": str(e)}
    finally:
        conn.close()


# ------------------------------------------------------------------ http --
class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, data, ctype="application/json; charset=utf-8"):
        payload = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _request(self, method):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        body = {}
        if method == "POST":
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                try:
                    body = json.loads(self.rfile.read(length).decode("utf-8"))
                except Exception:
                    return self._send(400, {"error": "طلب غير صالح"})
        if parsed.path in ("/", "/index.html"):
            try:
                with open(HTML_PATH, "rb") as f:
                    return self._send(200, f.read(), "text/html; charset=utf-8")
            except FileNotFoundError:
                return self._send(500, {"error": "index.html غير موجود"})
        if parsed.path in ("/app.js", "/ui.js"):
            try:
                with open(os.path.join(BASE_DIR, parsed.path.lstrip("/")), "rb") as f:
                    return self._send(200, f.read(), "application/javascript; charset=utf-8")
            except FileNotFoundError:
                return self._send(500, {"error": "ملف الواجهة غير موجود"})
        if parsed.path.startswith("/api/"):
            try:
                status, data = api({"path": parsed.path, "query": query, "method": method}, body)
                return self._send(status, data)
            except Exception as e:
                return self._send(500, {"error": f"خطأ داخلي: {e}"})
        self._send(404, {"error": "404"})

    def do_GET(self):
        self._request("GET")

    def do_POST(self):
        self._request("POST")


def port_free(port):
    """True if no other process is accepting connections on this port."""
    import socket
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=0.4)
        s.close()
        return False   # someone answered → busy
    except OSError:
        return True


def main():
    conn = db()
    conn.executescript(SCHEMA)
    conn.close()
    seed()
    srv = None
    for port in (PORT, 8001, 8080, 8090, 8888):
        if not port_free(port):
            print(f"* port {port} busy, trying next...")
            continue
        try:
            srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
            print(f"* POS server running ->  http://localhost:{port}  (DB: pos.db)")
            break
        except OSError:
            print(f"* port {port} busy, trying next...")
    if not srv:
        raise SystemExit("No free port found (8000/8001/8080/8090/8888).")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
