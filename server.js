
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

const PRODUCTS_FILE = path.join(__dirname, "products.json");
const MAINTENANCE_FILE = path.join(__dirname, "maintenance.json");

// ===== Operation Log (OG) =====
const logs = [];
const MAX_LOGS = 100;
function ogLog(message) {
  const time = new Date().toLocaleString("zh-TW", { hour12: false });
  const entry = `[${time}] ${message}`;
  console.log(entry);    // 終端機
  logs.unshift(entry);   // admin log
  if (logs.length > MAX_LOGS) logs.pop();
}

// 🔧 維護 middleware（放在 static 前）
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  if (req.path.startsWith("/admin")) return next();

  let maintenance = false;
  try {
    const config = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, "utf8"));
    maintenance = config.maintenance;
  } catch (e) {}

  if (maintenance) {
    return res.send(`
      <h1 style="text-align:center;margin-top:20vh;">
        🔧 網站維護中!<br>請耐心等待!
      </h1>
    `);
  }
  next();
});

app.use(express.static(__dirname)); // 靜態檔案

// ===== API =====

// 取得商品列表
app.get("/api/products", (req, res) => {
  fs.readFile(PRODUCTS_FILE, "utf8", (err, data) => {
    if(err) return res.status(500).send("讀取商品失敗");
    res.json(JSON.parse(data));
  });
});

// 新增商品
app.post("/api/products", (req, res) => {
  const newProduct = req.body;

  fs.readFile(PRODUCTS_FILE, "utf8", (err, data) => {
    if(err) return res.status(500).send("讀取商品失敗");
    let products = JSON.parse(data);
    products.push(newProduct);

    fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), err => {
      if(err) return res.status(500).send("寫入商品失敗");

      ogLog(`新增商品：${newProduct.name || "未命名商品"}`);
      res.json(newProduct);
    });
  });
});

// 上下架狀態更新
app.post("/api/products/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  fs.readFile(PRODUCTS_FILE, "utf8", (err, data) => {
    if(err) return res.status(500).send("讀取商品失敗");
    let products = JSON.parse(data);
    const product = products.find(p => p.id === id);
    if(!product) return res.status(404).send("找不到商品");

    product.status = status;

    fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), err => {
      if(err) return res.status(500).send("寫入商品失敗");

      ogLog(`商品上下架：${product.name} → ${status}`);
      res.json({success:true, product});
    });
  });
});

// 刪除商品
app.delete("/api/products/:id", (req, res) => {
  const { id } = req.params;
  fs.readFile(PRODUCTS_FILE, "utf8", (err, data) => {
    if(err) return res.status(500).send("讀取商品失敗");
    let products = JSON.parse(data);
    const index = products.findIndex(p => p.id === id);
    if(index === -1) return res.status(404).send("找不到商品");

    const deleted = products.splice(index, 1)[0];

    fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2), err => {
      if(err) return res.status(500).send("刪除商品失敗");

      ogLog(`刪除商品：${deleted.name}`);
      res.json({success:true});
    });
  });
});

// ===== 維護模式 =====
app.get("/api/maintenance", (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, "utf8"));
    res.json({ maintenance: config.maintenance });
  } catch(err){
    res.json({ maintenance: false });
  }
});

app.post("/api/maintenance", (req, res) => {
  const { maintenance } = req.body;
  try {
    const config = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, "utf8"));
    config.maintenance = !!maintenance;
    fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(config, null, 2));

    ogLog(`維護模式：${maintenance ? "ON" : "OFF"}`);
    res.json({ message: `維護模式已 ${maintenance ? "開啟" : "關閉"}` });
  } catch(err){
    res.status(500).json({ message: "無法更新維護模式" });
  }
});

// ===== 取得 logs =====
app.get("/api/logs", (req, res) => {
  res.json(logs);
});

// ===== Factory Reset：清空所有商品 =====
app.post("/api/factory-reset", (req, res) => {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2), "utf8");
    ogLog("⚠️ Factory Reset：所有商品已清空");
    res.json({ message: "所有商品已清空（恢復出廠）" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "清空商品失敗" });
  }
});

const ANNOUNCEMENT_FILE = path.join(__dirname, "announcement.json");

// 取得公告
app.get("/api/announcement", (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE, "utf8"));
    res.json({ text: data.text || "" });
  } catch (err) {
    res.json({ text: "" });
  }
});

// 更新公告（admin用）
app.post("/api/announcement", (req, res) => {
  const { text } = req.body;
  try {
    fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify({ text }, null, 2));
    ogLog(`公告更新：${text}`);
    res.json({ message: "公告已更新" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "無法更新公告" });
  }
});


app.listen(PORT, "0.0.0.0", () => console.log(`Server running at http://0.0.0.0:${PORT}`));
