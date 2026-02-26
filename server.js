const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = 3000;
const JWT_SECRET = "uwshop-secret";

/* ================= 基本設定 ================= */

app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, "users.json");
const ADMIN_FILE = path.join(__dirname, "admin.json");
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const MAINTENANCE_FILE = path.join(__dirname, "maintenance.json");
const ANNOUNCEMENT_FILE = path.join(__dirname, "announcement.json");

/* 確保必要檔案存在 */
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, "[]");
if (!fs.existsSync(MAINTENANCE_FILE)) fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({ maintenance:false }, null, 2));
if (!fs.existsSync(ANNOUNCEMENT_FILE)) fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify({ text:"" }, null, 2));

/* ================= OG Log ================= */

const logs = [];
const MAX_LOGS = 100;

function ogLog(message) {
  const time = new Date().toLocaleString("zh-TW", { hour12:false });
  const entry = `[${time}] ${message}`;
  console.log(entry);
  logs.unshift(entry);
  if (logs.length > MAX_LOGS) logs.pop();
}

/* ================= JWT 工具 ================= */

function generateToken(payload, expires="2h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn:expires });
}

function verifyToken(req,res,next){
  const auth = req.headers["authorization"];
  if(!auth) return res.status(401).json({message:"未登入"});
  const token = auth.split(" ")[1];
  try{
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  }catch(err){
    res.status(401).json({message:"Token 無效或過期"});
  }
}

function requireAdmin(req,res,next){
  if(req.user.role !== "admin"){
    return res.status(403).json({message:"需要管理員權限"});
  }
  next();
}

/* ================= 維護模式 middleware ================= */

app.use((req,res,next)=>{
  if(req.path.startsWith("/api")) return next();
  if(req.path.startsWith("/admin")) return next();

  try{
    const config = JSON.parse(fs.readFileSync(MAINTENANCE_FILE,"utf8"));
    if(config.maintenance){
      return res.send(`
        <h1 style="text-align:center;margin-top:20vh;">
        🔧 網站維護中<br>請稍後再來
        </h1>
      `);
    }
  }catch(e){}
  next();
});

app.use(express.static(__dirname));

/* ================================================= */
/* ================= 登入系統 ====================== */
/* ================================================= */

app.post("/api/admin/login", async (req,res)=>{
  const { username, password } = req.body;

  if(!fs.existsSync(ADMIN_FILE))
    return res.status(500).json({message:"admin.json 不存在"});

  const adminData = JSON.parse(fs.readFileSync(ADMIN_FILE,"utf8"));

  if(username !== adminData.username)
    return res.status(401).json({message:"帳號錯誤"});

  const valid = await bcrypt.compare(password, adminData.password);
  if(!valid)
    return res.status(401).json({message:"密碼錯誤"});

  const token = generateToken({ username, role:"admin" });
  ogLog(`管理員登入：${username}`);
  res.json({ token });
});

app.post("/api/register", async (req,res)=>{
  const { username,password } = req.body;
  if(!username || !password)
    return res.status(400).json({message:"帳號密碼必填"});

  let users = JSON.parse(fs.readFileSync(USERS_FILE,"utf8"));
  if(users.find(u=>u.username===username))
    return res.status(400).json({message:"帳號已存在"});

  const hashed = await bcrypt.hash(password,10);
  users.push({ username, password:hashed, role:"user" });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));

  ogLog(`新會員註冊：${username}`);
  res.json({message:"註冊成功"});
});

app.post("/api/login", async (req,res)=>{
  const { username,password } = req.body;
  let users = JSON.parse(fs.readFileSync(USERS_FILE,"utf8"));
  const user = users.find(u=>u.username===username);
  if(!user) return res.status(400).json({message:"帳號不存在"});

  const valid = await bcrypt.compare(password,user.password);
  if(!valid) return res.status(400).json({message:"密碼錯誤"});

  const token = generateToken({
    username:user.username,
    role:user.role || "user"
  });

  ogLog(`會員登入：${username}`);
  res.json({ token });
});

app.get("/api/users/me", verifyToken, (req,res)=>{
  res.json({
    username:req.user.username,
    role:req.user.role || "user"
  });
});

/* ================================================= */
/* ================= 商品管理 ====================== */
/* ================================================= */

app.get("/api/products",(req,res)=>{
  const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE,"utf8"));
  res.json(products);
});

app.post("/api/products", verifyToken, requireAdmin, (req,res)=>{
  const newProduct = req.body;
  let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE,"utf8"));
  products.push(newProduct);
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products,null,2));
  ogLog(`新增商品：${newProduct.name || "未命名"}`);
  res.json(newProduct);
});

app.post("/api/products/:id/status", verifyToken, requireAdmin,(req,res)=>{
  const { id } = req.params;
  const { status } = req.body;

  let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE,"utf8"));
  const product = products.find(p=>p.id===id);
  if(!product) return res.status(404).json({message:"找不到商品"});

  product.status = status;
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products,null,2));
  ogLog(`商品上下架：${product.name} → ${status}`);
  res.json({success:true});
});

app.delete("/api/products/:id", verifyToken, requireAdmin,(req,res)=>{
  const { id } = req.params;
  let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE,"utf8"));
  const index = products.findIndex(p=>p.id===id);
  if(index===-1) return res.status(404).json({message:"找不到商品"});

  const deleted = products.splice(index,1)[0];
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products,null,2));
  ogLog(`刪除商品：${deleted.name}`);
  res.json({success:true});
});

/* ================================================= */
/* ================= 維護模式 ====================== */
/* ================================================= */

app.get("/api/maintenance",(req,res)=>{
  const config = JSON.parse(fs.readFileSync(MAINTENANCE_FILE,"utf8"));
  res.json({maintenance:config.maintenance});
});

app.post("/api/maintenance", verifyToken, requireAdmin,(req,res)=>{
  const { maintenance } = req.body;
  fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({maintenance:!!maintenance},null,2));
  ogLog(`維護模式：${maintenance?"ON":"OFF"}`);
  res.json({message:"維護模式已更新"});
});

/* ================================================= */
/* ================= 公告 ========================== */
/* ================================================= */

app.get("/api/announcement",(req,res)=>{
  const data = JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE,"utf8"));
  res.json({text:data.text || ""});
});

app.post("/api/announcement", verifyToken, requireAdmin,(req,res)=>{
  const { text } = req.body;
  fs.writeFileSync(ANNOUNCEMENT_FILE, JSON.stringify({text},null,2));
  ogLog(`公告更新：${text}`);
  res.json({message:"公告已更新"});
});

/* ================================================= */
/* ================= Logs ========================== */
/* ================================================= */

app.get("/api/logs", verifyToken, requireAdmin,(req,res)=>{
  res.json(logs);
});

/* ================================================= */

app.listen(PORT,"0.0.0.0",()=>{
  console.log(`🚀 Server running at http://0.0.0.0:${PORT}`);
});
